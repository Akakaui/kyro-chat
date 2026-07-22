import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const settingsRoutes = new Hono();

// Helper to get or set a user setting
function getSetting(userId: string, key: string): string | null {
  const db = getDb();
  const row = await db.prepare(`
    SELECT value FROM user_settings WHERE user_id = ? AND key = ?
  `).get(userId, key) as any;
  return row?.value ?? null;
}

function setSetting(userId: string, key: string, value: string): void {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO user_settings (id, user_id, key, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
  `).run(id, userId, key, value);
}

// GET /settings — returns all user settings
settingsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.prepare(`
    SELECT key, value FROM user_settings WHERE user_id = ?
  `).all(user.id) as Array<{ key: string; value: string }>;

  const settings: Record<string, any> = {};

  for (const row of rows) {
    // Parse known boolean values
    if (row.key === 'memory_enabled' || row.key === 'kb_global_enabled') {
      settings[row.key] = row.value === 'true';
    } else {
      settings[row.key] = row.value;
    }
  }

  // Apply defaults
  if (settings.memory_enabled === undefined) settings.memory_enabled = true;
  if (settings.kb_global_enabled === undefined) settings.kb_global_enabled = true;

  return c.json({ settings });
});

// PUT /settings — update one or more settings
settingsRoutes.put('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Request body must be a JSON object' }, 400);
  }

  const allowedKeys = new Set(['memory_enabled', 'kb_global_enabled']);
  const applied: Record<string, any> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.has(key)) continue;

    // Validate booleans
    if (typeof value !== 'boolean') {
      return c.json({ error: `Setting "${key}" must be a boolean` }, 400);
    }

    setSetting(user.id, key, value ? 'true' : 'false');
    applied[key] = value;
  }

  if (Object.keys(applied).length === 0) {
    return c.json({ error: 'No valid settings provided. Allowed keys: memory_enabled, kb_global_enabled' }, 400);
  }

  return c.json({ settings: applied });
});
