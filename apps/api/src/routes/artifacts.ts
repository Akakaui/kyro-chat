import { Hono } from 'hono';
import { artifactService } from '../artifacts/service.js';
import { sandboxService } from '../sandbox/service.js';
import { getDb } from '../db/init.js';
import { apiLimit } from '../middleware/rateLimit.js';

export const artifactRoutes = new Hono();

// Apply general API rate limit to all artifact routes
artifactRoutes.use('*', apiLimit);

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
  const { expiresInHours = 24, visibility = 'link' } = await c.req.json();

  const result = artifactService.createShareLink(id, user.id, expiresInHours);
  if (!result) return c.json({ error: 'Not found' }, 404);

  // Store visibility preference
  const db = getDb();
  await db.prepare(`
    UPDATE artifacts
    SET share_visibility = ?
    WHERE id = ? AND user_id = ?
  `).run(visibility, id, user.id);

  return c.json({
    shareUrl: result.shareUrl,
    shareId: result.shareUrl.split('/').pop(),
    expiresAt: result.expiresAt,
    visibility,
  });
});

// Get artifact by share hash (public)
artifactRoutes.get('/share/:hash', async (c) => {
  const hash = c.req.param('hash');

  const artifact = artifactService.getByShareHash(hash);
  if (!artifact) return c.json({ error: 'Not found or expired' }, 404);

  return c.json({
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    metadata: artifact.metadata,
    shareHash: artifact.shareHash,
  });
});

// Remix shared artifact
artifactRoutes.post('/share/:hash/remix', async (c) => {
  const hash = c.req.param('hash');
  const user = c.get('user');

  const artifact = artifactService.getByShareHash(hash);
  if (!artifact) return c.json({ error: 'Not found or expired' }, 404);

  // Create a new conversation with the artifact as context
  const db = getDb();
  const conversationId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO conversations (id, user_id, title, model)
    VALUES (?, ?, ?, ?)
  `).run(
    conversationId,
    user.id,
    `Remix: ${artifact.title}`,
    'claude-sonnet-4-20250514'
  );

  // Add system message with artifact context
  const contextMessage = [
    `I'm sharing an artifact I'd like you to help me remix or modify.`,
    '',
    `**Original Artifact: ${artifact.title}**`,
    `Type: ${artifact.type}`,
    '',
    'Content:',
    artifact.content.slice(0, 5000),
    '',
    'Please help me modify or improve this artifact. What changes would you like?',
  ].join('\n');

  await db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content)
    VALUES (?, ?, 'user', ?)
  `).run(crypto.randomUUID(), conversationId, contextMessage);

  // Copy the artifact to user's account
  await artifactService.create(
    user.id,
    artifact.type,
    `[Remix] ${artifact.title}`,
    artifact.content,
    { ...artifact.metadata, remixedFrom: artifact.shareHash }
  );

  return c.json({
    conversationId,
    artifactCopied: true,
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

// ---------- E2B sandbox-based sharing ----------

// Create a live sandbox share (HTML artifacts)
artifactRoutes.post('/:id/sandbox-share', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { expiresInHours } = await c.req.json().catch(() => ({}));

  const result = await artifactService.createSandboxShare(
    id,
    user.id,
    expiresInHours ?? 1,
  );
  if (!result) return c.json({ error: 'Not found' }, 404);

  return c.json(result);
});

// Destroy a sandbox share
artifactRoutes.delete('/:id/sandbox-share', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = await artifactService.destroySandboxShare(id, user.id);
  if (!success) return c.json({ error: 'Not found or no active sandbox' }, 404);

  return c.json({ success: true });
});

// ---------- Sandbox output artifacts ----------

// Create artifact from sandbox file
artifactRoutes.post('/from-sandbox', async (c) => {
  const user = c.get('user');
  const { sandboxId, path, type, title } = await c.req.json();

  const session = sandboxService.getSession(sandboxId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Sandbox not found' }, 404);
  }

  try {
    const content = await sandboxService.readFile(sandboxId, path);
    const artifactType = type || detectArtifactType(path);
    const artifactTitle = title || path.split('/').pop() || 'Untitled';

    const artifact = await artifactService.create(
      user.id,
      artifactType,
      artifactTitle,
      content,
      { sandboxId, sandboxPath: path }
    );

    return c.json({ artifact });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Bulk create artifacts from sandbox session
artifactRoutes.post('/from-sandbox/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Sandbox not found' }, 404);
  }

  try {
    const tempFiles = await sandboxService.getTemporaryFiles(sessionId);
    const artifacts = [];

    for (const file of tempFiles) {
      try {
        const content = await sandboxService.readFile(sessionId, file.path);
        const artifactType = detectArtifactType(file.path);
        const artifact = await artifactService.create(
          user.id,
          artifactType,
          file.name,
          content,
          { sandboxId: sessionId, sandboxPath: file.path, size: file.size }
        );
        artifacts.push(artifact);
      } catch {
        // Skip files that can't be read
      }
    }

    return c.json({ artifacts, count: artifacts.length });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Helper function to detect artifact type from file extension
function detectArtifactType(path: string): 'html' | 'pdf' | 'markdown' | 'code' {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'pdf':
      return 'pdf';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'code';
  }
}
