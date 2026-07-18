import { Hono } from 'hono';
import { artifactService } from '../artifacts/service.js';

export const artifactRoutes = new Hono();

// Create artifact
artifactRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { type, title, content, metadata } = await c.req.json();

  const artifact = await artifactService.create(user.id, type, title, content, metadata);
  return c.json({ artifact });
});

// List artifacts
artifactRoutes.get('/', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');

  const artifacts = artifactService.list(user.id, limit);
  return c.json({ artifacts });
});

// Get artifact
artifactRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const artifact = artifactService.get(id, user.id);
  if (!artifact) return c.json({ error: 'Not found' }, 404);

  return c.json({ artifact });
});

// Update artifact
artifactRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { title, content, metadata } = await c.req.json();

  const success = artifactService.update(id, user.id, { title, content, metadata });
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

// Delete artifact
artifactRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = artifactService.delete(id, user.id);
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

// Create share link
artifactRoutes.post('/:id/share', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { expiresInHours = 24 } = await c.req.json();

  const result = artifactService.createShareLink(id, user.id, expiresInHours);
  if (!result) return c.json({ error: 'Not found' }, 404);

  return c.json(result);
});

// Get artifact by share hash (public)
artifactRoutes.get('/share/:hash', async (c) => {
  const hash = c.req.param('hash');

  const artifact = artifactService.getByShareHash(hash);
  if (!artifact) return c.json({ error: 'Not found or expired' }, 404);

  // Return limited info for public view
  return c.json({
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    metadata: artifact.metadata,
  });
});

// Revoke share link
artifactRoutes.delete('/:id/share', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = artifactService.revokeShareLink(id, user.id);
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});
