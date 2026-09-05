#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/safestart-backups}"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/safestart_pre_production_${STAMP}.dump"

for cmd in psql pg_dump; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required" >&2; exit 1; }
done

echo "=== PRE-MIGRATION DATABASE BACKUP ==="
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "$BACKUP"
test -s "$BACKUP"
echo "BACKUP_OK=$BACKUP"

echo "=== APPLY SAFESTART PRODUCTION MIGRATIONS ==="
for migration in \
  018_production_foundation.sql \
  019_workforce.sql \
  020_client_access.sql \
  021_client_configuration.sql \
  022_identity_bootstrap.sql \
  023_internal_tenant_seed.sql
do
  echo "APPLY $migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/$migration"
done

echo "=== VERIFY PRODUCTION FOUNDATION ==="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE WHEN to_regclass('public.organizations') IS NOT NULL THEN 'organizations:OK' ELSE 'organizations:MISSING' END;
SELECT CASE WHEN to_regclass('public.project_tenants') IS NOT NULL THEN 'project_tenants:OK' ELSE 'project_tenants:MISSING' END;
SELECT CASE WHEN to_regclass('public.workers') IS NOT NULL THEN 'workers:OK' ELSE 'workers:MISSING' END;
SELECT CASE WHEN to_regclass('public.organization_members') IS NOT NULL THEN 'organization_members:OK' ELSE 'organization_members:MISSING' END;
SELECT CASE WHEN to_regclass('public.organization_auth_policies') IS NOT NULL THEN 'organization_auth_policies:OK' ELSE 'organization_auth_policies:MISSING' END;
SELECT CASE WHEN to_regclass('public.worker_devices') IS NOT NULL THEN 'worker_devices:OK' ELSE 'worker_devices:MISSING' END;

SELECT o.slug, o.name, p.project_id, p.project_name, p.worker_card_mode, p.safestart_profile
FROM organizations o
JOIN project_tenants p ON p.organization_id = o.id
WHERE o.id = '00000000-0000-4000-9000-000000000001'::uuid
  AND p.project_id = '00000000-0000-4000-8000-000000000201'::uuid;
SQL

echo "PRODUCTION_MIGRATIONS_COMPLETE"
