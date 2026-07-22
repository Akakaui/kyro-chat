import { Hono } from 'hono';
import { memoryService } from '../memory/service.js';
import { getDb } from '../db/init.js';

export const memoryRoutes = new Hono();

// Store a memory
memoryRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { content, type = 'fact', agentId, metadata, importance } = await c.req.json();

  const id = memoryService.store(user.id, content, type, {
    agentId,
    metadata,
    importance,
  });

  return c.json({ id });
});

// Search memories
memoryRoutes.post('/search', async (c) => {
  const user = c.get('user');
  const { query, agentId, type, limit, minImportance } = await c.req.json();

  const memories = memoryService.search(user.id, query, {
    agentId,
    type,
    limit,
    minImportance,
  });

  return c.json({ memories });
});

// Get recent memories
memoryRoutes.get('/recent', async (c) => {
  const user = c.get('user');
  const agentId = c.req.query('agentId');
  const limit = parseInt(c.req.query('limit') || '20');

  const memories = memoryService.getRecent(user.id, { agentId, limit });
  return c.json({ memories });
});

// Get memory context for agent
memoryRoutes.post('/context', async (c) => {
  const user = c.get('user');
  const { agentId, maxTokens } = await c.req.json();

  const context = memoryService.getContext(user.id, agentId, maxTokens);
  return c.json({ context });
});

// Update memory
memoryRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { content, importance, type } = await c.req.json();

  const success = memoryService.update(id, user.id, { content, importance, type });
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

// Delete memory
memoryRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = memoryService.delete(id, user.id);
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

// Cleanup old memories
memoryRoutes.post('/cleanup', async (c) => {
  const user = c.get('user');
  const { maxAge } = await c.req.json();

  const deleted = memoryService.cleanup(user.id, maxAge);
  return c.json({ deleted });
});

// Toggle memory enabled/disabled
memoryRoutes.put('/toggle', async (c) => {
  const user = c.get('user');
  const { enabled } = await c.req.json();

  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  const db = getDb();
  const settingId = crypto.randomUUID();
  const value = enabled ? 'true' : 'false';

  await db.prepare(`
    INSERT INTO user_settings (id, user_id, key, value)
    VALUES (?, ?, 'memory_enabled', ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
  `).run(settingId, user.id, value);

  return c.json({ enabled });
});

// Get memory toggle state
memoryRoutes.get('/toggle', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const setting = await db.prepare(`
    SELECT value FROM user_settings WHERE user_id = ? AND key = 'memory_enabled'
  `).get(user.id) as any;

  // Default to enabled if no setting exists
  const enabled = setting ? setting.value === 'true' : true;
  return c.json({ enabled });
});

// Wipe all memories for user
memoryRoutes.delete('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const result = await db.prepare(`
    DELETE FROM memory_entries WHERE user_id = ?
  `).run(user.id);

  return c.json({ deleted: result.changes });
});
