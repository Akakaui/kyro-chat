// ---------------------------------------------------------------------------
// Performance Monitor
//
// In-process performance metrics collection and reporting.
// Tracks function timings, database queries, and API route performance.
// All operations degrade gracefully — no crash if monitor fails.
// ---------------------------------------------------------------------------

import { captureError, isSentryEnabled } from './sentry.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface TimingEntry {
  name: string;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  lastStartedAt?: number;
}

export interface QueryTimingEntry {
  queryName: string;
  count: number;
  totalMs: number;
  dbType: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface ApiRouteEntry {
  method: string;
  path: string;
  statusCode: number;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface PerformanceMetrics {
  timings: TimingEntry[];
  queries: QueryTimingEntry[];
  apiRoutes: ApiRouteEntry[];
  memory: MemoryInfo | null;
  cpu: CpuInfo | null;
  uptime: number;
  timestamp: string;
}

export interface MemoryInfo {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface CpuInfo {
  user: number;
  system: number;
  idle: number;
  loadAvg: number[];
}

// ── In-Memory Stores ──────────────────────────────────────────────────────

const timings = new Map<string, TimingEntry>();
const queries = new Map<string, QueryTimingEntry>();
const apiRoutes = new Map<string, ApiRouteEntry>();

// Cap the number of entries to prevent memory leaks
const MAX_ENTRIES = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────

function log(level: 'log' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const prefix = '[Monitor]';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, message, ...args);
}

function makeRouteKey(method: string, path: string, statusCode: number): string {
  return `${method}:${path}:${statusCode}`;
}

function makeQueryKey(queryName: string, dbType: string): string {
  return `${dbType}:${queryName}`;
}

function ensureCap(map: Map<string, unknown>): void {
  if (map.size > MAX_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) {
      map.delete(firstKey as string);
    }
  }
}

// ── Memory & CPU Collection ───────────────────────────────────────────────

function collectMemoryInfo(): MemoryInfo | null {
  try {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
      arrayBuffers: Math.round((usage.arrayBuffers || 0) / 1024 / 1024 * 100) / 100,
    };
  } catch {
    return null;
  }
}

function collectCpuInfo(): CpuInfo | null {
  try {
    const cpus = osCpus();
    if (!cpus || cpus.length === 0) return null;

    let user = 0;
    let system = 0;
    let idle = 0;

    for (const cpu of cpus) {
      user += cpu.times.user;
      system += cpu.times.sys;
      idle += cpu.times.idle;
    }

    return {
      user,
      system,
      idle,
      loadAvg: osLoadavg(),
    };
  } catch {
    return null;
  }
}

// Lazy imports to avoid crash if 'os' module somehow fails
let osModule: typeof import('os') | null = null;
function getOs(): typeof import('os') {
  if (!osModule) {
    osModule = require('os');
  }
  return osModule!;
}

function osCpus(): import('os').CpuInfo[] {
  try {
    return getOs().cpus();
  } catch {
    return [];
  }
}

function osLoadavg(): number[] {
  try {
    return getOs().loadavg();
  } catch {
    return [0, 0, 0];
  }
}

function osFreemem(): number {
  try {
    return getOs().freemem();
  } catch {
    return 0;
  }
}

function osTotalmem(): number {
  try {
    return getOs().totalmem();
  } catch {
    return 0;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Track and measure function execution time.
 * Automatically captures errors to Sentry if enabled.
 *
 * @example
 *   const result = await trackTiming('db.query.users', () => db.query('SELECT * FROM users'));
 */
export async function trackTiming<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - start;
    recordTiming(name, duration);
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    recordTiming(name, duration);

    // Capture error to Sentry if available
    if (isSentryEnabled()) {
      captureError(err, {
        tags: { timing_name: name },
        extra: { duration_ms: duration },
      });
    }

    throw err; // Re-throw — caller handles it
  }
}

/**
 * Track database query performance.
 */
export function trackQuery(queryName: string, durationMs: number, dbType: string): void {
  try {
    const key = makeQueryKey(queryName, dbType);
    const existing = queries.get(key);

    if (existing) {
      existing.count++;
      existing.totalMs += durationMs;
      existing.avgMs = Math.round((existing.totalMs / existing.count) * 100) / 100;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
    } else {
      queries.set(key, {
        queryName,
        count: 1,
        totalMs: durationMs,
        dbType,
        avgMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
      });
      ensureCap(queries as unknown as Map<string, unknown>);
    }
  } catch (err) {
    log('error', 'Failed to track query:', (err as Error).message);
  }
}

