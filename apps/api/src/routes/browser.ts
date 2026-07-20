import { Hono } from 'hono';
import { browserService } from '../browser/service.js';

export const browserRoutes = new Hono();

// ── H2: Helper to build a proxied WebSocket URL instead of leaking internal ws://localhost ──
function getProxiedWsUrl(sessionId: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const wsProtocol = frontendUrl.startsWith('https') ? 'wss' : 'ws';
  const host = new URL(frontendUrl).host;
  return `${wsProtocol}://${host}/api/browser/ws/${sessionId}`;
}

// Start browser session
browserRoutes.post('/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const persistent = body?.persistent ?? false;

  try {
    const session = await browserService.startSession(user.id, persistent);
    const vncResult = browserService.getVncUrl(session.id);
    return c.json({
      sessionId: session.id,
      vncUrl: vncResult.url,
      vncHeaders: vncResult.headers,
      websocketUrl: getProxiedWsUrl(session.id),
      status: session.status,
      persistent: session.persistent,
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

  const vncResult = browserService.getVncUrl(session.id);
  return c.json({
    sessionId: session.id,
    status: session.status,
    vncUrl: vncResult.url,
    vncHeaders: vncResult.headers,
    websocketUrl: getProxiedWsUrl(session.id),
    persistent: session.persistent,
  });
});

// List user's sessions
browserRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  const sessions = browserService.listSessions(user.id);

  return c.json({
    sessions: sessions.map(s => {
      const vncResult = browserService.getVncUrl(s.id);
      return {
        sessionId: s.id,
        status: s.status,
        vncUrl: vncResult.url,
        vncHeaders: vncResult.headers,
        persistent: s.persistent,
        createdAt: s.createdAt,
      };
    }),
  });
});

// ─── New Routes ───

// Get noVNC URL for iframe embedding
browserRoutes.get('/vnc/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const vncResult = browserService.getVncUrl(sessionId);
    // Apply security headers to prevent credential leakage
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return c.json({ vncUrl: vncResult.url, headers: vncResult.headers });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// List open tabs
browserRoutes.get('/tabs/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const tabs = await browserService.getTabs(sessionId);
    return c.json({ tabs });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Switch active tab
browserRoutes.post('/tabs/:sessionId/switch', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { tabId } = await c.req.json();

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    await browserService.switchTab(sessionId, tabId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Install Chrome extension
browserRoutes.post('/tabs/:sessionId/install-extension', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { extensionUrl } = await c.req.json();

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    await browserService.installExtension(sessionId, extensionUrl);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Capture screenshot for LLM context
browserRoutes.post('/tabs/:sessionId/screenshot', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const screenshot = await browserService.screenshotForLLM(sessionId);
    return c.json({ screenshot });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// SSE stream for human input requests (agent pauses, user provides input)
browserRoutes.get('/human-input-stream/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = browserService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const encoder = new TextEncoder();
  let keepAliveId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Register this client for SSE broadcasts
      browserService.addSSEClient(sessionId, controller);

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`)
      );

      // Keep-alive ping every 30s
      keepAliveId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: keep-alive\n\n`));
        } catch {
          if (keepAliveId) clearInterval(keepAliveId);
        }
      }, 30000);
    },
    cancel() {
      // Clean up SSE client and keep-alive on stream cancel
      if (keepAliveId) clearInterval(keepAliveId);
      browserService.removeSSEClient(sessionId);
    },
  });

  // Clean up SSE client on connection abort
  c.req.raw.signal?.addEventListener('abort', () => {
    if (keepAliveId) clearInterval(keepAliveId);
    browserService.removeSSEClient(sessionId);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

// Submit human input (user provides response to agent's request)
browserRoutes.post('/wait-input', async (c) => {
  const { requestId, input } = await c.req.json();

  if (!requestId || input === undefined) {
    return c.json({ error: 'requestId and input are required' }, 400);
  }

  const success = browserService.submitHumanInput(requestId, input);
  if (!success) {
    return c.json({ error: 'Request not found or already resolved' }, 404);
  }

  return c.json({ success: true });
});

// Check if human input was provided
browserRoutes.get('/human-input-status/:requestId', async (c) => {
  const requestId = c.req.param('requestId');
  // A simple check — if the request no longer exists, it was resolved
  // We return a simple status; the real flow uses SSE
  return c.json({ status: 'pending', requestId });
});

// Take screenshot (existing)
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

// Execute command in browser (existing)
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
