import type { Context, Next } from 'hono';
import { getPgPool, isPostgreSQLAvailable } from '../db/init.js';
import { logRateLimitExceeded, logSecurityEvent } from '../services/audit-logger.js';

// ---------------------------------------------------------------------------
// Enhanced Rate Limiter
//
// Features:
//   - In-memory sliding-window rate limiter
//   - Optional Redis-backed persistence (planned)
//   - Account lockout after N failed auth attempts
//   - IP reputation tracking (PostgreSQL-backed)
//   - Standard rate limit headers
//   - `checkRateLimit` function for programmatic checks
//
// Tiers:
//   - Auth:     50 req/min  (IP-based)
//   - Chat:    100 req/min  (user-based)
//   - API:    1000 req/min  (user-based)
// ---------------------------------------------------------------------------

// ── Types ─────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  limit: number;
  resetAt: number;
}

export interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Max requests allowed within the window */
  maxRequests: number;
  /** Custom key extractor function */
  keyFn?: (c: Context) => string;
  /** Name for this rate limiter (used for store isolation) */
  name?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Account lockout: 5 failed attempts */
const MAX_FAILED_AUTH_ATTEMPTS = 5;

/** Account lockout duration: 15 minutes */
const AUTH_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** Cleanup interval: 60 seconds */
const CLEANUP_INTERVAL_MS = 60_000;

// ── In-memory stores ─────────────────────────────────────────────────────

const stores = new Map<string, Map<string, RateLimitEntry>>();
const cleanupTimers = new Map<string, ReturnType<typeof setInterval>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

function ensureCleanup(name: string, store: Map<string, RateLimitEntry>): void {
  if (cleanupTimers.has(name)) return;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
    if (store.size === 0) {
      clearInterval(timer);
      cleanupTimers.delete(name);
    }
  }, CLEANUP_INTERVAL_MS);

  if (timer.unref) timer.unref();
  cleanupTimers.set(name, timer);
}

// ── IP extraction ────────────────────────────────────────────────────────

