import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js';
import { apiLimit } from '../middleware/rateLimit.js';

export const connectorRoutes = new Hono();

// Apply general API rate limit to all connector routes
connectorRoutes.use('*', apiLimit);

// ---------- Helper: discover API endpoints ----------

// SSRF protection: validate URL before making requests
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^fc00:/i, /^fe80:/i, /^::1$/i,
];
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost'];
const ALLOWED_SCHEMES = ['http:', 'https:'];

function validateUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  if (!ALLOWED_SCHEMES.includes(url.protocol)) {
    throw new Error(`Blocked URL scheme: ${url.protocol}. Only http and https are allowed.`);
  }
  const hostname = url.hostname.toLowerCase();
  // Block internal/private IPs
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Blocked internal/private IP address: ${hostname}`);
    }
  }
  // Block local/internal hostname suffixes
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`Blocked internal hostname: ${hostname}`);
    }
  }
  // Block raw IP addresses (v4)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const parts = hostname.split('.').map(Number);
    if (parts.every((p: number) => p >= 0 && p <= 255)) {
      for (const pattern of BLOCKED_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          throw new Error(`Blocked internal/private IP address: ${hostname}`);
        }
      }
    }
  }
  return url;
}

async function discoverEndpoints(
  baseUrl: string | null,
  apiKey: string | null
): Promise<Array<{ method: string; path: string; description: string }>> {
  const endpoints: Array<{ method: string; path: string; description: string }> = [];
  const probePaths = ['/', '/api', '/api/v1', '/v1', '/health', '/docs', '/openapi.json', '/swagger.json'];

  // Validate baseUrl before any requests
  if (baseUrl) {
    validateUrl(baseUrl);
  }

  const headers: Record<string, string> = { 'User-Agent': 'KyroConnect/1.0' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }

  for (const probePath of probePaths) {
    try {
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}${probePath}` : probePath;
      // Validate each constructed URL
      if (baseUrl && url !== probePath) {
        validateUrl(url);
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await response.json() as Record<string, unknown>;
        // Check for OpenAPI/Swagger spec
        if (body.openapi || body.swagger) {
          const spec = body as Record<string, unknown>;
          const paths = spec.paths as Record<string, Record<string, { summary?: string }>> | undefined;
          if (paths) {
            for (const [path, methods] of Object.entries(paths)) {
              for (const [method, details] of Object.entries(methods)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                  endpoints.push({
                    method: method.toUpperCase(),
                    path,
                    description: details.summary || `${method.toUpperCase()} ${path}`,
                  });
                }
              }
            }
          }
          if (endpoints.length > 0) return endpoints;
        }
        // Check for REST-like array responses
        if (Array.isArray(body)) {
          endpoints.push({ method: 'GET', path: probePath, description: `List items at ${probePath}` });
        }
      }
    } catch {
      // Probe failed, continue
    }
  }

  // If no endpoints discovered from spec, create basic tool from probes
  if (endpoints.length === 0 && baseUrl) {
    endpoints.push(
      { method: 'GET', path: '/', description: 'Root endpoint' },
      { method: 'GET', path: '/health', description: 'Health check' },
    );
  }

  return endpoints;
}

