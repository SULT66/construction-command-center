#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_PG_PASSWORD:?ADMIN_PG_PASSWORD is required in the current shell}"

HOST="${SAFESTART_DB_HOST:-infrascan-shared-postgres.postgres.database.azure.com}"
PORT="${SAFESTART_DB_PORT:-5432}"
DB="${SAFESTART_DB_NAME:-safestart_db}"
ADMIN_USER="${SAFESTART_DB_ADMIN_USER:-infrascan_admin}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
B64="$HERE/safestart_schema_p12.sql.gz.b64"
TMP_GZ="$(mktemp /tmp/safestart-p12-schema.XXXXXX.sql.gz)"
TMP_SQL="$(mktemp /tmp/safestart-p12-schema.XXXXXX.sql)"
trap 'rm -f "$TMP_GZ" "$TMP_SQL"' EXIT

EXPECTED_GZ_SHA256="75c32e462184e4eefef84e9a64bc89e156823f9c254a9c82a8567f3bc79d7a55"
EXPECTED_SQL_SHA256="863ce9894bd4c33df743380fdcbed1836a19c0f34b896498c7ad733a572be351"

tr -d '\n\r' < "$B64" | base64 -d > "$TMP_GZ"
ACTUAL_GZ_SHA256="$(sha256sum "$TMP_GZ" | awk '{print $1}')"
[ "$ACTUAL_GZ_SHA256" = "$EXPECTED_GZ_SHA256" ] || {
  echo "ERROR: compressed schema SHA-256 mismatch" >&2
  echo "expected: $EXPECTED_GZ_SHA256" >&2
  echo "actual:   $ACTUAL_GZ_SHA256" >&2
  exit 1
}

gzip -dc "$TMP_GZ" > "$TMP_SQL"
ACTUAL_SQL_SHA256="$(sha256sum "$TMP_SQL" | awk '{print $1}')"
[ "$ACTUAL_SQL_SHA256" = "$EXPECTED_SQL_SHA256" ] || {
  echo "ERROR: SQL schema SHA-256 mismatch" >&2
  echo "expected: $EXPECTED_SQL_SHA256" >&2
  echo "actual:   $ACTUAL_SQL_SHA256" >&2
  exit 1
}

echo "SafeStart P12 schema verified."
echo "SQL SHA-256: $ACTUAL_SQL_SHA256"
echo "Target: $HOST:$PORT/$DB as $ADMIN_USER"

PGPASSWORD="$ADMIN_PG_PASSWORD" psql \
  "host=$HOST port=$PORT dbname=$DB user=$ADMIN_USER sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f "$TMP_SQL"

echo "SafeStart P12 schema migration completed."

PGPASSWORD="$ADMIN_PG_PASSWORD" psql \
  "host=$HOST port=$PORT dbname=$DB user=$ADMIN_USER sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS safestart_tables FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'safe_start_%' OR tablename LIKE 'safestart_%' OR tablename LIKE 'guardian_%' OR tablename LIKE 'edge_%' OR tablename LIKE 'pilot_%');"