export function extractIP(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;

  const cfConnectingIp = c.req.header('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  return 'unknown';
}

function defaultKeyFn(c: Context): string {
  // Prefer authenticated user ID; fall back to IP
  const user = c.get('user');
  if (user?.id) return `user:${user.id}`;
  return `ip:${extractIP(c)}`;
}

function authKeyFn(c: Context): string {
  // Auth endpoints are always keyed by IP
  return `ip:${extractIP(c)}`;
}

// ── IP Reputation (PostgreSQL) ───────────────────────────────────────────

/**
 * Track a failed authentication attempt for IP-based lockout.
 */
export async function trackFailedAuthAttempt(
  ipAddress: string,
  userId?: string
): Promise<{ blocked: boolean; remainingAttempts: number }> {
  if (!isPostgreSQLAvailable()) {
    return { blocked: false, remainingAttempts: MAX_FAILED_AUTH_ATTEMPTS };
  }

  try {
    const pool = getPgPool();

    // Upsert IP reputation record
    await pool.query(
      `INSERT INTO ip_reputation (ip_address, score, failed_attempts, last_seen)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ip_address) DO UPDATE SET
         failed_attempts = ip_reputation.failed_attempts + 1,
         score = ip_reputation.score - 10,
         last_seen = $4`,
      [ipAddress, -10, 1, Date.now()]
    );

    // Check current attempt count
    const result = await pool.query(
      'SELECT failed_attempts FROM ip_reputation WHERE ip_address = $1',
      [ipAddress]
    );

    const failedAttempts = parseInt(result.rows[0]?.failed_attempts || '0', 10);
    const remainingAttempts = Math.max(0, MAX_FAILED_AUTH_ATTEMPTS - failedAttempts);

    if (failedAttempts >= MAX_FAILED_AUTH_ATTEMPTS) {
      // Lock the IP
      await pool.query(
        `UPDATE ip_reputation SET blocked_until = $1 WHERE ip_address = $2`,
        [Date.now() + AUTH_LOCKOUT_DURATION_MS, ipAddress]
      );

      await logSecurityEvent(
        userId || null,
        'account_locked',
        `IP ${ipAddress} locked for ${AUTH_LOCKOUT_DURATION_MS / 1000}s after ${failedAttempts} failed attempts`
      );

      return { blocked: true, remainingAttempts: 0 };
    }

    return { blocked: false, remainingAttempts };
  } catch (err) {
    console.error('[rate-limit] Failed to track auth attempt:', err);
    return { blocked: false, remainingAttempts: MAX_FAILED_AUTH_ATTEMPTS };
  }
}

/**
 * Reset failed attempt counter on successful login.
 */
export async function resetFailedAuthAttempts(ipAddress: string): Promise<void> {
  if (!isPostgreSQLAvailable()) return;

  try {
    const pool = getPgPool();
    await pool.query(
      `UPDATE ip_reputation SET failed_attempts = 0, score = 0, blocked_until = NULL WHERE ip_address = $1`,
      [ipAddress]
    );
  } catch (err) {
    console.error('[rate-limit] Failed to reset auth attempts:', err);
  }
}

/**
 * Check if an IP is currently blocked.
 */
export async function isIPBlocked(ipAddress: string): Promise<boolean> {
  if (!isPostgreSQLAvailable()) return false;

  try {
    const pool = getPgPool();
    const result = await pool.query(
      'SELECT blocked_until FROM ip_reputation WHERE ip_address = $1 AND blocked_until > $2',
      [ipAddress, Date.now()]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('[rate-limit] Failed to check IP block:', err);
    return false;
  }
}

// ── Rate Limit Check ─────────────────────────────────────────────────────

/**
 * Programmatic rate limit check.
 * Returns the current state without applying any middleware logic.
 * Useful for integrating rate limiting into custom auth flows.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  storeName: string = 'default'
): RateLimitResult {
  const store = getStore(storeName);
  ensureCleanup(storeName, store);

  const now = Date.now();
  let entry = store.get(key);

  // New window or expired window → reset
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, limit - entry.count);
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  return {
    allowed: entry.count <= limit,
    remaining,
    retryAfter,
    limit,
    resetAt: entry.resetAt,
  };
}

// ── Middleware factory ────────────────────────────────────────────────────

export function rateLimit(config: RateLimitConfig): (c: Context, next: Next) => Promise<Response | void> {
  const storeName = config.name || 'default';
  const store = getStore(storeName);
  const keyFn = config.keyFn ?? defaultKeyFn;

  return async (c: Context, next: Next) => {
    ensureCleanup(storeName, store);

    const key = keyFn(c);
    const ip = extractIP(c);

    // Check IP block for auth endpoints
    if (storeName === 'auth') {
      const blocked = await isIPBlocked(ip);
      if (blocked) {
        const retryAfter = AUTH_LOCKOUT_DURATION_MS / 1000;
        c.header('Retry-After', String(retryAfter));
        c.header('X-RateLimit-Limit', String(config.maxRequests));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(Math.ceil((Date.now() + AUTH_LOCKOUT_DURATION_MS) / 1000)));
        return c.json(
          {
            error: 'Account temporarily locked due to too many failed attempts. Please try again later.',
            retryAfter,
          },
          429
        );
      }
    }

    const result = checkRateLimit(key, config.maxRequests, config.windowMs, storeName);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter));

      // Log rate limit exceed for non-test environments
      if (process.env.NODE_ENV !== 'test') {
        const path = c.req.path;
        const method = c.req.method;
        logRateLimitExceeded(key, ip, path, method).catch(() => {});
      }

      return c.json(
        {
          error: 'Too many requests. Please wait before sending another message.',
          retryAfter: result.retryAfter,
        },
        429
      );
    }

    await next();
  };
}

// ── Pre-configured limiters ───────────────────────────────────────────────

/**
 * Auth endpoints — 50 req/min per IP.
 * Stricter limit due to brute-force concerns.
 */
export const authLimiter = rateLimit({
  name: 'auth',
  windowMs: 60_000,
  maxRequests: 50,
  keyFn: authKeyFn,
});

/**
 * Chat / message endpoints — 100 req/min per user.
 */
export const chatLimiter = rateLimit({
  name: 'chat',
  windowMs: 60_000,
  maxRequests: 100,
});

/**
 * General API endpoints — 1000 req/min per user.
 */
export const apiLimiter = rateLimit({
  name: 'api',
  windowMs: 60_000,
  maxRequests: 1000,
});

/**
 * Strict limit for model/usage endpoints — 60 req/min per user.
 */
export const modelLimiter = rateLimit({
  name: 'model',
  windowMs: 60_000,
  maxRequests: 60,
});

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Reset a specific store (useful in tests).
 */
export function _resetStore(name: string): void {
  stores.get(name)?.clear();
}

/**
 * Reset all stores (useful in tests).
 */
export function _resetAllStores(): void {
  for (const store of stores.values()) store.clear();
}
