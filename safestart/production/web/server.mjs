import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8080);
const apiOrigin = process.env.SAFESTART_API_ORIGIN;
const proxyKey = process.env.SAFESTART_PROXY_KEY;
const root = fileURLToPath(new URL('.', import.meta.url));

if (!apiOrigin) throw new Error('SAFESTART_API_ORIGIN is required');
if (!proxyKey || proxyKey.length < 32) throw new Error('SAFESTART_PROXY_KEY is required and must be at least 32 characters');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-length': payload.length,
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
}

async function serveStatic(url, res) {
  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!['/index.html', '/app.js', '/styles.css', '/favicon.ico'].includes(path)) path = '/index.html';
  try {
    const body = await readFile(join(root, path));
    return send(res, 200, body, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
  } catch (error) {
    if (path === '/favicon.ico' && error?.code === 'ENOENT') return send(res, 204, Buffer.alloc(0));
    throw error;
  }
}

async function proxyApi(req, res, url) {
  const target = new URL(url.pathname + url.search, apiOrigin);
  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
    'x-safestart-proxy-key': proxyKey
  };

  // Azure App Service Easy Auth injects this header after successful authentication.
  // Only the production web app is allowed to forward it to the production API.
  if (req.headers['x-ms-client-principal']) {
    headers['x-ms-client-principal'] = req.headers['x-ms-client-principal'];
  }
  if (req.headers['x-safestart-organization-id']) {
    headers['x-safestart-organization-id'] = req.headers['x-safestart-organization-id'];
  }

  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) return send(res, 413, JSON.stringify({ error: 'Request too large' }), { 'content-type': 'application/json' });
      chunks.push(chunk);
    }
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: 'manual'
  });

  const responseBody = Buffer.from(await upstream.arrayBuffer());
  const responseHeaders = {
    'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  return send(res, upstream.status, responseBody, responseHeaders);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/healthz') {
      return send(res, 200, JSON.stringify({ ok: true, service: 'safestart-production-web' }), { 'content-type': 'application/json' });
    }

    if (url.pathname.startsWith('/api/v1/')) {
      return await proxyApi(req, res, url);
    }

    return await serveStatic(url, res);
  } catch (error) {
    console.error(error);
    return send(res, 500, JSON.stringify({ error: 'Internal server error' }), { 'content-type': 'application/json' });
  }
});

server.listen(port, () => console.log(`SafeStart production web listening on ${port}`));

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
