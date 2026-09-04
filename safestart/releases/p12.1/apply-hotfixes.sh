#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
cd "$ROOT"
patch -p1 < safestart/releases/p12.1/patches/001-rebrief-order.patch
patch -p1 < safestart/releases/p12.1/patches/002-ui-state-refresh.patch
node --check deploy/full-web/app.js
node --check vendor/p3-backend/dist/persistence/postgres/postgres-safestart-api-repository.js
echo "SafeStart P12.1 hotfix applied and syntax-validated."