// ---------- Add custom API ----------
connectorRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, image, apiKey, baseUrl } = await c.req.json();

  if (!name) return c.json({ error: 'name is required' }, 400);

  const db = getDb();
  const id = crypto.randomUUID();
  let encryptedKey = null;

  if (apiKey) {
    try {
      encryptedKey = await encryptApiKey(apiKey);
    } catch {
      return c.json({ error: 'Failed to encrypt API key' }, 500);
    }
  }

  db.prepare(`
    INSERT INTO custom_apis (id, name, image, api_key_encrypted, base_url, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, image || null, encryptedKey, baseUrl || null, user.id);

  return c.json({
    id,
    name,
    image: image || null,
    baseUrl: baseUrl || null,
    endpoints: [],
    status: 'idle',
    hasApiKey: !!apiKey,
  });
});

// ---------- List user's custom APIs ----------
connectorRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, name, image, base_url, endpoints, status, created_at, updated_at
    FROM custom_apis
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id) as any[];

  const apis = rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.image,
    baseUrl: r.base_url,
    endpoints: (() => {
      try { return JSON.parse(r.endpoints || '[]'); } catch { return []; }
    })(),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return c.json({ connectors: apis });
});

// ---------- Get connector details ----------
connectorRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const connectorId = c.req.param('id');
  const db = getDb();

  const row = db.prepare(`
    SELECT id, name, image, base_url, endpoints, status, created_at, updated_at
    FROM custom_apis
    WHERE id = ? AND user_id = ?
  `).get(connectorId, user.id) as any;

  if (!row) return c.json({ error: 'Not found' }, 404);

  return c.json({
    id: row.id,
    name: row.name,
    image: row.image,
    baseUrl: row.base_url,
    endpoints: (() => {
      try { return JSON.parse(row.endpoints || '[]'); } catch { return []; }
    })(),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// ---------- Update connector ----------
connectorRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const connectorId = c.req.param('id');
  const { name, image, baseUrl } = await c.req.json();
  const db = getDb();

  const row = db.prepare(`
    SELECT id FROM custom_apis WHERE id = ? AND user_id = ?
  `).get(connectorId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (image !== undefined) { updates.push('image = ?'); params.push(image); }
  if (baseUrl !== undefined) { updates.push('base_url = ?'); params.push(baseUrl); }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(connectorId, user.id);
    db.prepare(`UPDATE custom_apis SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  }

  return c.json({ success: true });
});

// ---------- Delete connector ----------
connectorRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const connectorId = c.req.param('id');
  const db = getDb();

  const row = db.prepare(`
    SELECT id FROM custom_apis WHERE id = ? AND user_id = ?
  `).get(connectorId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  db.prepare(`DELETE FROM custom_apis WHERE id = ? AND user_id = ?`).run(connectorId, user.id);

  return c.json({ success: true });
});

// ---------- Trigger endpoint discovery ----------
connectorRoutes.post('/:id/discover', async (c) => {
  const user = c.get('user');
  const connectorId = c.req.param('id');
  const db = getDb();

  const row = db.prepare(`
    SELECT id, base_url, api_key_encrypted
    FROM custom_apis
    WHERE id = ? AND user_id = ?
  `).get(connectorId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Set status to discovering
  db.prepare(`UPDATE custom_apis SET status = 'discovering', updated_at = unixepoch() WHERE id = ?`).run(connectorId);

  let apiKey = null;
  if (row.api_key_encrypted) {
    try {
      apiKey = await decryptApiKey(row.api_key_encrypted);
    } catch {
      // Continue without key
    }
  }

  try {
    const endpoints = await discoverEndpoints(row.base_url, apiKey);
    db.prepare(`
      UPDATE custom_apis SET status = 'ready', endpoints = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(JSON.stringify(endpoints), connectorId);

    return c.json({ endpoints, status: 'ready' });
  } catch (err: any) {
    db.prepare(`
      UPDATE custom_apis SET status = 'error', updated_at = unixepoch()
      WHERE id = ?
    `).run(connectorId);

    return c.json({ error: `Discovery failed: ${err.message}` }, 500);
  }
});

// ---------- Get discovered tools ----------
connectorRoutes.get('/:id/tools', async (c) => {
  const user = c.get('user');
  const connectorId = c.req.param('id');
  const db = getDb();

  const row = db.prepare(`
    SELECT id, name, endpoints, status
    FROM custom_apis
    WHERE id = ? AND user_id = ?
  `).get(connectorId, user.id) as any;

  if (!row) return c.json({ error: 'Not found' }, 404);

  const endpoints = (() => {
    try { return JSON.parse(row.endpoints || '[]'); } catch { return []; }
  })();

  const tools = endpoints.map((ep: any) => ({
    name: `${row.name.toLowerCase().replace(/\s+/g, '_')}_${ep.method.toLowerCase()}_${ep.path.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`,
    description: ep.description,
    method: ep.method,
    path: ep.path,
    source: 'custom_api',
  }));

  return c.json({ tools, status: row.status });
});

// ---------- Helper exported for permission checks ----------
export async function getDecryptedApiKey(connectorId: string): Promise<string | null> {
  const db = getDb();
  const row = db.prepare(`
    SELECT api_key_encrypted FROM custom_apis WHERE id = ?
  `).get(connectorId) as any;
  if (!row?.api_key_encrypted) return null;
  try {
    return await decryptApiKey(row.api_key_encrypted);
  } catch {
    return null;
  }
}
