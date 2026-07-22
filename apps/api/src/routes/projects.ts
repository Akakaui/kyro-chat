import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const projectRoutes = new Hono();

// Create project
projectRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, description, customInstructions } = await c.req.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ error: 'Project name is required' }, 400);
  }

  const id = crypto.randomUUID();
  const db = getDb();

  await db.prepare(`
    INSERT INTO projects (id, name, description, custom_instructions, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), description || '', customInstructions || null, user.id);

  return c.json({ id, name: name.trim(), description: description || '', customInstructions: customInstructions || null });
});

// List user's projects
projectRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const projects = await db.prepare(`
    SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM conversations WHERE project_id = p.id) as conversation_count,
      (SELECT COUNT(*) FROM kb_chunks WHERE project_id = p.id GROUP BY kb_id) as kb_count
    FROM projects p
    WHERE p.user_id = ?
    ORDER BY p.updated_at DESC
  `).all(user.id);

  return c.json({ projects });
});

// Get project details
projectRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const db = getDb();

  const project = await db.prepare(`
    SELECT * FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ project });
});

// Update project
projectRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const { name, description, customInstructions } = await c.req.json();
  const db = getDb();

  const existing = await db.prepare(`
    SELECT id FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id);

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'Project name cannot be empty' }, 400);
    }
    updates.push('name = ?');
    values.push(name.trim());
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (customInstructions !== undefined) {
    updates.push('custom_instructions = ?');
    values.push(customInstructions || null);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push('updated_at = unixepoch()');
  values.push(projectId, user.id);

  await db.prepare(`
    UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).run(...values);

  return c.json({ success: true });
});

// Delete project (clears project_id from conversations and KB chunks)
projectRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const db = getDb();

  const existing = await db.prepare(`
    SELECT id FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id);

  if (!existing) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Clear project_id references before deleting
  await db.prepare(`UPDATE conversations SET project_id = NULL WHERE project_id = ?`).run(projectId);
  await db.prepare(`UPDATE kb_chunks SET project_id = NULL WHERE project_id = ?`).run(projectId);

  await db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).run(projectId, user.id);

  return c.json({ success: true });
});

// List conversations in a project
projectRoutes.get('/:id/conversations', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const db = getDb();

  const project = await db.prepare(`
    SELECT id FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const conversations = await db.prepare(`
    SELECT id, title, model, created_at, updated_at
    FROM conversations
    WHERE project_id = ? AND user_id = ?
    ORDER BY updated_at DESC
  `).all(projectId, user.id);

  return c.json({ conversations });
});

// List knowledge bases in a project
projectRoutes.get('/:id/kbs', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const db = getDb();

  const project = await db.prepare(`
    SELECT id FROM projects WHERE id = ? AND user_id = ?
  `).get(projectId, user.id);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const kbs = await db.prepare(`
    SELECT kb_id, source_file, COUNT(*) as chunk_count, MAX(created_at) as last_updated
    FROM kb_chunks
    WHERE project_id = ? AND user_id = ?
    GROUP BY kb_id, source_file
    ORDER BY last_updated DESC
  `).all(projectId, user.id);

  return c.json({ kbs });
});
