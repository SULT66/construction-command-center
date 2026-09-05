import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { verifiedClaimsFromEasyAuthHeaders } from './easyauth-claims.mjs';
import {
  resolveUserFromVerifiedClaims,
  listOrganizationsForUser,
  selectOrganization
} from './tenant-context.mjs';
import {
  listWorkers,
  getWorkerCard,
  createWorker,
  requireWorkforceWriteAccess
} from './workforce.mjs';

const port = Number(process.env.PORT || 8080);
const connectionString = process.env.DATABASE_URL;
const proxyKey = process.env.SAFESTART_PROXY_KEY;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}
if (!proxyKey || proxyKey.length < 32) {
  throw new Error('SAFESTART_PROXY_KEY is required and must be at least 32 characters');
}

const pool = new Pool({ connectionString, max: 10, ssl: { rejectUnauthorized: false } });

function json(res, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store'
  });
  res.end(payload);
}

function requireTrustedProxy(req) {
  const supplied = Buffer.from(String(req.headers['x-safestart-proxy-key'] || ''));
  const expected = Buffer.from(String(proxyKey));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw Object.assign(new Error('Trusted application proxy required'), { statusCode: 403 });
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

async function authenticatedUser(client, req) {
  const claims = verifiedClaimsFromEasyAuthHeaders(req.headers);
  return resolveUserFromVerifiedClaims(client, claims);
}

function organizationIdFromRequest(req) {
  const value = req.headers['x-safestart-organization-id'];
  if (!value || Array.isArray(value)) {
    throw Object.assign(new Error('x-safestart-organization-id is required'), { statusCode: 400 });
  }
  return String(value);
}

async function withTenant(req, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await authenticatedUser(client, req);
    const organizationId = organizationIdFromRequest(req);
    const context = await selectOrganization(client, user.id, organizationId);
    const result = await callback({ client, user, organizationId, context });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleSession(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await authenticatedUser(client, req);
    const organizations = await listOrganizationsForUser(client, user.id);
    await client.query('COMMIT');
    json(res, 200, {
      authenticated: true,
      user: { id: user.id, email: user.email, fullName: user.full_name },
      organizations
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleSelectOrganization(req, res) {
  const body = await readJson(req);
  if (!body.organizationId) {
    throw Object.assign(new Error('organizationId is required'), { statusCode: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await authenticatedUser(client, req);
    const context = await selectOrganization(client, user.id, body.organizationId);
    await client.query(
      `INSERT INTO user_product_preferences (user_id, last_organization_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id)
       DO UPDATE SET last_organization_id = EXCLUDED.last_organization_id, updated_at = now()`,
      [user.id, body.organizationId]
    );
    await client.query('COMMIT');
    json(res, 200, {
      user: { id: user.id, email: user.email, fullName: user.full_name },
      ...context
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleListWorkers(req, res, url) {
  const result = await withTenant(req, async ({ client, organizationId }) => {
    return listWorkers(client, {
      organizationId,
      projectId: url.searchParams.get('projectId') || null,
      search: url.searchParams.get('search') || null,
      limit: url.searchParams.get('limit') || 100
    });
  });
  json(res, 200, { workers: result });
}

async function handleGetWorker(req, res, workerId, url) {
  const result = await withTenant(req, async ({ client, organizationId }) => {
    return getWorkerCard(client, {
      organizationId,
      workerId,
      projectId: url.searchParams.get('projectId') || null
    });
  });
  json(res, 200, result);
}

async function handleCreateWorker(req, res) {
  const body = await readJson(req);
  const worker = await withTenant(req, async ({ client, user, organizationId }) => {
    await requireWorkforceWriteAccess(client, user.id, organizationId, body.projectId || null);
    return createWorker(client, { organizationId, body });
  });
  json(res, 201, { worker });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'safestart-production-api' });
    }

    if (req.method === 'GET' && url.pathname === '/readyz') {
      await pool.query('SELECT 1');
      return json(res, 200, { ok: true, database: true });
    }

    if (url.pathname.startsWith('/api/v1/')) {
      requireTrustedProxy(req);
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/session') {
      return await handleSession(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/session/select-organization') {
      return await handleSelectOrganization(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/workers') {
      return await handleListWorkers(req, res, url);
    }

    const workerMatch = url.pathname.match(/^\/api\/v1\/workers\/([0-9a-fA-F-]{36})$/);
    if (req.method === 'GET' && workerMatch) {
      return await handleGetWorker(req, res, workerMatch[1], url);
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/workers') {
      return await handleCreateWorker(req, res);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    const message = statusCode >= 500 ? 'Internal server error' : error.message;
    if (statusCode >= 500) console.error(error);
    return json(res, statusCode, { error: message });
  }
});

server.listen(port, () => {
  console.log(`SafeStart production API listening on ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
