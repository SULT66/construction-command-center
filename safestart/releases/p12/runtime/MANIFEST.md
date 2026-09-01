# InfraScan SafeStart™ P12 Runtime Manifest

This directory preserves the compact P12 live-pilot runtime as a reproducible compressed source artifact.

## Artifact

- Archive name after reconstruction: `safestart-runtime-p12.tar.gz`
- Archive size: `59,009 bytes`
- SHA-256: `f04f53b238aa3a44562e1df8b65845a0ea8068432d2a7af30f5fe91f3f2571d9`
- Base64 payload length: `78,680 characters`
- Parts: `14`
- Expanded compact runtime files: `39`

## Contents

The compact runtime contains the deployable pilot components selected from the validated P12 release candidate:

- SafeStart API / command workflow
- PostgreSQL pilot schema
- authentication / RBAC production boundaries
- Guardian TAG / BLE Station signed device bridge
- Edge Gateway dynamic-condition policy integration
- AI hazard-assist runtime
- compliance/PDF runtime
- API-connected field web UI
- Docker / nginx / deployment scripts
- preflight, bring-up and rollback tooling
- pilot documentation and tests

Historical generated artifacts, rendered screenshots, duplicate vendor trees and intermediate P0–P11 packaging outputs are intentionally excluded from this compact runtime.

## Restore

From this directory:

```sh
chmod +x unpack.sh
./unpack.sh
```

Or reconstruct manually:

```sh
cat part-*.b64 | tr -d '\n\r' | base64 -d > safestart-runtime-p12.tar.gz
printf '%s  %s\n' \
  'f04f53b238aa3a44562e1df8b65845a0ea8068432d2a7af30f5fe91f3f2571d9' \
  'safestart-runtime-p12.tar.gz' | sha256sum -c -
mkdir -p extracted
tar -xzf safestart-runtime-p12.tar.gz -C extracted
```

## Safety status

This is a **release candidate for a controlled pilot**, not proof of a live production deployment.

The following invariants remain mandatory:

1. AI cannot Approve, Activate or Resume work.
2. BLE presence is not worker acknowledgement.
3. Devices submit observations; they do not directly set arbitrary SafeStart state.
4. `Paused → Active` is never automatic. Reassessment, a new plan version, re-brief, new acknowledgements and approval are required.
5. High-assurance DESFire acknowledgement remains disabled until real cryptographic verification is connected and field-tested.
6. Site-specific dynamic-condition thresholds must be approved by responsible safety/engineering personnel.

Do not merge/use for field production until the real PostgreSQL, HTTPS, InfraScan identity mapping and physical-device field acceptance checks have passed.
