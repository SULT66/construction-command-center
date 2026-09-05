export async function resolveUserFromVerifiedClaims(client, claims) {
  const issuer = claims?.iss;
  const subject = claims?.sub;
  const email = claims?.email || claims?.preferred_username || null;
  const fullName = claims?.name || email || 'SafeStart User';

  if (!issuer || !subject) {
    throw Object.assign(new Error('Verified OIDC claims must include iss and sub'), { statusCode: 401 });
  }

  const login = await client.query(
    `SELECT u.id, u.email, u.full_name, u.status
       FROM identity_logins l
       JOIN identity_users u ON u.id = l.user_id
      WHERE l.issuer = $1 AND l.subject = $2`,
    [issuer, subject]
  );

  if (login.rowCount === 1) {
    const user = login.rows[0];
    if (user.status !== 'ACTIVE') {
      throw Object.assign(new Error('User account is not active'), { statusCode: 403 });
    }
    await client.query(
      `UPDATE identity_logins
          SET last_login_at = now(), email_at_login = $3
        WHERE issuer = $1 AND subject = $2`,
      [issuer, subject, email]
    );
    return user;
  }

  // First login is allowed only when an active invitation exists for the verified email.
  if (!email) {
    throw Object.assign(new Error('No invitation matched this identity'), { statusCode: 403 });
  }

  const invitation = await client.query(
    `SELECT i.id, i.organization_id, i.organization_role
       FROM organization_invitations i
      WHERE lower(i.email) = lower($1)
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT 1`,
    [email]
  );

  if (invitation.rowCount !== 1) {
    throw Object.assign(new Error('No active SafeStart invitation for this email'), { statusCode: 403 });
  }

  const created = await client.query(
    `INSERT INTO identity_users (issuer, subject, email, full_name, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id, email, full_name, status`,
    [issuer, subject, email, fullName]
  );

  const user = created.rows[0];
  const invite = invitation.rows[0];

  await client.query(
    `INSERT INTO identity_logins (user_id, issuer, subject, provider, email_at_login, last_login_at)
     VALUES ($1, $2, $3, 'OIDC', $4, now())`,
    [user.id, issuer, subject, email]
  );

  await client.query(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     ON CONFLICT (organization_id, user_id, role)
     DO UPDATE SET status = 'ACTIVE'`,
    [invite.organization_id, user.id, invite.organization_role]
  );

  await client.query(
    `UPDATE organization_invitations SET accepted_at = now() WHERE id = $1`,
    [invite.id]
  );

  return user;
}

export async function listOrganizationsForUser(client, userId) {
  const result = await client.query(
    `SELECT o.id, o.slug, o.name, o.branding, o.settings,
            array_agg(m.role ORDER BY m.role) AS roles
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
        AND m.status = 'ACTIVE'
        AND o.status = 'ACTIVE'
      GROUP BY o.id, o.slug, o.name, o.branding, o.settings
      ORDER BY o.name`,
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
