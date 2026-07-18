import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const agentRoutes = new Hono();

// Create agent
agentRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, type, description, systemPrompt, model } = await c.req.json();
  const id = crypto.randomUUID();

  const db = getDb();
  db.prepare(`
    INSERT INTO agents (id, user_id, name, type, description, system_prompt, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, name, type || 'sub', description || '', systemPrompt || '', model || 'claude-sonnet-4-20250514');

  return c.json({ id, name, type });
});

// List agents
agentRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const agents = db.prepare(`
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

  db.prepare(`
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

  db.prepare(`DELETE FROM agents WHERE id = ? AND user_id = ?`).run(agentId, user.id);
  return c.json({ success: true });
});
