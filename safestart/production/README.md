# InfraScan SafeStart™ v1.0 Production

This directory is the production product line for customer deployments. Pilot-only UI, bearer-token setup, hard-coded users, browser-local project settings, raw UUID-first workflows, and demo sensor values are not part of the customer product.

## Product boundary

SafeStart v1.0 Production includes:

- Multi-tenant Organizations
- Projects and Project Settings
- Users, Team & Access, RBAC
- Workforce Database and Worker Cards
- Hazard / Control / PPE libraries
- SafeStart plan lifecycle and safety gates
- Guardian TAG / NFC acknowledgement
- Optional BLE + Edge live conditions
- Reports, compliance records, PDF/CSV exports
- Immutable audit trail
- Client branding and configuration

## Customer experience

Login → Organization → Project → Dashboard → SafeStart / Workforce / Reports / Settings.

Customers never enter project UUIDs or pilot bearer tokens.

## Worker Card

`PRODUCTION` is the default worker-card mode for every new project. A project administrator may switch a project to `MINIMAL`; this changes presentation only and never deletes worker data.

## Core safety invariants

1. Every active hazard must have at least one active control.
2. A required control must be verified before briefing completion.
3. Worker acknowledgement is bound to the exact SafeStart version.
4. All required acknowledgements are required before approval.
5. Approval never auto-activates work.
6. `PAUSED → ACTIVE` direct transition is forbidden.
7. Changed conditions require reassessment, a new version, re-brief and new acknowledgements.
8. Sensor normalization never resumes work automatically.
9. AI may assist but may not approve, activate, resume or close critical hazards.
10. BLE presence is not worker acknowledgement.
11. Safety-critical actions must be server-authorized and audited.
12. Completed compliance records are immutable.

## Production implementation phases

### P0 — Production Foundation
Organizations, tenant isolation, users, projects, project memberships, roles and project settings.

### P1 — Workforce
Workers, project assignments, Production/Minimal Worker Cards, credentials, training/certifications and Guardian device assignments.

### P2 — Project Configuration
Team & Access, client terminology/branding, Hazard/Control/PPE libraries, SafeStart profile (`NFC` or `CONNECTED`).

### P3 — SafeStart Workflow
Move the proven safety engine into production routes and remove pilot-local state from customer UX.

### P4 — Identity
OIDC/SSO, Microsoft Entra ID first, server sessions and RBAC enforcement.

### P5 — Reports & Compliance
Reports center, event drill-down, worker history, immutable compliance record, PDF and CSV export.

### P6 — Guardian
NFC/TAG first; BLE Station and Edge Gateway optional by deployment profile.

### P7 — Client Configuration
Per-organization branding, terminology, catalogs, policies and integrations without code forks.

### P8 — Production Acceptance
Security review, tenant-isolation tests, regression suite and release E2E.

## Internal E2E release test

E2E is an InfraScan QA/release process, not a customer-facing feature:

Create → Crew → Hazard → Control → PPE → Briefing → Verify → Worker Ack → Approve → Manual Activate → Pause → v2 → Re-brief → Re-ack → Re-approve → Manual Activate → Complete → Compliance.

## Branch

Production development branch: `feature/safestart-production-v1`.

Pilot remains isolated on `feature/safestart-live-pilot` until production cutover is accepted.