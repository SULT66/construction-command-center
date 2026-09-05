import http from 'node:http';
import { Pool } from 'pg';
import { verifiedClaimsFromEasyAuthHeaders } from './easyauth-claims.mjs';
import {
  resolveUserFromVerifiedClaims,
  listOrganizationsForUser,
  selectOrganization
} from './tenant-context.mjs';

const port = Number(process.env.PORT || 8080);
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
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

    if (req.method === 'GET' && url.pathname === '/api/v1/session') {
      return await handleSession(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/session/select-organization') {
      return await handleSelectOrganization(req, res);
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
