import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const permissionRoutes = new Hono();

// ---------- Get all permissions for user ----------
permissionRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  // Get global defaults
  const globals = await db.prepare(`
    SELECT source_type, permission FROM tool_permission_globals
    WHERE user_id = ?
  `).all(user.id) as Array<{ source_type: string; permission: string }>;

  const globalDefaults: Record<string, string> = {
    builtin: 'ask',
    mcp: 'ask',
    custom_api: 'ask',
  };
  for (const g of globals) {
    globalDefaults[g.source_type] = g.permission;
  }

  // Get per-tool overrides
  const tools = await db.prepare(`
    SELECT tool_name, source, permission FROM tool_permissions
    WHERE user_id = ?
    ORDER BY source, tool_name
  `).all(user.id) as Array<{ tool_name: string; source: string; permission: string }>;

  return c.json({
    globals: globalDefaults,
    tools: tools.map((t) => ({
      toolName: t.tool_name,
      source: t.source,
      permission: t.permission,
    })),
  });
});

// ---------- Set global defaults ----------
permissionRoutes.put('/globals', async (c) => {
  const user = c.get('user');
  const { sourceType, permission } = await c.req.json();

  if (!['builtin', 'mcp', 'custom_api'].includes(sourceType)) {
    return c.json({ error: 'Invalid source_type' }, 400);
  }
  if (!['allow', 'ask', 'deny'].includes(permission)) {
    return c.json({ error: 'Invalid permission' }, 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO tool_permission_globals (id, source_type, permission, user_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_type, user_id) DO UPDATE SET permission = excluded.permission
  `).run(id, sourceType, permission, user.id);

  return c.json({ success: true });
});

// ---------- Get permission for specific tool ----------
permissionRoutes.get('/:toolName', async (c) => {
  const user = c.get('user');
  const toolName = c.req.param('toolName');
  const db = getDb();

  const row = await db.prepare(`
    SELECT tool_name, source, permission FROM tool_permissions
    WHERE tool_name = ? AND user_id = ?
  `).get(toolName, user.id) as any;

  if (!row) {
    return c.json({ toolName, source: null, permission: null, isDefault: true });
  }

  return c.json({
    toolName: row.tool_name,
    source: row.source,
    permission: row.permission,
    isDefault: false,
  });
});

// ---------- Set permission for specific tool ----------
permissionRoutes.put('/:toolName', async (c) => {
  const user = c.get('user');
  const toolName = c.req.param('toolName');
  const { source, permission } = await c.req.json();

  if (!['builtin', 'mcp', 'custom_api'].includes(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }
  if (!['allow', 'ask', 'deny'].includes(permission)) {
    return c.json({ error: 'Invalid permission' }, 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO tool_permissions (id, tool_name, source, permission, user_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tool_name, source, user_id) DO UPDATE SET permission = excluded.permission
  `).run(id, toolName, source, permission, user.id);

  return c.json({ success: true });
});

// ---------- Reset tool to global default ----------
permissionRoutes.delete('/:toolName', async (c) => {
  const user = c.get('user');
  const toolName = c.req.param('toolName');
  const db = getDb();

  await db.prepare(`
    DELETE FROM tool_permissions WHERE tool_name = ? AND user_id = ?
  `).run(toolName, user.id);

  return c.json({ success: true });
});

// ---------- Check tool permission (used by chat) ----------
permissionRoutes.get('/:toolName/check', async (c) => {
  const user = c.get('user');
  const toolName = c.req.param('toolName');
  const { source } = c.req.query();
  const db = getDb();

  // Check per-tool override first
  const toolRow = await db.prepare(`
    SELECT permission FROM tool_permissions
    WHERE tool_name = ? AND source = ? AND user_id = ?
  `).get(toolName, source || 'builtin', user.id) as any;

  if (toolRow) {
    return c.json({ permission: toolRow.permission, isDefault: false });
  }

  // Fall back to global default
  const globalRow = await db.prepare(`
    SELECT permission FROM tool_permission_globals
    WHERE source_type = ? AND user_id = ?
  `).get(source || 'builtin', user.id) as any;

  return c.json({
    permission: globalRow?.permission || 'ask',
    isDefault: true,
  });
});
