import type { Context } from 'hono';

/**
 * Simple in-memory rate limiter for chat/messages endpoint.
 * 20 requests per minute per user.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of userLimits) {
      if (now > entry.resetAt) {
        userLimits.delete(key);
      }
    }
    if (userLimits.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL);
}

export function chatRateLimit(maxRequests: number = 20, windowMs: number = 60000) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get('user');
    if (!user?.id) {
      // H5: Fail closed — reject requests without user context instead of
      // silently bypassing the rate limiter.
      return c.json({ error: 'Authentication required' }, 401);
    }

    ensureCleanup();

    const now = Date.now();
    const key = `chat:${user.id}`;
    let entry = userLimits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      userLimits.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json({
        error: 'Too many requests. Please wait before sending another message.',
        retryAfterSeconds,
      }, 429);
    }

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));

    await next();
  };
}