/**
 * Track API endpoint performance.
 */
export function trackApiRoute(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  try {
    const key = makeRouteKey(method, path, statusCode);
    const existing = apiRoutes.get(key);

    if (existing) {
      existing.count++;
      existing.totalMs += durationMs;
      existing.avgMs = Math.round((existing.totalMs / existing.count) * 100) / 100;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
    } else {
      apiRoutes.set(key, {
        method,
        path,
        statusCode,
        count: 1,
        totalMs: durationMs,
        avgMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
      });
      ensureCap(apiRoutes as unknown as Map<string, unknown>);
    }
  } catch (err) {
    log('error', 'Failed to track API route:', (err as Error).message);
  }
}

/**
 * Get aggregated performance metrics.
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return {
    timings: Array.from(timings.values()),
    queries: Array.from(queries.values()),
    apiRoutes: Array.from(apiRoutes.values()),
    memory: collectMemoryInfo(),
    cpu: collectCpuInfo(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log current memory usage to console.
 */
export function logMemoryUsage(): void {
  try {
    const mem = collectMemoryInfo();
    if (mem) {
      log('log', `Memory — RSS: ${mem.rss}MB, Heap: ${mem.heapUsed}/${mem.heapTotal}MB, External: ${mem.external}MB`);
    }

    const free = osFreemem();
    const total = osTotalmem();
    if (total > 0) {
      const freePercent = Math.round((free / total) * 100);
      const usedPercent = 100 - freePercent;
      log('log', `System Memory — ${usedPercent}% used (${Math.round((total - free) / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB)`);

      if (usedPercent > 80) {
        log('warn', `High memory usage: ${usedPercent}%`);
      }
    }
  } catch (err) {
    log('error', 'Failed to log memory usage:', (err as Error).message);
  }
}

/**
 * Log current CPU usage to console.
 */
export function logCpuUsage(): void {
  try {
    const cpu = collectCpuInfo();
    if (cpu) {
      const totalCpu = cpu.user + cpu.system + cpu.idle;
      if (totalCpu > 0) {
        const usedPercent = Math.round(((cpu.user + cpu.system) / totalCpu) * 100);
        log('log', `CPU — ${usedPercent}% used (load: ${cpu.loadAvg[0].toFixed(2)}, ${cpu.loadAvg[1].toFixed(2)}, ${cpu.loadAvg[2].toFixed(2)})`);

        if (usedPercent > 90) {
          log('warn', `High CPU usage: ${usedPercent}%`);
        }
      }
    }
  } catch (err) {
    log('error', 'Failed to log CPU usage:', (err as Error).message);
  }
}

/**
 * Record a timing entry (used internally by trackTiming and for direct calls).
 */
function recordTiming(name: string, durationMs: number): void {
  try {
    const existing = timings.get(name);

    if (existing) {
      existing.count++;
      existing.totalMs += durationMs;
      existing.avgMs = Math.round((existing.totalMs / existing.count) * 100) / 100;
      existing.minMs = Math.min(existing.minMs, durationMs);
      existing.maxMs = Math.max(existing.maxMs, durationMs);
    } else {
      timings.set(name, {
        name,
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
        avgMs: durationMs,
      });
      ensureCap(timings as unknown as Map<string, unknown>);
    }
  } catch (err) {
    log('error', 'Failed to record timing:', (err as Error).message);
  }
}

/**
 * Reset all collected metrics (useful in tests).
 */
export function resetMetrics(): void {
  timings.clear();
  queries.clear();
  apiRoutes.clear();
}

/**
 * Start periodic logging of memory and CPU usage.
 * Returns a cleanup function to stop the interval.
 */
export function startPeriodicMonitoring(intervalMs: number = 60000): () => void {
  log('log', `Starting periodic monitoring every ${intervalMs}ms`);

  const interval = setInterval(() => {
    logMemoryUsage();
    logCpuUsage();
  }, intervalMs);

  if (interval.unref) {
    interval.unref();
  }

  return () => {
    clearInterval(interval);
    log('log', 'Periodic monitoring stopped');
  };
}
