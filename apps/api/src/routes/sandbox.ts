import { Hono } from 'hono';
import { sandboxService } from '../sandbox/service.js';

export const sandboxRoutes = new Hono();

// Create sandbox session
sandboxRoutes.post('/create', async (c) => {
  const user = c.get('user');
  const { language = 'node' } = await c.req.json();

  try {
    const session = await sandboxService.createSession(user.id, language);
    return c.json({
      sessionId: session.id,
      language: session.language,
      status: session.status,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Execute code in sandbox
sandboxRoutes.post('/execute/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { code, language } = await c.req.json();

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const result = await sandboxService.execute(sessionId, code, language);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Install package in sandbox
sandboxRoutes.post('/install/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { package: packageName } = await c.req.json();

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const output = await sandboxService.installPackage(sessionId, packageName);
    return c.json({ output });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Destroy sandbox session
sandboxRoutes.delete('/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await sandboxService.destroySession(sessionId);
  return c.json({ success: true });
});

// List user's sessions
sandboxRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  const sessions = sandboxService.listSessions(user.id);

  return c.json({
    sessions: sessions.map(s => ({
      sessionId: s.id,
      language: s.language,
      status: s.status,
      createdAt: s.createdAt,
      lastUsed: s.lastUsed,
    })),
  });
});

// Get session status
sandboxRoutes.get('/status/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    sessionId: session.id,
    language: session.language,
    status: session.status,
  });
});
