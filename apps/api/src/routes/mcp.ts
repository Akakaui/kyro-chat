import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { mcpClient } from '../mcp/client.js';
import type { MCPServerConfig } from '../mcp/client.js';
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js';
import { validateUrl } from '../lib/validate-url.js';

export const mcpRoutes = new Hono();

// ---------- Connect to an MCP server (full config) ----------
mcpRoutes.post('/connect', async (c) => {
  const user = c.get('user');
  const {
    url, name, authType, accessToken, apiKey,
    transportMode, timeout, headers,
    oauthClientId, oauthClientSecret, oauthScopes, oauthRedirectUri,
    envVars, enabled,
  } = await c.req.json();

  if (!url) return c.json({ error: 'url is required' }, 400);

  // SSRF protection: validate URL resolves to a non-private IP
  const urlCheck = await validateUrl(url);
  if (!urlCheck.valid) {
    return c.json({ error: `Invalid URL: ${urlCheck.reason}` }, 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Encrypt tokens before storing
  let encryptedAccessToken: string | null = null;
  let encryptedApiKey: string | null = null;
  let encryptedOAuthSecret: string | null = null;

  if (accessToken) {
    try {
      encryptedAccessToken = await encryptApiKey(accessToken);
    } catch {
      return c.json({ error: 'Failed to encrypt access token' }, 500);
    }
  }
  if (apiKey) {
    try {
      encryptedApiKey = await encryptApiKey(apiKey);
    } catch {
      return c.json({ error: 'Failed to encrypt API key' }, 500);
    }
  }
  if (oauthClientSecret) {
    try {
      encryptedOAuthSecret = await encryptApiKey(oauthClientSecret);
    } catch {
      return c.json({ error: 'Failed to encrypt OAuth client secret' }, 500);
    }
  }

  // Persist connection record with full config
  await db.prepare(`
    INSERT INTO mcp_connections (
      id, user_id, name, url, auth_type, access_token, api_key, status,
      transport_mode, timeout, headers,
      oauth_client_id, oauth_client_secret, oauth_scopes, oauth_redirect_uri,
      env_vars, enabled, config_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'connecting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, user.id, name || url, url, authType || 'none',
    encryptedAccessToken, encryptedApiKey,
    transportMode || 'remote', timeout || 5000, headers ? JSON.stringify(headers) : null,
    oauthClientId || null, encryptedOAuthSecret, oauthScopes || null, oauthRedirectUri || null,
    envVars ? JSON.stringify(envVars) : null, enabled !== false ? 1 : 0,
    JSON.stringify({ url, name: name || url, transportMode: transportMode || 'remote', headers, envVars })
  );

  const serverConfig: MCPServerConfig = {
    id,
    userId: user.id,
    name: name || url,
    url,
    authType: authType || 'none',
    accessToken,
    apiKey,
    status: 'connected',
  };

  try {
    const tools = await mcpClient.connect(serverConfig);

    // Update status and cache tools
    await db.prepare(`
      UPDATE mcp_connections
      SET status = 'connected', tools_json = ?, updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(tools), id, user.id);

    return c.json({ id, name: serverConfig.name, tools, status: 'connected' });
  } catch (err: any) {
    await db.prepare(`
      UPDATE mcp_connections SET status = 'error', updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);

    return c.json({ error: `Failed to connect: ${err.message}` }, 502);
  }
});

// ---------- List user's MCP connections ----------
mcpRoutes.get('/servers', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.prepare(`
    SELECT id, name, url, auth_type, status, tools_json, created_at, updated_at,
           transport_mode, timeout, enabled
    FROM mcp_connections
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id) as any[];

  const servers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    authType: r.auth_type,
    status: mcpClient.isConnected(r.id) ? 'connected' : r.status,
    transportMode: r.transport_mode,
    timeout: r.timeout,
    enabled: !!r.enabled,
    toolCount: (() => {
      try { return JSON.parse(r.tools_json || '[]').length; } catch { return 0; }
    })(),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return c.json({ servers });
});

// ---------- Get tools for a connected server ----------
mcpRoutes.get('/servers/:id/tools', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id, status, tools_json FROM mcp_connections
    WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;

  if (!row) return c.json({ error: 'Not found' }, 404);

  // Use live tools if connected, otherwise fall back to cached
  if (mcpClient.isConnected(serverId)) {
    const tools = mcpClient.getCachedTools(serverId);
    return c.json({ tools, status: 'connected' });
  }

  const tools = (() => {
    try { return JSON.parse(row.tools_json || '[]'); } catch { return []; }
  })();
  return c.json({ tools, status: row.status });
});

// ---------- Call a tool on a connected server ----------
mcpRoutes.post('/servers/:id/tools/:toolName/call', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const toolName = c.req.param('toolName');
  const { args } = await c.req.json();
  const db = getDb();

  // Verify ownership
  const row = await db.prepare(`
    SELECT id FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (!mcpClient.isConnected(serverId)) {
    return c.json({ error: 'Server not connected. Please reconnect first.' }, 400);
  }

  try {
    const result = await mcpClient.callTool(serverId, toolName, args || {});
    return c.json({ result });
  } catch (err: any) {
    return c.json({ error: `Tool call failed: ${err.message}` }, 502);
  }
});

// ---------- Update MCP connection config ----------
mcpRoutes.put('/servers/:id', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json();
  const allowedFields = [
    'name', 'url', 'auth_type', 'transport_mode', 'timeout',
    'headers', 'oauth_client_id', 'oauth_client_secret',
    'oauth_scopes', 'oauth_redirect_uri', 'env_vars', 'enabled', 'config_json',
  ];

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      let value = body[field];
      if ((field === 'headers' || field === 'env_vars') && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      if (field === 'oauth_client_secret' && value) {
        try { value = await encryptApiKey(value); } catch {
          return c.json({ error: 'Failed to encrypt OAuth client secret' }, 500);
        }
      }
      if (field === 'config_json' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      updates.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  updates.push('updated_at = unixepoch()');
  values.push(serverId, user.id);

  await db.prepare(`
    UPDATE mcp_connections SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).run(...values);

  return c.json({ success: true });
});

