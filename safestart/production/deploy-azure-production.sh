#!/usr/bin/env bash
set -euo pipefail

RG="${RG:-InfraScanAI-RG}"
PLAN="${PLAN:-ASP-InfraScanAI}"
SOURCE_API_APP="${SOURCE_API_APP:-infrascan-safestart-api}"
PROD_API_APP="${PROD_API_APP:-infrascan-safestart-prod-api}"
PROD_WEB_APP="${PROD_WEB_APP:-infrascan-safestart-prod-web}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for cmd in az zip npm curl openssl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required" >&2; exit 1; }
done

az account show >/dev/null

DATABASE_URL="$(az webapp config appsettings list \
  -g "$RG" -n "$SOURCE_API_APP" \
  --query "[?name=='DATABASE_URL'].value | [0]" -o tsv)"
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL could not be read from $SOURCE_API_APP" >&2
  exit 1
fi

PROXY_KEY="$(openssl rand -hex 32)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

ensure_app() {
  local app="$1"
  if az webapp show -g "$RG" -n "$app" >/dev/null 2>&1; then
    echo "APP_EXISTS=$app"
  else
    echo "CREATE_APP=$app"
    az webapp create \
      --resource-group "$RG" \
      --plan "$PLAN" \
      --name "$app" \
      --runtime "NODE:22-lts" \
      --https-only true \
      --output none
  fi
  az webapp config set -g "$RG" -n "$app" --startup-file "npm start" --output none
  az webapp update -g "$RG" -n "$app" --https-only true --output none
}

ensure_app "$PROD_API_APP"
ensure_app "$PROD_WEB_APP"

API_ORIGIN="https://${PROD_API_APP}.azurewebsites.net"
WEB_ORIGIN="https://${PROD_WEB_APP}.azurewebsites.net"

# Do not print secret values. Both apps receive the same generated proxy key.
az webapp config appsettings set -g "$RG" -n "$PROD_API_APP" --settings \
  DATABASE_URL="$DATABASE_URL" \
  SAFESTART_PROXY_KEY="$PROXY_KEY" \
  NODE_ENV=production \
  --output none

az webapp config appsettings set -g "$RG" -n "$PROD_WEB_APP" --settings \
  SAFESTART_API_ORIGIN="$API_ORIGIN" \
  SAFESTART_PROXY_KEY="$PROXY_KEY" \
  NODE_ENV=production \
  --output none

mkdir -p "$WORKDIR/api" "$WORKDIR/web"
cp -R "$ROOT/api/." "$WORKDIR/api/"
cp -R "$ROOT/web/." "$WORKDIR/web/"

(
  cd "$WORKDIR/api"
  npm install --omit=dev --no-audit --no-fund >/dev/null
  zip -qr "$WORKDIR/api.zip" .
)

(
  cd "$WORKDIR/web"
  zip -qr "$WORKDIR/web.zip" .
)

echo "DEPLOY_API=$PROD_API_APP"
az webapp deploy -g "$RG" -n "$PROD_API_APP" \
  --src-path "$WORKDIR/api.zip" --type zip --clean true --restart true --output none

echo "DEPLOY_WEB=$PROD_WEB_APP"
az webapp deploy -g "$RG" -n "$PROD_WEB_APP" \
  --src-path "$WORKDIR/web.zip" --type zip --clean true --restart true --output none

wait_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 36); do
    code="$(curl -sS -o /tmp/safestart-health.$$ -w '%{http_code}' "$url" || true)"
    if [ "$code" = "200" ]; then
      echo "$label=OK"
      rm -f /tmp/safestart-health.$$
      return 0
    fi
    sleep 5
  done
  echo "ERROR: $label did not become healthy: $url" >&2
  rm -f /tmp/safestart-health.$$
  return 1
}

wait_http "$API_ORIGIN/healthz" "PROD_API_HEALTH"
wait_http "$API_ORIGIN/readyz" "PROD_API_DATABASE"
wait_http "$WEB_ORIGIN/healthz" "PROD_WEB_HEALTH"

# Public callers must not be able to use production API routes directly.
DIRECT_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$API_ORIGIN/api/v1/session" || true)"
if [ "$DIRECT_CODE" != "403" ]; then
  echo "ERROR: production API trust boundary check returned HTTP $DIRECT_CODE, expected 403" >&2
  exit 1
fi
echo "PROD_API_PROXY_BOUNDARY=OK"

echo "PRODUCTION_AZURE_FOUNDATION_READY"
echo "PROD_WEB_URL=$WEB_ORIGIN"
echo "PROD_API_URL=$API_ORIGIN"
echo "NEXT=Configure Microsoft Entra Easy Auth on production web app"
