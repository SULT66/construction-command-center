# InfraScan SafeStart™ P12.1 Pilot Hotfix

This hotfix overlay records fixes discovered during the live Azure end-to-end pilot on 2026-09-04.

Apply it to the verified `SafeStart_P12_Live_Pilot_RC_v1.0` release artifact (ZIP SHA-256 `b471e24e0ac68e0bb898e8b51ceba4fffddc1e8dcd0a60cb6cc357bf008728d3`).

## Fixes

1. **Re-brief version creation order** — copy crew/PPE/hazards/controls before creating the briefing row, so the immutable safety-snapshot trigger does not freeze the new version before copy completes.
2. **No-store read refresh** — SafeStart web GET requests bypass browser cache after writes, preventing stale `Add control` and completion views.
3. **G5 approval UI gate** — `Approve SafeStart` is disabled while required worker acknowledgements are pending.
4. **Completion refresh** — after a successful `complete` command, the UI reloads the authoritative plan and routes to Completed/Compliance.

## Apply

From the root of an extracted P12 RC, run the hotfix script from this Git checkout and pass the extracted P12 directory as the target:

```sh
bash ~/construction-command-center/safestart/releases/p12.1/apply-hotfixes.sh "$PWD"
```

Or apply the patches directly from the checkout:

```sh
patch -p1 < ~/construction-command-center/safestart/releases/p12.1/patches/001-rebrief-order.patch
patch -p1 < ~/construction-command-center/safestart/releases/p12.1/patches/002-ui-state-refresh.patch
```

## Validate

```sh
bash ~/construction-command-center/safestart/releases/p12.1/validate-hotfix.sh "$PWD"
```

## Live E2E acceptance observed

`Create → Hazard → Control → Briefing → Guardian TAG acknowledgement → Approve → Active → Pause → v2 → Re-brief → TAG re-acknowledgement → Approve → manual Active → Complete → Compliance`

Safety invariants remain unchanged: BLE presence is not acknowledgement; AI/devices cannot approve/activate/resume; direct `PAUSED → ACTIVE` is blocked; no automatic resume is allowed.
