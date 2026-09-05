BEGIN;

-- Bootstrap the existing InfraScan pilot into the production tenant model.
-- This migration is intentionally additive and does not modify pilot SafeStart rows.

INSERT INTO organizations (
  id, slug, name, status, branding, settings
)
VALUES (
  '00000000-0000-4000-9000-000000000001',
  'infrascan-internal',
  'InfraScan Internal',
  'ACTIVE',
  '{"productName":"InfraScan SafeStart","companyName":"InfraScan.ai"}'::jsonb,
  '{"environment":"internal","customerFacing":false}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    branding = organizations.branding || EXCLUDED.branding,
    settings = organizations.settings || EXCLUDED.settings,
    updated_at = now();

INSERT INTO project_tenants (
  project_id,
  organization_id,
  project_name,
  project_code,
  status,
  site_zip,
  timezone,
  worker_card_mode,
  safestart_profile,
  settings
)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-9000-000000000001',
  'SafeStart Internal Pilot',
  'INTERNAL-PILOT',
  'ACTIVE',
  '11201',
  'America/New_York',
  'PRODUCTION',
  'NFC',
  '{"source":"existing-pilot","productionMigration":"023"}'::jsonb
)
ON CONFLICT (project_id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    project_name = EXCLUDED.project_name,
    project_code = EXCLUDED.project_code,
    status = EXCLUDED.status,
    site_zip = COALESCE(project_tenants.site_zip, EXCLUDED.site_zip),
    timezone = COALESCE(project_tenants.timezone, EXCLUDED.timezone),
    worker_card_mode = 'PRODUCTION',
    updated_at = now();

INSERT INTO organization_auth_policies (
  organization_id,
  auth_mode,
  provider,
  allow_password,
  allow_social_login,
  require_sso,
  settings
)
VALUES (
  '00000000-0000-4000-9000-000000000001',
  'OIDC',
  'MICROSOFT_ENTRA',
  false,
  false,
  true,
  '{"bootstrap":"azure-easy-auth"}'::jsonb
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO organization_domains (
  organization_id,
  domain,
  is_primary,
  is_verified,
  verified_at
)
VALUES (
  '00000000-0000-4000-9000-000000000001',
  'infrascan.ai',
  true,
  true,
  now()
)
ON CONFLICT (organization_id, domain) DO NOTHING;

COMMIT;
