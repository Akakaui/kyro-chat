import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  rateLimit,
  chatLimit,
  authLimit,
  apiLimit,
  modelLimit,
  _resetAllStores,
} from '../middleware/rateLimit.js';

function makeRequest(app: Hono, path = '/', headers: Record<string, string> = {}) {
  return app.request(path, { headers });
}

function buildTestApp(limiter: ReturnType<typeof rateLimit>) {
  const app = new Hono();
  app.use('*', limiter);
  app.get('/', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    _resetAllStores();
  });

  // ── Basic allow ────────────────────────────────────────────────────────

  it('allows requests within the limit', async () => {
    const app = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 5 }, 'test-basic'),
    );

    const res = await makeRequest(app);
    expect(res.status).toBe(200);

    const headers = res.headers;
    expect(headers.get('X-RateLimit-Limit')).toBe('5');
    expect(headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  // ── Blocks over limit ──────────────────────────────────────────────────

  it('returns 429 when limit exceeded', async () => {
    const app = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 3 }, 'test-block'),
    );

    // Send 3 allowed requests
    await makeRequest(app);
    await makeRequest(app);
    await makeRequest(app);

    // 4th should be blocked
    const res = await makeRequest(app);
    expect(res.status).toBe(429);

    const body: any = await res.json();
    expect(body.error).toBe('Too many requests. Please wait before sending another message.');
    expect(typeof body.retryAfter).toBe('number');
    expect(body.retryAfter).toBeGreaterThan(0);

    const headers = res.headers;
    expect(headers.get('Retry-After')).toBeTruthy();
    expect(headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  // ── Separate stores ────────────────────────────────────────────────────

  it('different store names are isolated', async () => {
    const appA = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 1 }, 'store-a'),
    );
    const appB = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 1 }, 'store-b'),
    );

    await makeRequest(appA); // 1/1 for store-a
    const resA = await makeRequest(appA); // should be blocked
    expect(resA.status).toBe(429);

    // store-b still has its budget
    const resB = await makeRequest(appB);
    expect(resB.status).toBe(200);
  });

  // ── Custom keyFn ───────────────────────────────────────────────────────

  it('uses custom keyFn when provided', async () => {
    let capturedKey = '';
    const limiter = rateLimit(
      {
        windowMs: 60_000,
        maxRequests: 100,
        keyFn: (c) => {
          capturedKey = `custom:${c.req.header('x-test-id') || 'none'}`;
          return capturedKey;
        },
      },
      'test-keyfn',
    );

    const app = buildTestApp(limiter);

    await makeRequest(app, '/', { 'x-test-id': 'user-42' });
    expect(capturedKey).toBe('custom:user-42');
  });

  // ── Keyed by user ID ───────────────────────────────────────────────────

  it('keys by user ID when user is present', async () => {
    const limiter = rateLimit(
      { windowMs: 60_000, maxRequests: 2 },
      'test-user-key',
    );

    const app = new Hono();
    app.use('*', (c, next) => {
      c.set('user', { id: 'user-abc', email: 'a@b.com' });
      return next();
    });
    app.use('*', limiter);
    app.get('/', (c) => c.json({ ok: true }));

    await makeRequest(app);
    const res2 = await makeRequest(app);
    expect(res2.status).toBe(200);

    const res3 = await makeRequest(app);
    expect(res3.status).toBe(429);
  });

  // ── Window reset ───────────────────────────────────────────────────────

  it('resets after window expires', async () => {
    const app = buildTestApp(
      rateLimit({ windowMs: 100, maxRequests: 1 }, 'test-reset'),
    );

    await makeRequest(app); // 1/1
    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    const allowed = await makeRequest(app);
    expect(allowed.status).toBe(200);
  });

  // ── Pre-configured limiters ────────────────────────────────────────────

  it('chatLimit allows 50 requests', async () => {
    const app = buildTestApp(chatLimit);

    for (let i = 0; i < 50; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }

    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);
  });

  it('modelLimit allows 30 requests', async () => {
    const app = buildTestApp(modelLimit);

    for (let i = 0; i < 30; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }

    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);
  });

  it('apiLimit allows 100 requests', async () => {
    const app = buildTestApp(apiLimit);

    for (let i = 0; i < 100; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }

    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);
  });

  it('authLimit allows 10 requests', async () => {
    const app = buildTestApp(authLimit);

    for (let i = 0; i < 10; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }

    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);
  });

  // ── Headers on success ─────────────────────────────────────────────────

  it('returns correct headers on allowed requests', async () => {
    const app = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 10 }, 'test-headers'),
    );

    const res = await makeRequest(app);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
    expect(res.headers.has('Retry-After')).toBe(false);
  });

  // ── _resetAllStores ────────────────────────────────────────────────────

  it('_resetAllStores clears all stores', async () => {
    const app = buildTestApp(
      rateLimit({ windowMs: 60_000, maxRequests: 1 }, 'test-reset-all'),
    );

    await makeRequest(app);
    const blocked = await makeRequest(app);
    expect(blocked.status).toBe(429);

    _resetAllStores();

    const allowed = await makeRequest(app);
    expect(allowed.status).toBe(200);
  });
});
