import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (no Redis needed for free tier).
//
// Each tier gets its own Map so cleanup and key-spacing stay isolated.
// Operations are O(1) — Map.get / Map.set / Map.delete.
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Max requests allowed within the window */
  maxRequests: number;
  /**
   * Custom key extractor. Defaults to user ID (from `c.get('user')`) or
   * falls back to IP via X-Forwarded-For / X-Real-IP / 'anonymous'.
   */
  keyFn?: (c: Context) => string;
}

// ── Per-tier storage ────────────────────────────────────────────────────────

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

/**
 * Start a periodic cleanup that evicts expired entries.
 * Runs once per tier; stops itself when the store drains to zero.
 */
function ensureCleanup(name: string, store: Map<string, RateLimitEntry>): void {
  if (cleanupTimers.has(name)) return;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
    // Stop the timer if the store is empty to avoid idle work.
    if (store.size === 0) {
      clearInterval(timer);
      cleanupTimers.delete(name);
    }
  }, 60_000); // sweep every 60 s

  // Allow the process to exit even if the timer is still running.
  if (timer.unref) timer.unref();
  cleanupTimers.set(name, timer);
}

// ── Default key extractor ───────────────────────────────────────────────────

function defaultKeyFn(c: Context): string {
  // Prefer authenticated user ID; fall back to IP.
  const user = c.get('user');
  if (user?.id) return `user:${user.id}`;

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return `ip:${forwarded.split(',')[0].trim()}`;

  const realIp = c.req.header('x-real-ip');
  if (realIp) return `ip:${realIp}`;

  return 'ip:anonymous';
}

// ── Core middleware factory ──────────────────────────────────────────────────

export function rateLimit(config: RateLimitConfig, storeName: string = 'default') {
  const store = getStore(storeName);
  const keyFn = config.keyFn ?? defaultKeyFn;

  return async (c: Context, next: Next) => {
    ensureCleanup(storeName, store);

    const key = keyFn(c);
    const now = Date.now();
    let entry = store.get(key);

    // New window or expired window → reset
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Always set informational headers
    c.header('X-RateLimit-Limit', String(config.maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > config.maxRequests) {
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json(
        {
          error: 'Too many requests. Please wait before sending another message.',
          retryAfter: retryAfterSeconds,
        },
        429,
      );
    }

    await next();
  };
}

// ── Pre-configured limiters (one per tier) ──────────────────────────────────

/** Chat / message endpoints — 50 req / min per user */
export const chatLimit = rateLimit(
  { windowMs: 60_000, maxRequests: 50 },
  'chat',
);

/** Auth endpoints — 10 req / min per IP (keyed by IP, not user) */
export const authLimit = rateLimit(
  {
    windowMs: 60_000,
    maxRequests: 10,
    keyFn: (c) => {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) return `ip:${forwarded.split(',')[0].trim()}`;
      const realIp = c.req.header('x-real-ip');
      if (realIp) return `ip:${realIp}`;
      return 'ip:anonymous';
    },
  },
  'auth',
);

/** General API (KB, connectors, artifacts) — 100 req / min per user */
export const apiLimit = rateLimit(
  { windowMs: 60_000, maxRequests: 100 },
  'api',
);

/** Model / usage endpoints — 30 req / min per user */
export const modelLimit = rateLimit(
  { windowMs: 60_000, maxRequests: 30 },
  'model',
);

// ── Helpers for tests ───────────────────────────────────────────────────────

/** Reset a specific store (useful in tests). */
export function _resetStore(name: string): void {
  stores.get(name)?.clear();
}

/** Reset all stores (useful in tests). */
export function _resetAllStores(): void {
  for (const store of stores.values()) store.clear();
}
