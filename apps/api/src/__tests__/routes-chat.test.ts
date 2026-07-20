import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';

// We test the route handlers by creating a minimal Hono app with the chat routes.
// We mock the database and external services.

// Create mock database with per-query prepare chaining
const mockStatement = {
  get: vi.fn(),
  all: vi.fn().mockReturnValue([]),
  run: vi.fn(),
};
const mockDb = {
  prepare: vi.fn().mockReturnValue(mockStatement),
  exec: vi.fn(),
  pragma: vi.fn(),
};

vi.mock('../db/init.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock('../agent/orchestrator.js', () => ({
  AgentOrchestrator: vi.fn(),
  resolvePermission: vi.fn(),
}));

vi.mock('../agent/providers.js', () => ({
  getModel: vi.fn(),
  PROVIDER_MODELS: [],
}));

vi.mock('../sandbox/service.js', () => ({
  sandboxService: {
    createSession: vi.fn().mockResolvedValue({ id: 'sb-1' }),
    getTemporaryFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn(),
  },
}));

vi.mock('../middleware/rateLimit.js', () => ({
  chatLimit: vi.fn(() => async (c: any, next: any) => next()),
  authLimit: vi.fn(() => async (c: any, next: any) => next()),
  apiLimit: vi.fn(() => async (c: any, next: any) => next()),
  modelLimit: vi.fn(() => async (c: any, next: any) => next()),
  rateLimit: vi.fn(() => async (c: any, next: any) => next()),
}));

vi.mock('../kb/vector.js', () => ({
  searchChunks: vi.fn().mockResolvedValue([]),
}));

vi.mock('../artifacts/service.js', () => ({
  artifactService: {
    create: vi.fn().mockResolvedValue({ id: 'a-1', title: 'test.html', type: 'html', content: '<html>' }),
  },
}));

import { chatRoutes } from '../routes/chat.js';

function createTestApp(user: any = { id: 'u1' }) {
  const app = new Hono();
  // Set user in context
  app.use('*', async (c: Context, next: Next) => {
    c.set('user', user);
    await next();
  });
  app.route('/chat', chatRoutes);
  return app;
}

describe('chat routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /conversations', () => {
    it('should create a conversation and return id', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test conv', model: 'gpt-4o' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Test conv');
    });

    it('should return 404 for invalid projectId', async () => {
      mockStatement.get.mockReturnValue(undefined);
      const app = createTestApp();
      const res = await app.request('/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', projectId: 'p-invalid' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /conversations', () => {
    it('should list conversations', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/conversations');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toBeDefined();
    });
  });

  describe('GET /conversations/:id', () => {
    it('should return 404 for non-existent conversation', async () => {
      mockStatement.get.mockReturnValue(undefined);
      const app = createTestApp();
      const res = await app.request('/chat/conversations/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /conversations/:id', () => {
    it('should update title', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should update starred', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: true }),
      });
      expect(res.status).toBe(200);
    });

    it('should update archived', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      expect(res.status).toBe(200);
    });

    it('should return 404 if conversation not found', async () => {
      mockStatement.get.mockReturnValue(undefined);
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 400 if no fields to update', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /conversations/:id/messages', () => {
    it('should reject messages exceeding 100000 chars', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'x'.repeat(100001) }),
      });
      expect(res.status).toBe(413);
    });

    it('should return 404 for non-existent conversation', async () => {
      mockStatement.get.mockReturnValue(undefined);
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });
      expect(res.status).toBe(404);
    });

    it('should return 400 when no API key is configured', async () => {
      mockStatement.get.mockReturnValue({ id: 'c1', user_id: 'u1' });
      // Ensure env has no API keys
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello', incognito: false }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /permission-response', () => {
    it('should accept valid allow decision', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissionId: 'perm-1',
          decision: 'allow',
          remember: false,
          toolName: 'read_file',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should accept valid deny decision', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissionId: 'perm-1',
          decision: 'deny',
          remember: false,
        }),
      });
      expect(res.status).toBe(200);
    });

    it('should store permission when remember=true', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissionId: 'perm-1',
          decision: 'allow',
          remember: true,
          toolName: 'read_file',
        }),
      });
      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid decision', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissionId: 'perm-1',
          decision: 'maybe',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing permissionId', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'allow',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /conversations/:id', () => {
    it('should delete a conversation', async () => {
      const app = createTestApp();
      const res = await app.request('/chat/conversations/c1', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});