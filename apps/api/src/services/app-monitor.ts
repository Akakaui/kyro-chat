// ---------------------------------------------------------------------------
// Application Monitor
//
// High-level application health monitoring.
//   - Periodic health checks (every 60s)
//   - Alerting thresholds (memory > 80%, CPU > 90%, DB latency > 500ms)
//   - Metrics aggregation
//   - Status page data provider
//
// All operations degrade gracefully if dependencies are unavailable.
// ---------------------------------------------------------------------------

import { getRedis } from './redis.js';
import { getCache } from './cache.js';
import { getPerformanceMetrics, logMemoryUsage, logCpuUsage } from './monitor.js';
import { isSentryEnabled, captureError, captureMessage } from './sentry.js';
import { isPostgreSQLAvailable, getPgPool } from '../db/init.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface AppHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: HealthChecks;
  metrics: HealthMetrics;
  alerts: HealthAlert[];
}

export interface HealthChecks {
  database: ComponentHealth;
  redis: ComponentHealth;
  cache: ComponentHealth;
  sentry: ComponentHealth;
  memory: ComponentHealth;
  cpu: ComponentHealth;
}

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
}

export interface HealthMetrics {
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    usagePercent: number;
  };
  cpu: {
    usagePercent: number;
    loadAvg: number[];
  };
  db: {
    latencyMs: number;
  };
}

export interface HealthAlert {
  severity: 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: string;
  value?: number;
  threshold?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

const MEMORY_WARN_THRESHOLD = 0.8;   // 80%
const MEMORY_CRIT_THRESHOLD = 0.9;   // 90%
const CPU_WARN_THRESHOLD = 0.8;      // 80%
const CPU_CRIT_THRESHOLD = 0.9;      // 90%
const DB_LATENCY_WARN_MS = 300;      // 300ms
const DB_LATENCY_CRIT_MS = 500;      // 500ms
const HEALTH_CHECK_INTERVAL_MS = 60_000;

// ── Monitor ───────────────────────────────────────────────────────────────

class AppMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private alerts: HealthAlert[] = [];
  private lastHealthStatus: AppHealthStatus | null = null;
  private totalMemory: number = 0;

  constructor() {
    try {
      const os = require('os');
      this.totalMemory = os.totalmem();
    } catch {
      this.totalMemory = 0;
    }
  }

  // ── Health Checks ──────────────────────────────────────────────────────

