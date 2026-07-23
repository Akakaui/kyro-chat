// ---------------------------------------------------------------------------
// Health Check Routes
//
// Enhanced health endpoint with DB, Redis, memory, CPU, and Sentry status.
// All endpoints are public and unauthenticated.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { getRedis } from '../services/redis.js';
import { getCache } from '../services/cache.js';
import { isSentryEnabled } from '../services/sentry.js';
import { getPerformanceMetrics } from '../services/monitor.js';
import { isPostgreSQLAvailable, getPgPool } from '../db/init.js';

export const healthRoutes = new Hono();

// ── Combined health check ─────────────────────────────────────────────────

healthRoutes.get('/', async (c) => {
  const start = Date.now();

  // Run checks in parallel
  const [redisStatus, postgresAvailable, cacheStats] = await Promise.all([
    checkRedis(),
    checkPostgres(),
    checkCache(),
  ]);

  const duration = Date.now() - start;
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  const status = redisStatus === 'down' || postgresAvailable === 'down'
    ? 'degraded'
    : 'ok';

  return c.json({
    status,
    version: process.env.npm_package_version || '1.0.0',
    uptime,
    timestamp: new Date().toISOString(),
    responseTimeMs: duration,
    db: {
      status: postgresAvailable,
      type: isPostgreSQLAvailable() ? 'postgresql' : 'sqlite',
    },
    redis: {
      status: redisStatus,
    },
    cache: cacheStats,
    memory: {
      rssMb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
    },
    cpu: {
      loadAvg: getLoadAvg(),
    },
    sentry: {
      enabled: isSentryEnabled(),
      dsnConfigured: !!process.env.SENTRY_DSN,
    },
  });
});

// ── Readiness probe ───────────────────────────────────────────────────────

healthRoutes.get('/ready', (c) => {
  return c.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// ── Version endpoint ──────────────────────────────────────────────────────

healthRoutes.get('/version', (c) => {
  return c.json({
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

// ── Liveness probe ────────────────────────────────────────────────────────

healthRoutes.get('/live', (c) => {
  return c.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ── Cache statistics ──────────────────────────────────────────────────────

healthRoutes.get('/cache-stats', async (c) => {
  const cache = getCache();
  const stats = cache.getStats();
  return c.json(stats);
});

// ── Performance metrics ───────────────────────────────────────────────────

healthRoutes.get('/metrics', async (c) => {
  const metrics = getPerformanceMetrics();
  return c.json(metrics);
});

// ── Internal check helpers ────────────────────────────────────────────────

async function checkRedis(): Promise<'connected' | 'fallback' | 'down'> {
  try {
    const redis = getRedis();
    const result = await redis.ping();
    if (result === 'PONG') return 'connected';
    if (result === 'NO_REDIS') return 'fallback';
    return 'fallback';
  } catch {
    return 'down';
  }
}

async function checkPostgres(): Promise<'connected' | 'not_configured' | 'down'> {
  if (!isPostgreSQLAvailable()) return 'not_configured';
  try {
    const pool = getPgPool();
    await pool.query('SELECT 1');
    return 'connected';
  } catch {
    return 'down';
  }
}

async function checkCache(): Promise<{ hitRate: string; total: number }> {
  try {
    const cache = getCache();
    const stats = cache.getStats();
    return {
      hitRate: `${(stats.ratio * 100).toFixed(1)}%`,
      total: stats.total,
    };
  } catch {
    return { hitRate: '0%', total: 0 };
  }
}

function getLoadAvg(): number[] {
  try {
    const os = require('os');
    return os.loadavg();
  } catch {
    return [0, 0, 0];
  }
}
