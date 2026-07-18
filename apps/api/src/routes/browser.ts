import { Hono } from 'hono';
import { browserService } from '../browser/service.js';

export const browserRoutes = new Hono();

// Start browser session
browserRoutes.post('/start', async (c) => {
  const user = c.get('user');

  try {
    const session = await browserService.startSession(user.id);
    return c.json({
      sessionId: session.id,
      vncUrl: session.vncUrl,
      websocketUrl: session.websocketUrl,
      status: session.status,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Stop browser session
browserRoutes.post('/stop/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await browserService.stopSession(sessionId);
  return c.json({ success: true });
});

// Get session status
browserRoutes.get('/status/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({
    sessionId: session.id,
    status: session.status,
    vncUrl: session.vncUrl,
    websocketUrl: session.websocketUrl,
  });
});

// List user's sessions
browserRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  const sessions = browserService.listSessions(user.id);

  return c.json({
    sessions: sessions.map(s => ({
      sessionId: s.id,
      status: s.status,
      vncUrl: s.vncUrl,
      createdAt: s.createdAt,
    })),
  });
});

// Take screenshot
browserRoutes.get('/screenshot/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const screenshot = await browserService.screenshot(sessionId);
    c.header('Content-Type', 'image/png');
    return c.body(new Uint8Array(screenshot));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Execute command in browser
browserRoutes.post('/execute/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { command } = await c.req.json();

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const output = await browserService.executeCommand(sessionId, command);
    return c.json({ output });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