  /**
   * Run all health checks and return the aggregated status.
   */
  async checkHealth(): Promise<AppHealthStatus> {
    const alerts: HealthAlert[] = [];

    // Run all checks in parallel
    const [dbHealth, redisHealth, cacheHealth, sentryHealth, memHealth, cpuHealth] =
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkCache(),
        this.checkSentry(),
        this.checkMemory(),
        this.checkCpu(),
      ]);

    // Collect alerts from checks
    if (memHealth.alerts) alerts.push(...memHealth.alerts);
    if (cpuHealth.alerts) alerts.push(...cpuHealth.alerts);
    if (dbHealth.alerts) alerts.push(...dbHealth.alerts);

    // Determine overall status
    const components = [dbHealth, redisHealth, cacheHealth, sentryHealth, memHealth, cpuHealth];
    const hasDown = components.some((c) => c.status === 'down');
    const hasDegraded = components.some((c) => c.status === 'degraded');

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      hasDown ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    const status: AppHealthStatus = {
      status: overallStatus,
      version: process.env.npm_package_version || process.env.SENTRY_RELEASE || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: dbHealth.status, latencyMs: dbHealth.latencyMs, message: dbHealth.message },
        redis: { status: redisHealth.status, latencyMs: redisHealth.latencyMs, message: redisHealth.message },
        cache: { status: cacheHealth.status, message: cacheHealth.message },
        sentry: { status: sentryHealth.status, message: sentryHealth.message },
        memory: { status: memHealth.status, message: memHealth.message },
        cpu: { status: cpuHealth.status, message: cpuHealth.message },
      },
      metrics: {
        memory: {
          rssMb: memHealth.rssMb ?? 0,
          heapUsedMb: memHealth.heapUsedMb ?? 0,
          heapTotalMb: memHealth.heapTotalMb ?? 0,
          usagePercent: memHealth.usagePercent ?? 0,
        },
        cpu: {
          usagePercent: cpuHealth.usagePercent ?? 0,
          loadAvg: cpuHealth.loadAvg ?? [0, 0, 0],
        },
        db: {
          latencyMs: dbHealth.latencyMs ?? 0,
        },
      },
      alerts: [...this.alerts.slice(-50), ...alerts], // Keep last 50 alerts
    };

    // Keep last 100 alerts total
    this.alerts = status.alerts.slice(-100);
    this.lastHealthStatus = status;

    return status;
  }

  /**
   * Get the last known health status (without running checks).
   */
  getLastHealthStatus(): AppHealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Get current alerts.
   */
  getAlerts(): HealthAlert[] {
    return this.alerts.slice(-100);
  }

  // ── Individual Health Checks ───────────────────────────────────────────

  private async checkDatabase(): Promise<DbCheckResult> {
    const result: DbCheckResult = {
      status: 'ok',
      latencyMs: 0,
    };

    if (!isPostgreSQLAvailable()) {
      result.status = 'degraded';
      result.message = 'PostgreSQL not configured — using SQLite';
      return result;
    }

    try {
      const start = Date.now();
      const pool = getPgPool();
      await pool.query('SELECT 1');
      result.latencyMs = Date.now() - start;

      if (result.latencyMs > DB_LATENCY_CRIT_MS) {
        result.status = 'degraded';
        result.message = `High DB latency: ${result.latencyMs}ms`;
        result.alerts = [this.createAlert('critical', 'database', `Database latency ${result.latencyMs}ms exceeds critical threshold ${DB_LATENCY_CRIT_MS}ms`, result.latencyMs, DB_LATENCY_CRIT_MS)];
      } else if (result.latencyMs > DB_LATENCY_WARN_MS) {
        result.status = 'degraded';
        result.message = `Elevated DB latency: ${result.latencyMs}ms`;
        result.alerts = [this.createAlert('warning', 'database', `Database latency ${result.latencyMs}ms exceeds warning threshold ${DB_LATENCY_WARN_MS}ms`, result.latencyMs, DB_LATENCY_WARN_MS)];
      }
    } catch (err) {
      result.status = 'down';
      result.message = `Database unreachable: ${(err as Error).message}`;
      result.alerts = [this.createAlert('critical', 'database', `Database unreachable: ${(err as Error).message}`)];
      captureError(err, { tags: { check: 'database' } });
    }

    return result;
  }

  private async checkRedis(): Promise<BaseCheckResult> {
    const result: BaseCheckResult = { status: 'ok' };

    try {
      const redis = getRedis();
      const start = Date.now();
      const pong = await redis.ping();
      result.latencyMs = Date.now() - start;

      if (pong !== 'PONG') {
        result.status = 'degraded';
        result.message = 'Redis using in-memory fallback';
      }
    } catch (err) {
      result.status = 'degraded';
      result.message = `Redis unavailable: ${(err as Error).message}`;
    }

    return result;
  }

  private async checkCache(): Promise<BaseCheckResult> {
    const result: BaseCheckResult = { status: 'ok' };

    try {
      const cache = getCache();
      const stats = cache.getStats();
      if (stats.total === 0) {
        result.message = 'Cache is empty';
      } else {
        result.message = `Hit ratio: ${(stats.ratio * 100).toFixed(1)}%`;
      }
    } catch (err) {
      result.status = 'degraded';
      result.message = `Cache check failed: ${(err as Error).message}`;
    }

    return result;
  }

  private async checkSentry(): Promise<BaseCheckResult> {
    const result: BaseCheckResult = { status: 'ok' };

    if (isSentryEnabled()) {
      result.message = 'Sentry enabled';
    } else if (process.env.SENTRY_DSN) {
      result.status = 'degraded';
      result.message = 'Sentry DSN set but not initialized';
    } else {
      result.message = 'Sentry not configured';
    }

    return result;
  }

  private async checkMemory(): Promise<MemoryCheckResult> {
    const result: MemoryCheckResult = {
      status: 'ok',
      rssMb: 0,
      heapUsedMb: 0,
      heapTotalMb: 0,
      usagePercent: 0,
    };

    try {
      const usage = process.memoryUsage();
      result.rssMb = Math.round((usage.rss / 1024 / 1024) * 100) / 100;
      result.heapUsedMb = Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
      result.heapTotalMb = Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100;

      if (this.totalMemory > 0) {
        const usedPercent = (usage.rss / this.totalMemory);
        result.usagePercent = Math.round(usedPercent * 10000) / 100;

        if (usedPercent > MEMORY_CRIT_THRESHOLD) {
          result.status = 'degraded';
          result.message = `Critical memory usage: ${result.usagePercent}%`;
          result.alerts = [this.createAlert('critical', 'memory', `Memory usage at ${result.usagePercent}%`, result.usagePercent, MEMORY_CRIT_THRESHOLD * 100)];
        } else if (usedPercent > MEMORY_WARN_THRESHOLD) {
          result.status = 'degraded';
          result.message = `High memory usage: ${result.usagePercent}%`;
          result.alerts = [this.createAlert('warning', 'memory', `Memory usage at ${result.usagePercent}%`, result.usagePercent, MEMORY_WARN_THRESHOLD * 100)];
        }
      }
    } catch (err) {
      result.status = 'degraded';
      result.message = `Memory check failed: ${(err as Error).message}`;
    }

    return result;
  }

  private async checkCpu(): Promise<CpuCheckResult> {
    const result: CpuCheckResult = {
      status: 'ok',
      usagePercent: 0,
      loadAvg: [0, 0, 0],
    };

    try {
      const os = require('os');
      const cpus = os.cpus();
      result.loadAvg = os.loadavg();

      if (cpus && cpus.length > 0) {
        let totalIdle = 0;
        let totalTick = 0;
        for (const cpu of cpus) {
          for (const type in cpu.times) {
            totalTick += cpu.times[type as keyof typeof cpu.times];
          }
          totalIdle += cpu.times.idle;
        }
        result.usagePercent = Math.round((1 - totalIdle / totalTick) * 10000) / 100;
      }

      if (result.usagePercent > CPU_CRIT_THRESHOLD * 100) {
        result.status = 'degraded';
        result.message = `Critical CPU usage: ${result.usagePercent}%`;
        result.alerts = [this.createAlert('critical', 'cpu', `CPU usage at ${result.usagePercent}%`, result.usagePercent, CPU_CRIT_THRESHOLD * 100)];
      } else if (result.usagePercent > CPU_WARN_THRESHOLD * 100) {
        result.status = 'degraded';
        result.message = `High CPU usage: ${result.usagePercent}%`;
        result.alerts = [this.createAlert('warning', 'cpu', `CPU usage at ${result.usagePercent}%`, result.usagePercent, CPU_WARN_THRESHOLD * 100)];
      }
    } catch (err) {
      result.status = 'degraded';
      result.message = `CPU check failed: ${(err as Error).message}`;
    }

    return result;
  }

  // ── Alerts ──────────────────────────────────────────────────────────────

  private createAlert(
    severity: 'warning' | 'critical',
    component: string,
    message: string,
    value?: number,
    threshold?: number,
  ): HealthAlert {
    return { severity, component, message, timestamp: new Date().toISOString(), value, threshold };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start periodic health checks.
   */
  start(intervalMs: number = HEALTH_CHECK_INTERVAL_MS): void {
    if (this.intervalId) return;

    log('log', `Starting periodic health checks every ${intervalMs}ms`);

    // Run initial check
    this.checkHealth()
      .then((status) => {
        log('log', `Initial health status: ${status.status}`);
        if (status.status !== 'healthy') {
          captureMessage(`Application status: ${status.status}`, 'warning', {
            extra: { alerts: status.alerts.length },
          });
        }
      })
      .catch((err) => log('error', 'Initial health check failed:', (err as Error).message));

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkHealth()
        .then((status) => {
          if (status.status !== 'healthy') {
            log('warn', `Health check: ${status.status} (${status.alerts.length} alerts)`);
          }

          // Log memory/CPU periodically
          logMemoryUsage();
          logCpuUsage();
        })
        .catch((err) => log('error', 'Periodic health check failed:', (err as Error).message));
    }, intervalMs);

    if (this.intervalId && typeof this.intervalId === 'object' && 'unref' in this.intervalId) {
      (this.intervalId as ReturnType<typeof setInterval>).unref();
    }
  }

  /**
   * Stop periodic health checks.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log('log', 'Health monitoring stopped');
    }
  }

  /**
   * Clear all alerts.
   */
  clearAlerts(): void {
    this.alerts = [];
  }
}

// ── Internal Types ────────────────────────────────────────────────────────

interface BaseCheckResult {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
  alerts?: HealthAlert[];
}

interface DbCheckResult extends BaseCheckResult {
  latencyMs: number;
}

interface MemoryCheckResult extends BaseCheckResult {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  usagePercent: number;
}

interface CpuCheckResult extends BaseCheckResult {
  usagePercent: number;
  loadAvg: number[];
}

// ── Logging ───────────────────────────────────────────────────────────────

function log(level: 'log' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const prefix = '[AppMonitor]';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, message, ...args);
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const appMonitor = new AppMonitor();
