BEGIN;

CREATE TABLE IF NOT EXISTS hazard_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  default_severity text NOT NULL DEFAULT 'MEDIUM' CHECK (default_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS control_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  verification_required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS hazard_control_defaults (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hazard_id uuid NOT NULL REFERENCES hazard_catalog(id) ON DELETE CASCADE,
  control_id uuid NOT NULL REFERENCES control_library(id) ON DELETE CASCADE,
  is_recommended boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, hazard_id, control_id)
);

CREATE TABLE IF NOT EXISTS ppe_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS project_ppe_defaults (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project_tenants(project_id) ON DELETE CASCADE,
  ppe_id uuid NOT NULL REFERENCES ppe_catalog(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, ppe_id)
);

CREATE TABLE IF NOT EXISTS client_ui_configuration (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  product_name text NOT NULL DEFAULT 'InfraScan SafeStart',
  logo_url text,
  accent_color text,
  support_email text,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hazard_catalog_org_idx ON hazard_catalog(organization_id);
CREATE INDEX IF NOT EXISTS control_library_org_idx ON control_library(organization_id);
CREATE INDEX IF NOT EXISTS ppe_catalog_org_idx ON ppe_catalog(organization_id);

ALTER TABLE hazard_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_control_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppe_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_ppe_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_ui_configuration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hazard_catalog_org_isolation ON hazard_catalog;
CREATE POLICY hazard_catalog_org_isolation ON hazard_catalog
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS control_library_org_isolation ON control_library;
CREATE POLICY control_library_org_isolation ON control_library
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS hazard_control_defaults_org_isolation ON hazard_control_defaults;
CREATE POLICY hazard_control_defaults_org_isolation ON hazard_control_defaults
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS ppe_catalog_org_isolation ON ppe_catalog;
CREATE POLICY ppe_catalog_org_isolation ON ppe_catalog
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS project_ppe_defaults_org_isolation ON project_ppe_defaults;
CREATE POLICY project_ppe_defaults_org_isolation ON project_ppe_defaults
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

DROP POLICY IF EXISTS client_ui_configuration_org_isolation ON client_ui_configuration;
CREATE POLICY client_ui_configuration_org_isolation ON client_ui_configuration
  USING (organization_id = safestart_current_org_id())
  WITH CHECK (organization_id = safestart_current_org_id());

COMMIT;
