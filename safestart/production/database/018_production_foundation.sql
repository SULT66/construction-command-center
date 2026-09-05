BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text,
  subject text,
  email text,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (issuer, subject)
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ORG_ADMIN','ORG_SAFETY_ADMIN','ORG_VIEWER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, role)
);

-- Existing SafeStart project UUIDs are referenced without assuming a pilot table name.
-- The production API owns validation that project_id belongs to the organization.
CREATE TABLE IF NOT EXISTS project_tenants (
  project_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  project_code text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  site_zip text,
  timezone text,
  worker_card_mode text NOT NULL DEFAULT 'PRODUCTION' CHECK (worker_card_mode IN ('MINIMAL','PRODUCTION')),
  safestart_profile text NOT NULL DEFAULT 'NFC' CHECK (safestart_profile IN ('NFC','CONNECTED')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id uuid NOT NULL REFERENCES project_tenants(project_id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'PROJECT_MANAGER','SAFETY_MANAGER','SUPERINTENDENT','SUPERVISOR','FOREMAN','WORKER','AUDITOR','PROJECT_ADMIN'
  )),
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id, role)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_one_primary_pm
ON project_members(project_id)
WHERE role = 'PROJECT_MANAGER' AND is_primary = true AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS project_members_org_idx ON project_members(organization_id);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id);
CREATE INDEX IF NOT EXISTS project_tenants_org_idx ON project_tenants(organization_id);

CREATE OR REPLACE FUNCTION safestart_current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
$$;

ALTER TABLE project_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_tenants_org_isolation ON project_tenants;
CREATE POLICY project_tenants_org_isolation ON project_tenants
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS project_members_org_isolation ON project_members;
CREATE POLICY project_members_org_isolation ON project_members
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS organization_members_org_isolation ON organization_members;
CREATE POLICY organization_members_org_isolation ON organization_members
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

COMMIT;
