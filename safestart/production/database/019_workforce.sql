BEGIN;

CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_number text NOT NULL,
  full_name text NOT NULL,
  worker_type text NOT NULL DEFAULT 'CONTRACTOR' CHECK (worker_type IN ('EMPLOYEE','CONTRACTOR','VISITOR')),
  employer_name text,
  trade text,
  role_title text,
  phone text,
  email text,
  avatar_url text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, worker_number)
);

CREATE TABLE IF NOT EXISTS worker_project_assignments (
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project_tenants(project_id) ON DELETE CASCADE,
  supervisor_user_id uuid REFERENCES identity_users(id) ON DELETE SET NULL,
  zone text,
  shift_name text,
  assignment_role text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, project_id)
);

CREATE TABLE IF NOT EXISTS worker_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  credential_type text NOT NULL,
  credential_name text NOT NULL,
  credential_number text,
  issued_at date,
  expires_at date,
  status text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','EXPIRING','EXPIRED','REVOKED','PENDING')),
  issuer text,
  evidence_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES project_tenants(project_id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('GUARDIAN_TAG','NFC_BADGE','BLE_TAG')),
  device_identifier text NOT NULL,
  status text NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','UNASSIGNED','LOST','DISABLED')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, device_type, device_identifier)
);

CREATE TABLE IF NOT EXISTS worker_safety_profile (
  worker_id uuid PRIMARY KEY REFERENCES workers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  training_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (training_status IN ('CURRENT','EXPIRING','EXPIRED','UNKNOWN')),
  certification_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (certification_status IN ('CURRENT','EXPIRING','EXPIRED','UNKNOWN')),
  required_ppe jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligibility_status text NOT NULL DEFAULT 'PENDING' CHECK (eligibility_status IN ('ELIGIBLE','PENDING','INELIGIBLE')),
  safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workers_org_idx ON workers(organization_id);
CREATE INDEX IF NOT EXISTS worker_assignments_project_idx ON worker_project_assignments(project_id);
CREATE INDEX IF NOT EXISTS worker_credentials_worker_idx ON worker_credentials(worker_id);
CREATE INDEX IF NOT EXISTS worker_credentials_expiry_idx ON worker_credentials(expires_at);
CREATE INDEX IF NOT EXISTS worker_devices_worker_idx ON worker_devices(worker_id);
CREATE INDEX IF NOT EXISTS worker_devices_project_idx ON worker_devices(project_id);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_safety_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workers_org_isolation ON workers;
CREATE POLICY workers_org_isolation ON workers
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS worker_assignments_org_isolation ON worker_project_assignments;
CREATE POLICY worker_assignments_org_isolation ON worker_project_assignments
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS worker_credentials_org_isolation ON worker_credentials;
CREATE POLICY worker_credentials_org_isolation ON worker_credentials
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS worker_devices_org_isolation ON worker_devices;
CREATE POLICY worker_devices_org_isolation ON worker_devices
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS worker_safety_profile_org_isolation ON worker_safety_profile;
CREATE POLICY worker_safety_profile_org_isolation ON worker_safety_profile
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

COMMIT;
