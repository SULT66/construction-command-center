#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"

ORG_ID="${ORG_ID:-00000000-0000-4000-9000-000000000001}"
INVITE_DAYS="${INVITE_DAYS:-7}"

if ! [[ "$INVITE_DAYS" =~ ^[0-9]+$ ]] || [ "$INVITE_DAYS" -lt 1 ] || [ "$INVITE_DAYS" -gt 30 ]; then
  echo "ERROR: INVITE_DAYS must be an integer from 1 to 30" >&2
  exit 1
fi

EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"

# Azure CLI may represent a personal Microsoft account as, for example,
# live.com#person@example.com. Easy Auth/OIDC normally supplies the actual
# email/username, so store the canonical email address in the invitation.
if [[ "$EMAIL" == *#*@*.* ]]; then
  EMAIL="${EMAIL#*#}"
fi

if [[ "$EMAIL" != *@*.* || "$EMAIL" == *#* ]]; then
  echo "ERROR: ADMIN_EMAIL does not look like a canonical email address" >&2
  exit 1
fi

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql is required" >&2; exit 1; }

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v org_id="$ORG_ID" \
  -v admin_email="$EMAIL" \
  -v invite_days="$INVITE_DAYS" <<'SQL'
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = :'org_id'::uuid AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Organization % is missing or inactive', :'org_id';
  END IF;
END $$;

UPDATE organization_invitations
   SET revoked_at = now()
 WHERE organization_id = :'org_id'::uuid
   AND lower(email) = lower(:'admin_email')
   AND accepted_at IS NULL
   AND revoked_at IS NULL;

INSERT INTO organization_invitations (
  organization_id,
  email,
  organization_role,
  token_hash,
  expires_at
)
VALUES (
  :'org_id'::uuid,
  lower(:'admin_email'),
  'ORG_ADMIN',
  encode(digest(gen_random_uuid()::text || clock_timestamp()::text || :'admin_email', 'sha256'), 'hex'),
  now() + make_interval(days => :'invite_days'::int)
);

COMMIT;

SELECT o.name AS organization,
       i.email,
       i.organization_role,
       i.expires_at,
       CASE WHEN i.accepted_at IS NULL AND i.revoked_at IS NULL THEN 'READY' ELSE 'NOT_READY' END AS status
FROM organization_invitations i
JOIN organizations o ON o.id = i.organization_id
WHERE i.organization_id = :'org_id'::uuid
  AND lower(i.email) = lower(:'admin_email')
ORDER BY i.created_at DESC
LIMIT 1;
SQL

echo "INTERNAL_ADMIN_INVITATION_READY=$EMAIL"
