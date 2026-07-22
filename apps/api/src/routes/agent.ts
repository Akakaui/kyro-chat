import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const agentRoutes = new Hono();

// Create agent
agentRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, type, description, systemPrompt, model } = await c.req.json();
  const id = crypto.randomUUID();

  const db = getDb();
  await db.prepare(`
    INSERT INTO agents (id, user_id, name, type, description, system_prompt, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, name, type || 'sub', description || '', systemPrompt || '', model || 'claude-sonnet-4-20250514');

  return c.json({ id, name, type });
});

// List agents
agentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const agents = await db.prepare(`
    SELECT id, name, type, description, model, created_at
    FROM agents WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id);

  return c.json({ agents });
});

// Update agent
agentRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('id');
  const updates = await c.req.json();

  const db = getDb();
  const fields = Object.keys(updates).filter(k => ['name', 'type', 'description', 'system_prompt', 'model', 'temperature', 'max_tokens'].includes(k));

  if (fields.length === 0) return c.json({ error: 'No valid fields to update' }, 400);

  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f === 'system_prompt' ? 'systemPrompt' : f] || updates[f]);

  await db.prepare(`
    UPDATE agents SET ${setClauses}, updated_at = unixepoch()
    WHERE id = ? AND user_id = ?
  `).run(...values, agentId, user.id);

  return c.json({ success: true });
});

// Delete agent
agentRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('id');
  const db = getDb();

  await db.prepare(`DELETE FROM agents WHERE id = ? AND user_id = ?`).run(agentId, user.id);
  // Clean up KB permissions for this agent
  await db.prepare(`DELETE FROM agent_kb_permissions WHERE agent_id = ? AND user_id = ?`).run(agentId, user.id);
  return c.json({ success: true });
});

// ─── Agent KB Permission Endpoints ───

// List KB permissions for this agent
agentRoutes.get('/:id/kb-permissions', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('id');
  const db = getDb();

  // Verify agent exists
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, user.id);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const permissions = await db.prepare(`
    SELECT akp.id, akp.agent_id, akp.kb_id, akp.permission, akp.created_at,
      kbs.source_file as kb_name
    FROM agent_kb_permissions akp
    LEFT JOIN (
      SELECT DISTINCT kb_id, source_file FROM kb_chunks WHERE user_id = ?
    ) kbs ON akp.kb_id = kbs.kb_id
    WHERE akp.agent_id = ? AND akp.user_id = ?
  `).all(user.id, agentId, user.id);

  return c.json({ permissions });
});

// Update KB permissions for this agent
agentRoutes.put('/:id/kb-permissions', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('id');
  const { kbId, permission } = await c.req.json();
  const db = getDb();

  // Verify agent exists
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, user.id);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (!kbId || !permission || !['allow', 'ask', 'deny'].includes(permission)) {
    return c.json({ error: 'kbId and valid permission (allow/ask/deny) required' }, 400);
  }

  const existing = await db.prepare(`
    SELECT id FROM agent_kb_permissions WHERE agent_id = ? AND kb_id = ?
  `).get(agentId, kbId) as any;

  if (existing) {
    await db.prepare(`
      UPDATE agent_kb_permissions SET permission = ? WHERE agent_id = ? AND kb_id = ?
    `).run(permission, agentId, kbId);
  } else {
    await db.prepare(`
      INSERT INTO agent_kb_permissions (id, agent_id, kb_id, permission, user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), agentId, kbId, permission, user.id);
  }

  return c.json({ success: true, permission });
});

// List available KBs (global + project-scoped)
agentRoutes.get('/:id/kb-available', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('id');
  const db = getDb();

  // Verify agent exists
  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, user.id);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Get all KBs (global + project-scoped)
  const allKBs = await db.prepare(`
    SELECT DISTINCT kb_id, source_file, project_id
    FROM kb_chunks
    WHERE user_id = ?
  `).all(user.id) as Array<{ kb_id: string; source_file: string; project_id: string | null }>;

  // Get existing permissions for this agent
  const permissions = await db.prepare(`
    SELECT kb_id, permission FROM agent_kb_permissions
    WHERE agent_id = ? AND user_id = ?
  `).all(agentId, user.id) as Array<{ kb_id: string; permission: string }>;

  const permMap = new Map(permissions.map(p => [p.kb_id, p.permission]));

  // Merge KBs with their permissions (default: deny)
  const available = allKBs.map(kb => ({
    kb_id: kb.kb_id,
    name: kb.source_file,
    project_id: kb.project_id,
    permission: permMap.get(kb.kb_id) || 'deny',
  }));

  return c.json({ kbs: available });
});