// ---------- Import JSON config snippet ----------
mcpRoutes.post('/servers/:id/import', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { config } = await c.req.json();
  if (!config || typeof config !== 'object') {
    return c.json({ error: 'config must be a JSON object' }, 400);
  }

  // Map common MCP config fields
  const fieldMap: Record<string, string> = {
    url: 'url',
    name: 'name',
    serverUrl: 'url',
    transport: 'transport_mode',
    transportMode: 'transport_mode',
    timeout: 'timeout',
    headers: 'headers',
    env: 'env_vars',
    envVars: 'env_vars',
    oauth: 'oauth_client_id',
    clientId: 'oauth_client_id',
    clientSecret: 'oauth_client_secret',
    scopes: 'oauth_scopes',
    redirectUri: 'oauth_redirect_uri',
  };

  const updates: string[] = [];
  const values: any[] = [];

  for (const [jsonKey, dbField] of Object.entries(fieldMap)) {
    if (config[jsonKey] !== undefined) {
      let value = config[jsonKey];
      if ((dbField === 'headers' || dbField === 'env_vars') && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      if (dbField === 'oauth_client_secret' && value) {
        try { value = await encryptApiKey(value); } catch { continue; }
      }
      updates.push(`${dbField} = ?`);
      values.push(typeof value === 'number' ? value : String(value));
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No recognized fields in config' }, 400);
  }

  updates.push('updated_at = unixepoch()');
  values.push(serverId, user.id);

  await db.prepare(`
    UPDATE mcp_connections SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).run(...values);

  return c.json({ success: true, importedFields: Object.keys(fieldMap).filter(k => config[k] !== undefined) });
});

// ---------- Export config as JSON ----------
mcpRoutes.get('/servers/:id/export', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id, name, url, auth_type, transport_mode, timeout, headers,
           oauth_client_id, oauth_scopes, oauth_redirect_uri, env_vars, config_json
    FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const parseJson = (s: string | null) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  const config = {
    name: row.name,
    url: row.url,
    transport: row.transport_mode || 'remote',
    timeout: row.timeout || 5000,
    headers: parseJson(row.headers),
    oauth: {
      clientId: row.oauth_client_id || null,
      // Never export secrets
      scopes: row.oauth_scopes || null,
      redirectUri: row.oauth_redirect_uri || null,
    },
    env: parseJson(row.env_vars),
  };

  return c.json({ config });
});

// ---------- Test connectivity ----------
mcpRoutes.post('/servers/:id/test', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id, url, name, auth_type, access_token, api_key
    FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Decrypt stored tokens for reconnection
  let accessToken: string | undefined;
  let apiKey: string | undefined;
  if (row.access_token) {
    try { accessToken = await decryptApiKey(row.access_token); } catch { /* remain undefined */ }
  }
  if (row.api_key) {
    try { apiKey = await decryptApiKey(row.api_key); } catch { /* remain undefined */ }
  }

  if (!mcpClient.isConnected(serverId)) {
    // Attempt reconnection
    const config: MCPServerConfig = {
      id: row.id,
      userId: user.id,
      name: row.name,
      url: row.url,
      authType: row.auth_type,
      accessToken,
      apiKey,
      status: 'disconnected',
    };
    try {
      await mcpClient.connect(config);
    } catch {
      return c.json({ connected: false, message: 'Reconnection failed' });
    }
  }

  const ok = await mcpClient.testConnection(serverId);
  return c.json({ connected: ok });
});

// ---------- Disconnect ----------
mcpRoutes.post('/servers/:id/disconnect', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  await mcpClient.disconnect(serverId);

  await db.prepare(`
    UPDATE mcp_connections SET status = 'disconnected', updated_at = unixepoch()
    WHERE id = ? AND user_id = ?
  `).run(serverId, user.id);

  return c.json({ success: true });
});

// ---------- Remove connection ----------
mcpRoutes.delete('/servers/:id', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id FROM mcp_connections WHERE id = ? AND user_id = ?
  `).get(serverId, user.id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  await mcpClient.disconnect(serverId);

  await db.prepare(`
    DELETE FROM mcp_connections WHERE id = ? AND user_id = ?
  `).run(serverId, user.id);

  return c.json({ success: true });
});
