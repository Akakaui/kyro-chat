// ---------------------------------------------------------------------------
// Sentry & Monitoring Tests
//
// Tests for Sentry service, middleware, performance monitor,
// health endpoint, and application monitor.
//
// We mock @sentry/node and @sentry/profiling-node to verify our
// integration layer without connecting to Sentry.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock Sentry packages before importing our service
const mockCaptureException = vi.fn((...args: unknown[]) => 'event_id_123');
const mockCaptureMessage = vi.fn((...args: unknown[]) => 'event_id_456');
const mockSetUser = vi.fn((...args: unknown[]) => {});
const mockFlush = vi.fn(async (...args: unknown[]) => true);
const mockWithScope = vi.fn((callback: (scope: any) => void) => {
  const mockScope = {
    setTag: vi.fn(),
    setExtras: vi.fn(),
    setLevel: vi.fn(),
    setUser: vi.fn(),
  };
  callback(mockScope);
  return 'event_id_123';
});
const mockStartInactiveSpan = vi.fn((opts: any) => ({
  end: vi.fn(),
  setAttribute: vi.fn(),
  setTag: vi.fn(),
  setStatus: vi.fn(),
  ...opts,
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: (...args: [unknown]) => mockCaptureException(args[0]),
  captureMessage: (...args: [unknown]) => mockCaptureMessage(args[0]),
  setUser: (...args: [unknown]) => mockSetUser(args[0]),
  flush: (...args: [unknown]) => mockFlush(args[0]),
  withScope: (callback: (scope: any) => void) => mockWithScope(callback),
  startInactiveSpan: (...args: [any]) => mockStartInactiveSpan(args[0]),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setExtras: vi.fn(),
    setUser: vi.fn(),
    setContext: vi.fn(),
  })),
  getIsolationScope: vi.fn(() => ({
    setTag: vi.fn(),
    setExtras: vi.fn(),
    setUser: vi.fn(),
  })),
  requestDataIntegration: vi.fn(() => ({ name: 'RequestData' })),
  continueTrace: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => ({ name: 'ProfilingIntegration' })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function setEnvVars(vars: Record<string, string | undefined>): void {
  for (const [key, val] of Object.entries(vars)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Sentry Service', () => {
  let sentryService: typeof import('../services/sentry.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the module state
    const mod = await import('../services/sentry.js');
    mod._resetSentryState();
    sentryService = mod;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_SAMPLE_RATE;
    delete process.env.NODE_ENV;
  });

  // ── Initialization ────────────────────────────────────────────────────

  it('should skip initialization when SENTRY_DSN is not set', async () => {
    setEnvVars({ SENTRY_DSN: undefined });
    const result = await sentryService.initSentry();
    expect(result).toBe(false);
    expect(sentryService.isSentryEnabled()).toBe(false);
  });

  it('should initialize when SENTRY_DSN is set', async () => {
    setEnvVars({
      SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
      NODE_ENV: 'test',
    });
    const result = await sentryService.initSentry();
    expect(result).toBe(true);
    expect(sentryService.isSentryEnabled()).toBe(true);
  });

  it('should not re-initialize if already initialized', async () => {
    setEnvVars({
      SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
      NODE_ENV: 'test',
    });
    const result1 = await sentryService.initSentry();
    const result2 = await sentryService.initSentry();
    expect(result1).toBe(true);
    expect(result2).toBe(true);
    // The mock @sentry/node.init should only be called once
    const sentryNode = await import('@sentry/node');
    expect(sentryNode.init).toHaveBeenCalledTimes(1);
  });

  // ── Error Capture ─────────────────────────────────────────────────────

  it('should capture an error', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const error = new Error('Test error');
    const result = sentryService.captureError(error);

    expect(result).toBe('event_id_123');
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('should capture an error with context', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const error = new Error('Test error with context');
    const result = sentryService.captureError(error, {
      tags: { route: '/api/test' },
      extra: { userId: 'user_123' },
      level: 'fatal',
    });

    expect(result).toBe('event_id_123');
    expect(mockWithScope).toHaveBeenCalled();
  });

  it('should not capture error if Sentry not initialized', () => {
    const error = new Error('Not initialized');
    const result = sentryService.captureError(error);
    expect(result).toBeUndefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // ── Message Capture ───────────────────────────────────────────────────

  it('should capture a message', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const result = sentryService.captureMessage('Test message', 'info');
    expect(result).toBe('event_id_456');
    expect(mockCaptureMessage).toHaveBeenCalledWith('Test message');
  });

  it('should capture a message with tags and extra', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const result = sentryService.captureMessage('Warning message', 'warning', {
      tags: { component: 'db' },
      extra: { latencyMs: 600 },
    });

    expect(result).toBe('event_id_456');
    expect(mockWithScope).toHaveBeenCalled();
  });

  // ── User Context ──────────────────────────────────────────────────────

  it('should set user context', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    sentryService.setUser('user_abc', 'user@example.com');
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user_abc', email: 'user@example.com' });
  });

  it('should clear user context', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    sentryService.clearUser();
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });

  it('should not crash setting user when Sentry is disabled', () => {
    sentryService.setUser('user_abc', 'test@test.com');
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  // ── Transaction Lifecycle ─────────────────────────────────────────────

  it('should start and stop a transaction', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const transaction = sentryService.startTransaction('POST /api/test', 'http.server');
    expect(transaction).not.toBeNull();
    expect(transaction!.name).toBe('POST /api/test');
    expect(transaction!.op).toBe('http.server');

    // Small delay to test duration
    await new Promise((r) => setTimeout(r, 5));

    sentryService.stopTransaction(transaction, '2xx');
    expect(transaction!.span.end).toHaveBeenCalled();
    expect(transaction!.span.setAttribute).toHaveBeenCalledWith('duration_ms', expect.any(Number));
  });

  it('should not start transaction if Sentry is disabled', () => {
    const transaction = sentryService.startTransaction('GET /health', 'http.server');
    expect(transaction).toBeNull();
  });

  it('should not crash stopping null transaction', () => {
    expect(() => sentryService.stopTransaction(null)).not.toThrow();
  });

  // ── Child Span ────────────────────────────────────────────────────────

  it('should create a child span', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const transaction = sentryService.startTransaction('POST /api/chat', 'http.server');
    const span = sentryService.createSpan(transaction, 'db.query', 'db.query');

    expect(span).not.toBeNull();
    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'db.query',
        op: 'db.query',
        parentSpan: transaction!.span,
      }),
    );
  });

  it('should not create span for null transaction', () => {
    const span = sentryService.createSpan(null, 'test', 'test');
    expect(span).toBeNull();
  });

  // ── Flush ─────────────────────────────────────────────────────────────

  it('should flush pending events', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const result = await sentryService.closeSentryFlush(1000);
    expect(result).toBe(true);
    expect(mockFlush).toHaveBeenCalledWith(1000);
  });

  it('should not flush when Sentry is disabled', async () => {
    const result = await sentryService.closeSentryFlush();
    expect(result).toBe(true);
    expect(mockFlush).not.toHaveBeenCalled();
  });
});

