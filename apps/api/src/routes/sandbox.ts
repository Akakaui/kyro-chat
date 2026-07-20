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

// Execute a command in sandbox
sandboxRoutes.post('/command/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const { command } = await c.req.json();

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const result = await sandboxService.executeCommand(sessionId, command);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// List temporary files created in sandbox
sandboxRoutes.get('/temp-files/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const files = await sandboxService.getTemporaryFiles(sessionId);
    return c.json({ files, count: files.length });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Download a file from sandbox
sandboxRoutes.get('/download/:sessionId/*', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const filePath = '/' + c.req.path.replace(`/sandbox/download/${sessionId}/`, '');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const content = await sandboxService.downloadFile(sessionId, filePath);
    const fileName = filePath.split('/').pop() || 'file';
    return new Response(content, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Download all temporary files as zip
sandboxRoutes.get('/download-all/:sessionId', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const zipBuffer = await sandboxService.downloadAllAsZip(sessionId);
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="sandbox-files-${sessionId.slice(0, 8)}.zip"`,
      },
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// List files in sandbox directory
sandboxRoutes.get('/files/:sessionId/*', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');
  const dirPath = '/' + c.req.path.replace(`/sandbox/files/${sessionId}/`, '');

  const session = sandboxService.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const files = await sandboxService.listFiles(sessionId, dirPath);
    return c.json({ files, path: dirPath });
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
