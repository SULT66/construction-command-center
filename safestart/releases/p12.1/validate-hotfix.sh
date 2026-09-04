#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
cd "$ROOT"
node --check deploy/full-web/app.js
node --check vendor/p3-backend/dist/persistence/postgres/postgres-safestart-api-repository.js
grep -q "cache:'no-store'" deploy/full-web/app.js
grep -q "Complete all required worker acknowledgements first" deploy/full-web/app.js
grep -q "showToast('Work completed')" deploy/full-web/app.js
python3 - <<'PY'
from pathlib import Path
s=Path('vendor/p3-backend/dist/persistence/postgres/postgres-safestart-api-repository.js').read_text()
start=s.index('async createRebriefVersion')
end=s.index('async loadGateInput', start)
body=s[start:end]
assert body.index('INSERT INTO safe_start_plan_workers') < body.index('INSERT INTO safe_start_briefings')
assert body.index('INSERT INTO safe_start_ppe') < body.index('INSERT INTO safe_start_briefings')
assert body.index('INSERT INTO safe_start_controls') < body.index('INSERT INTO safe_start_briefings')
print('Re-brief copy-before-freeze order: PASS')
PY
echo "SafeStart P12.1 hotfix validation: PASS"
