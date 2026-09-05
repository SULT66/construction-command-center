# InfraScan SafeStart™ — Live Pilot

SafeStart is the Dynamic Pre-Task Planning & Risk Control module for InfraScan Construction OS.

## Pilot workflow

Create Plan → AI Hazard Suggestions → Human Review → Briefing → Guardian/TAG Acknowledgement → Approve → Active → Edge Condition Change → Pause → Reassessment → New Version → Re-Brief → Re-Acknowledge → Manual Resume → Complete → Compliance PDF.

## Safety invariants

- AI may suggest hazards and controls but may not Approve, Activate or Resume work.
- A device may submit observations but may not directly set a SafeStart plan status.
- `Paused → Active` is never automatic. A new SafeStart version, re-brief, new acknowledgements and approval are required.
- BLE presence is not worker acknowledgement.
- High-assurance DESFire acknowledgement remains disabled until cryptographic verification is implemented and validated against production credentials.
- Status changes are server-side commands with audit events and optimistic concurrency.

## Target pilot stack

- PostgreSQL 16
- Node.js 20+ pilot API
- Nginx web entrypoint
- Guardian TAG / BLE Station device bridge
- Edge Gateway Dynamic Conditions bridge
- SafeStart web console

## Git strategy

The original repository root `index.html` is retained as the legacy Construction Command Center prototype. SafeStart lives under `/safestart` during pilot integration.

Current working branch: `feature/safestart-live-pilot`.

## Live bring-up dependencies

Before field activation the environment must provide:

1. PostgreSQL connection string and durable storage.
2. HTTPS hostname/certificate.
3. InfraScan identity/SSO mapping to SafeStart roles.
4. Project/site/zone identifiers.
5. Guardian TAG assignment and BLE Station registry.
6. Edge Gateway identity and signed device key.
7. Approved site-specific Dynamic Conditions policy and thresholds.

Do not use the pilot to authorize safety-critical work until the field acceptance checklist has passed with real site hardware and responsible safety personnel.