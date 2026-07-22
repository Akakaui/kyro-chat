// ---------------------------------------------------------------------------
// Redis Constants
// ---------------------------------------------------------------------------

/** Default TTL values in seconds. */
export const TTL = {
  SESSION: 3600,
  RATE_LIMIT: 60,
  CACHE: 300,
  CHAT_HISTORY: 7200,
} as const;

export const REDIS_LOG_PREFIX = '[Redis]';

export function redisLog(level: 'log' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(REDIS_LOG_PREFIX, message, ...args);
}

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports `*` (any sequence), `?` (single char).
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