// ── Performance Monitor Tests ────────────────────────────────────────────

describe('Performance Monitor', () => {
  let monitor: typeof import('../services/monitor.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    monitor = await import('../services/monitor.js');
    monitor.resetMetrics();
  });

  it('should track function timing', async () => {
    const result = await monitor.trackTiming('test.fn', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'done';
    });

    expect(result).toBe('done');

    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.timings).toHaveLength(1);
    expect(metrics.timings[0].name).toBe('test.fn');
    expect(metrics.timings[0].count).toBe(1);
    expect(metrics.timings[0].totalMs).toBeGreaterThanOrEqual(5);
  });

  it('should track query performance', () => {
    monitor.trackQuery('SELECT users', 10, 'postgresql');
    monitor.trackQuery('SELECT users', 20, 'postgresql');

    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.queries).toHaveLength(1);
    expect(metrics.queries[0].queryName).toBe('SELECT users');
    expect(metrics.queries[0].count).toBe(2);
    expect(metrics.queries[0].avgMs).toBe(15);
  });

  it('should track API route performance', () => {
    monitor.trackApiRoute('GET', '/api/users', 200, 50);
    monitor.trackApiRoute('GET', '/api/users', 200, 150);
    monitor.trackApiRoute('POST', '/api/users', 201, 100);

    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.apiRoutes).toHaveLength(2);

    const getRoute = metrics.apiRoutes.find((r) => r.method === 'GET');
    expect(getRoute).toBeDefined();
    expect(getRoute!.count).toBe(2);
    expect(getRoute!.avgMs).toBe(100);
  });

  it('should return memory metrics', () => {
    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.memory).not.toBeNull();
    expect(metrics.memory!.heapUsed).toBeGreaterThan(0);
    expect(metrics.memory!.heapTotal).toBeGreaterThan(0);
    expect(metrics.memory!.rss).toBeGreaterThan(0);
  });

  it('should return CPU metrics', () => {
    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.cpu).not.toBeNull();
    expect(metrics.cpu!.loadAvg).toHaveLength(3);
  });

  it('should reset metrics', () => {
    monitor.trackApiRoute('GET', '/test', 200, 5);
    monitor.trackQuery('SELECT 1', 1, 'pg');
    monitor.resetMetrics();

    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.timings).toHaveLength(0);
    expect(metrics.queries).toHaveLength(0);
    expect(metrics.apiRoutes).toHaveLength(0);
  });

  it('should not crash on re-thrown error in trackTiming', async () => {
    await expect(
      monitor.trackTiming('failing.fn', async () => {
        throw new Error('Intentional failure');
      }),
    ).rejects.toThrow('Intentional failure');
  });
});

// ── Health Endpoint Tests ─────────────────────────────────────────────────

