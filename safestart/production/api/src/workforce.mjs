function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function forbidden(message = 'Insufficient permissions') {
  return Object.assign(new Error(message), { statusCode: 403 });
}

export async function requireWorkforceWriteAccess(client, userId, organizationId, projectId = null) {
  const orgRole = await client.query(
    `SELECT 1
       FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
        AND status = 'ACTIVE'
        AND role IN ('ORG_ADMIN','ORG_SAFETY_ADMIN')
      LIMIT 1`,
    [organizationId, userId]
  );
  if (orgRole.rowCount === 1) return;

  if (projectId) {
    const projectRole = await client.query(
      `SELECT 1
         FROM project_members
        WHERE organization_id = $1
          AND project_id = $2
          AND user_id = $3
          AND status = 'ACTIVE'
          AND role IN ('PROJECT_ADMIN','PROJECT_MANAGER','SAFETY_MANAGER','SUPERINTENDENT','SUPERVISOR')
        LIMIT 1`,
      [organizationId, projectId, userId]
    );
    if (projectRole.rowCount === 1) return;
  }

  throw forbidden();
}

export async function listWorkers(client, { organizationId, projectId = null, search = null, limit = 100 }) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const params = [organizationId];
  const where = [`w.organization_id = $1`, `w.status <> 'INACTIVE'`];

  let projectJoin = '';
  if (projectId) {
    params.push(projectId);
    projectJoin = `JOIN worker_project_assignments a ON a.worker_id = w.id AND a.project_id = $${params.length} AND a.status = 'ACTIVE'`;
  }

  if (search) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(w.full_name ILIKE $${params.length} OR w.worker_number ILIKE $${params.length} OR COALESCE(w.employer_name,'') ILIKE $${params.length} OR COALESCE(w.trade,'') ILIKE $${params.length})`);
  }

  params.push(cappedLimit);
  const result = await client.query(
    `SELECT DISTINCT
            w.id,
            w.worker_number,
            w.full_name,
            w.worker_type,
            w.employer_name,
            w.trade,
            w.role_title,
            w.avatar_url,
            w.status,
            sp.training_status,
            sp.certification_status,
            sp.eligibility_status,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'type', d.device_type,
                'identifier', d.device_identifier,
                'status', d.status
              ) ORDER BY d.device_type)
              FROM worker_devices d
              WHERE d.worker_id = w.id AND d.status = 'ASSIGNED'
            ), '[]'::jsonb) AS devices
       FROM workers w
       ${projectJoin}
       LEFT JOIN worker_safety_profile sp ON sp.worker_id = w.id
      WHERE ${where.join(' AND ')}
      ORDER BY w.full_name
      LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export async function getWorkerCard(client, { organizationId, workerId, projectId = null }) {
  const worker = await client.query(
    `SELECT w.*,
            sp.training_status,
            sp.certification_status,
            sp.required_ppe,
            sp.eligibility_status,
            sp.safety_flags
       FROM workers w
       LEFT JOIN worker_safety_profile sp ON sp.worker_id = w.id
      WHERE w.organization_id = $1 AND w.id = $2`,
    [organizationId, workerId]
  );

  if (worker.rowCount !== 1) {
    throw Object.assign(new Error('Worker not found'), { statusCode: 404 });
  }

  const [assignments, credentials, devices] = await Promise.all([
    client.query(
      `SELECT a.project_id, p.project_name, a.zone, a.shift_name, a.assignment_role,
              a.status, a.check_in_at, a.check_out_at,
              u.full_name AS supervisor_name
         FROM worker_project_assignments a
         JOIN project_tenants p ON p.project_id = a.project_id
         LEFT JOIN identity_users u ON u.id = a.supervisor_user_id
        WHERE a.organization_id = $1 AND a.worker_id = $2
          AND ($3::uuid IS NULL OR a.project_id = $3::uuid)
        ORDER BY p.project_name`,
      [organizationId, workerId, projectId]
    ),
    client.query(
      `SELECT id, credential_type, credential_name, credential_number, issued_at, expires_at, status, issuer
         FROM worker_credentials
        WHERE organization_id = $1 AND worker_id = $2
        ORDER BY expires_at NULLS LAST, credential_name`,
      [organizationId, workerId]
    ),
    client.query(
      `SELECT id, project_id, device_type, device_identifier, status, assigned_at, unassigned_at
         FROM worker_devices
        WHERE organization_id = $1 AND worker_id = $2
        ORDER BY assigned_at DESC`,
      [organizationId, workerId]
    )
  ]);

  return {
    worker: worker.rows[0],
    assignments: assignments.rows,
    credentials: credentials.rows,
    devices: devices.rows
  };
}

export async function createWorker(client, { organizationId, body }) {
  const fullName = String(body.fullName || '').trim();
  const workerNumber = String(body.workerNumber || '').trim();
  if (!fullName) throw badRequest('fullName is required');
  if (!workerNumber) throw badRequest('workerNumber is required');

  const workerType = body.workerType || 'CONTRACTOR';
  if (!['EMPLOYEE','CONTRACTOR','VISITOR'].includes(workerType)) {
    throw badRequest('Invalid workerType');
  }

  const inserted = await client.query(
    `INSERT INTO workers (
       organization_id, worker_number, full_name, worker_type,
       employer_name, trade, role_title, phone, email, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE')
     RETURNING *`,
    [
      organizationId,
      workerNumber,
      fullName,
      workerType,
      body.employerName || null,
      body.trade || null,
      body.roleTitle || null,
      body.phone || null,
      body.email || null
    ]
  );

  const worker = inserted.rows[0];
  await client.query(
    `INSERT INTO worker_safety_profile (
       worker_id, organization_id, training_status, certification_status,
       required_ppe, eligibility_status
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT (worker_id) DO NOTHING`,
    [
      worker.id,
      organizationId,
      body.trainingStatus || 'UNKNOWN',
      body.certificationStatus || 'UNKNOWN',
      JSON.stringify(body.requiredPpe || []),
      body.eligibilityStatus || 'PENDING'
    ]
  );

  if (body.projectId) {
    await client.query(
      `INSERT INTO worker_project_assignments (
         worker_id, organization_id, project_id, supervisor_user_id,
         zone, shift_name, assignment_role, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE')
       ON CONFLICT (worker_id, project_id)
       DO UPDATE SET supervisor_user_id = EXCLUDED.supervisor_user_id,
                     zone = EXCLUDED.zone,
                     shift_name = EXCLUDED.shift_name,
                     assignment_role = EXCLUDED.assignment_role,
                     status = 'ACTIVE',
                     updated_at = now()`,
      [
        worker.id,
        organizationId,
        body.projectId,
        body.supervisorUserId || null,
        body.zone || null,
        body.shiftName || null,
        body.assignmentRole || body.roleTitle || null
      ]
    );
  }

  return worker;
}
