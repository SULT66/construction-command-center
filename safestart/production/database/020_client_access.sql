BEGIN;

CREATE OR REPLACE FUNCTION safestart_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS identity_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  subject text NOT NULL,
  provider text NOT NULL DEFAULT 'OIDC',
  email_at_login text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS organization_domains (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  PRIMARY KEY (organization_id, domain),
  UNIQUE (domain)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_domains_one_primary
ON organization_domains(organization_id)
WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS organization_auth_policies (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  auth_mode text NOT NULL DEFAULT 'PLATFORM' CHECK (auth_mode IN ('PLATFORM','OIDC','SAML')),
  provider text NOT NULL DEFAULT 'MICROSOFT_ENTRA' CHECK (provider IN ('MICROSOFT_ENTRA','OKTA','GOOGLE','CUSTOM_OIDC','PLATFORM')),
  issuer text,
  client_id text,
  tenant_hint text,
  allow_password boolean NOT NULL DEFAULT false,
  allow_social_login boolean NOT NULL DEFAULT false,
  require_sso boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  organization_role text NOT NULL CHECK (organization_role IN ('ORG_ADMIN','ORG_SAFETY_ADMIN','ORG_VIEWER')),
  invited_by uuid REFERENCES identity_users(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_invitations_org_idx ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON organization_invitations(lower(email));

CREATE TABLE IF NOT EXISTS project_member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project_tenants(project_id) ON DELETE CASCADE,
  email text NOT NULL,
  project_role text NOT NULL CHECK (project_role IN ('PROJECT_MANAGER','SAFETY_MANAGER','SUPERINTENDENT','SUPERVISOR','FOREMAN','WORKER','AUDITOR','PROJECT_ADMIN')),
  is_primary boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES identity_users(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_member_invitations_org_project_idx
ON project_member_invitations(organization_id, project_id);

CREATE TABLE IF NOT EXISTS user_product_preferences (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  last_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  last_project_id uuid REFERENCES project_tenants(project_id) ON DELETE SET NULL,
  theme text NOT NULL DEFAULT 'SYSTEM' CHECK (theme IN ('SYSTEM','LIGHT','DARK')),
  locale text NOT NULL DEFAULT 'en-US',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION safestart_set_request_context(p_organization_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_organization_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'organization and user are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'user is not an active member of organization';
  END IF;

  PERFORM set_config('app.current_org_id', p_organization_id::text, true);
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
END;
$$;

ALTER TABLE organization_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_auth_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_member_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_domains_org_isolation ON organization_domains;
CREATE POLICY organization_domains_org_isolation ON organization_domains
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS organization_auth_policies_org_isolation ON organization_auth_policies;
CREATE POLICY organization_auth_policies_org_isolation ON organization_auth_policies
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS organization_invitations_org_isolation ON organization_invitations;
CREATE POLICY organization_invitations_org_isolation ON organization_invitations
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS project_member_invitations_org_isolation ON project_member_invitations;
CREATE POLICY project_member_invitations_org_isolation ON project_member_invitations
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

COMMIT;
