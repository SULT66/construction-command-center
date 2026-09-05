export async function resolveUserFromVerifiedClaims(client, claims) {
  const issuer = claims?.iss;
  const subject = claims?.sub;
  const email = claims?.email || claims?.preferred_username || null;
  const fullName = claims?.name || email || 'SafeStart User';

  if (!issuer || !subject) {
    throw Object.assign(new Error('Verified OIDC claims must include iss and sub'), { statusCode: 401 });
  }

  try {
    const result = await client.query(
      `SELECT user_id AS id, email, full_name, status
         FROM safestart_resolve_invited_identity($1, $2, $3, $4)`,
      [issuer, subject, email, fullName]
    );

    if (result.rowCount !== 1) {
      throw new Error('Identity resolution failed');
    }

    return result.rows[0];
  } catch (error) {
    if (/invitation|identity|active/i.test(error.message || '')) {
      throw Object.assign(new Error(error.message), { statusCode: 403 });
    }
    throw error;
  }
}

export async function listOrganizationsForUser(client, userId) {
  const result = await client.query(
    `SELECT organization_id AS id,
            slug,
            organization_name AS name,
            branding,
            settings,
            roles
       FROM safestart_list_user_organizations($1)`,
    [userId]
  );
  return result.rows;
}

export async function selectOrganization(client, userId, organizationId) {
  await client.query('SELECT safestart_set_request_context($1, $2)', [organizationId, userId]);

  const membership = await client.query(
    `SELECT role
       FROM organization_members
      WHERE organization_id = $1 AND user_id = $2 AND status = 'ACTIVE'
      ORDER BY role`,
    [organizationId, userId]
  );

  if (membership.rowCount === 0) {
    throw Object.assign(new Error('Organization access denied'), { statusCode: 403 });
  }

  const projects = await client.query(
    `SELECT p.project_id, p.project_name, p.project_code, p.site_zip, p.timezone,
            p.worker_card_mode, p.safestart_profile,
            COALESCE(array_agg(pm.role) FILTER (WHERE pm.role IS NOT NULL), '{}') AS project_roles
       FROM project_tenants p
       LEFT JOIN project_members pm
         ON pm.project_id = p.project_id
        AND pm.user_id = $2
        AND pm.status = 'ACTIVE'
      WHERE p.organization_id = $1
        AND p.status = 'ACTIVE'
        AND (
          EXISTS (
            SELECT 1 FROM organization_members om
             WHERE om.organization_id = $1
               AND om.user_id = $2
               AND om.status = 'ACTIVE'
               AND om.role IN ('ORG_ADMIN','ORG_SAFETY_ADMIN','ORG_VIEWER')
          )
          OR pm.user_id IS NOT NULL
        )
      GROUP BY p.project_id, p.project_name, p.project_code, p.site_zip, p.timezone,
               p.worker_card_mode, p.safestart_profile
      ORDER BY p.project_name`,
    [organizationId, userId]
  );

  return {
    organizationId,
    organizationRoles: membership.rows.map(r => r.role),
    projects: projects.rows
  };
}