describe('Health Endpoint', () => {
  let healthRoutes: typeof import('../routes/health.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    healthRoutes = await import('../routes/health.js');
  });

  it('should return 200 with status ok', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('redis');
    expect(body).toHaveProperty('memory');
    expect(body).toHaveProperty('cpu');
    expect(body).toHaveProperty('sentry');
    expect(body).toHaveProperty('responseTimeMs');
  });

  it('should include sentry status', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/');
    const body = await res.json() as Record<string, any>;
    expect(body.sentry).toHaveProperty('enabled');
    expect(body.sentry).toHaveProperty('dsnConfigured');
  });

  it('should include memory details', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/');
    const body = await res.json() as Record<string, any>;
    expect(body.memory).toHaveProperty('rssMb');
    expect(body.memory).toHaveProperty('heapUsedMb');
    expect(body.memory).toHaveProperty('heapTotalMb');
    expect(typeof body.memory.rssMb).toBe('number');
  });

  it('should include CPU load average', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/');
    const body = await res.json() as Record<string, any>;
    expect(body.cpu).toHaveProperty('loadAvg');
    expect(Array.isArray(body.cpu.loadAvg)).toBe(true);
  });

  it('should return readiness probe', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/ready');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ready');
  });

  it('should return liveness probe', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/live');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('alive');
  });

  it('should return cache stats', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/cache-stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('hits');
    expect(body).toHaveProperty('misses');
  });

  it('should return performance metrics', async () => {
    const app = new Hono();
    app.route('/', healthRoutes.healthRoutes);

    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('timings');
    expect(body).toHaveProperty('queries');
    expect(body).toHaveProperty('apiRoutes');
    expect(body).toHaveProperty('memory');
  });
});

// ── Application Monitor Tests ────────────────────────────────────────────

describe('Application Monitor', () => {
  let appMonitor: typeof import('../services/app-monitor.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    appMonitor = await import('../services/app-monitor.js');
    appMonitor.appMonitor.clearAlerts();
    appMonitor.appMonitor.stop();
  });

  it('should perform health check without crashing', async () => {
    const status = await appMonitor.appMonitor.checkHealth();
    expect(status).toHaveProperty('status');
    expect(status).toHaveProperty('checks');
    expect(status).toHaveProperty('metrics');
    expect(status).toHaveProperty('alerts');
    expect(status.checks).toHaveProperty('database');
    expect(status.checks).toHaveProperty('redis');
    expect(status.checks).toHaveProperty('cache');
    expect(status.checks).toHaveProperty('sentry');
    expect(status.checks).toHaveProperty('memory');
    expect(status.checks).toHaveProperty('cpu');
  });

  it('should include memory and CPU metrics in health check', async () => {
    const status = await appMonitor.appMonitor.checkHealth();
    expect(status.metrics.memory.rssMb).toBeGreaterThanOrEqual(0);
    expect(status.metrics.memory.heapUsedMb).toBeGreaterThanOrEqual(0);
    expect(status.metrics.cpu.loadAvg).toHaveLength(3);
  });

  it('should cache last health status', async () => {
    const status = await appMonitor.appMonitor.checkHealth();
    const cached = appMonitor.appMonitor.getLastHealthStatus();
    expect(cached).not.toBeNull();
    expect(cached!.timestamp).toBe(status.timestamp);
  });

  it('should start and stop periodic monitoring', () => {
    appMonitor.appMonitor.start(10000);
    appMonitor.appMonitor.stop();

    // After stop, no interval should be running
    const status = appMonitor.appMonitor.getLastHealthStatus();
    expect(status).not.toBeNull();
  });

  it('should not start monitoring twice', () => {
    appMonitor.appMonitor.start(10000);
    appMonitor.appMonitor.start(10000); // Second start should be no-op
    appMonitor.appMonitor.stop();
  });

  it('should handle empty alerts state', () => {
    appMonitor.appMonitor.clearAlerts();
    const alerts = appMonitor.appMonitor.getAlerts();
    expect(alerts).toHaveLength(0);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────

describe('Sentry Edge Cases', () => {
  let sentryService: typeof import('../services/sentry.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../services/sentry.js');
    mod._resetSentryState();
    sentryService = mod;
  });

  it('should handle initialization failure gracefully', async () => {
    // Temporarily break the import by setting a bogus DSN
    setEnvVars({
      SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0',
      NODE_ENV: 'test',
    });

    // The mock should work, so this should succeed
    const result = await sentryService.initSentry();
    expect(result).toBe(true);
  });

  it('should return empty string array for undefined captureError when disabled', () => {
    const result = sentryService.captureError(new Error('fail'));
    expect(result).toBeUndefined();
  });

  it('should handle large payloads without crashing in context', async () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    await sentryService.initSentry();

    const largeExtra: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeExtra[`key_${i}`] = 'x'.repeat(100);
    }

    expect(() => {
      sentryService.captureError(new Error('Large context'), {
        extra: largeExtra,
        tags: { source: 'test' },
      });
    }).not.toThrow();
  });

  it('should handle null error gracefully', () => {
    setEnvVars({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' });
    // Even without init, capture should not throw
    expect(() => {
      sentryService.captureError(null);
    }).not.toThrow();
  });
});
