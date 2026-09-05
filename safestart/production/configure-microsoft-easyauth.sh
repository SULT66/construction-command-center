#!/usr/bin/env bash
set -euo pipefail

RG="${RG:-InfraScanAI-RG}"
PROD_WEB_APP="${PROD_WEB_APP:-infrascan-safestart-prod-web}"
APP_DISPLAY_NAME="${APP_DISPLAY_NAME:-InfraScan SafeStart Production}"
SECRET_SETTING="MICROSOFT_PROVIDER_AUTHENTICATION_SECRET"

for cmd in az curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required" >&2; exit 1; }
done

az account show >/dev/null

if ! az extension show --name authV2 >/dev/null 2>&1; then
  echo "INSTALL_AUTHV2_EXTENSION"
  az extension add --name authV2 --only-show-errors >/dev/null
fi

WEB_ORIGIN="https://${PROD_WEB_APP}.azurewebsites.net"
CALLBACK_URI="${WEB_ORIGIN}/.auth/login/aad/callback"

CLIENT_ID="$(az ad app list --display-name "$APP_DISPLAY_NAME" --query '[0].appId' -o tsv 2>/dev/null || true)"
OBJECT_ID="$(az ad app list --display-name "$APP_DISPLAY_NAME" --query '[0].id' -o tsv 2>/dev/null || true)"

if [ -z "$CLIENT_ID" ] || [ -z "$OBJECT_ID" ]; then
  echo "CREATE_ENTRA_APP_REGISTRATION=$APP_DISPLAY_NAME"
  APP_JSON="$(az ad app create \
    --display-name "$APP_DISPLAY_NAME" \
    --sign-in-audience AzureADandPersonalMicrosoftAccount \
    --web-redirect-uris "$CALLBACK_URI" \
    --query '{appId:appId,id:id}' -o json)"
  CLIENT_ID="$(printf '%s' "$APP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["appId"])')"
  OBJECT_ID="$(printf '%s' "$APP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
else
  echo "ENTRA_APP_REGISTRATION_EXISTS=$APP_DISPLAY_NAME"
  az ad app update --id "$OBJECT_ID" \
    --set signInAudience=AzureADandPersonalMicrosoftAccount \
    --web-redirect-uris "$CALLBACK_URI" \
    --only-show-errors >/dev/null
fi

if ! az ad sp show --id "$CLIENT_ID" >/dev/null 2>&1; then
  echo "CREATE_SERVICE_PRINCIPAL"
  az ad sp create --id "$CLIENT_ID" --only-show-errors >/dev/null
fi

# Newly created Linux apps may still expose an Auth v1/classic config object.
# Upgrade it before using authV2 provider commands.
echo "UPGRADE_APP_SERVICE_AUTH_TO_V2"
az webapp auth config-version upgrade \
  -g "$RG" -n "$PROD_WEB_APP" \
  --only-show-errors >/dev/null || true

# Reuse an already-created secret from a previous partial run. This avoids
# appending unnecessary Entra credentials when the script is safely rerun.
EXISTING_SECRET="$(az webapp config appsettings list \
  -g "$RG" -n "$PROD_WEB_APP" \
  --query "[?name=='$SECRET_SETTING'].value | [0]" -o tsv 2>/dev/null || true)"

if [ -z "$EXISTING_SECRET" ]; then
  SECRET="$(az ad app credential reset \
    --id "$OBJECT_ID" \
    --append \
    --display-name "SafeStart Easy Auth" \
    --years 1 \
    --query password -o tsv)"

  if [ -z "$SECRET" ]; then
    echo "ERROR: could not create Entra application credential" >&2
    exit 1
  fi

  az webapp config appsettings set \
    -g "$RG" -n "$PROD_WEB_APP" \
    --settings "$SECRET_SETTING=$SECRET" \
    --output none
  unset SECRET
  echo "ENTRA_CLIENT_SECRET=CREATED"
else
  echo "ENTRA_CLIENT_SECRET=REUSED"
fi
unset EXISTING_SECRET

az webapp auth microsoft update \
  -g "$RG" -n "$PROD_WEB_APP" \
  --client-id "$CLIENT_ID" \
  --client-secret-setting-name "$SECRET_SETTING" \
  --issuer "https://login.microsoftonline.com/common/v2.0" \
  --yes \
  --only-show-errors >/dev/null

az webapp auth update \
  -g "$RG" -n "$PROD_WEB_APP" \
  --enabled true \
  --unauthenticated-client-action AllowAnonymous \
  --require-https true \
  --enable-token-store true \
  --only-show-errors >/dev/null

AUTH_ENABLED="$(az webapp auth show -g "$RG" -n "$PROD_WEB_APP" --query enabled -o tsv)"
PROVIDER_CLIENT_ID="$(az webapp auth microsoft show -g "$RG" -n "$PROD_WEB_APP" --query registration.clientId -o tsv 2>/dev/null || true)"

if [ "$AUTH_ENABLED" != "true" ] && [ "$AUTH_ENABLED" != "True" ]; then
  echo "ERROR: App Service authentication is not enabled" >&2
  exit 1
fi
if [ "$PROVIDER_CLIENT_ID" != "$CLIENT_ID" ]; then
  echo "ERROR: Microsoft provider client ID verification failed" >&2
  exit 1
fi

ROOT_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_ORIGIN/" || true)"
LOGIN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_ORIGIN/.auth/login/aad?post_login_redirect_uri=%2F" || true)"

if [ "$ROOT_CODE" != "200" ]; then
  echo "ERROR: production web root returned HTTP $ROOT_CODE, expected 200" >&2
  exit 1
fi
case "$LOGIN_CODE" in
  301|302|303|307|308) ;;
  *) echo "ERROR: Microsoft login endpoint returned HTTP $LOGIN_CODE, expected redirect" >&2; exit 1 ;;
esac

echo "MICROSOFT_EASY_AUTH=OK"
echo "LOGIN_SHELL=OK"
echo "MICROSOFT_LOGIN_ENDPOINT=OK"
echo "ENTRA_CLIENT_ID=$CLIENT_ID"
echo "PRODUCTION_LOGIN_READY"
echo "OPEN=$WEB_ORIGIN"
