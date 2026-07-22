// ---------------------------------------------------------------------------
// Cache Manager
//
// Cache-aside pattern backed by Redis (or in-memory fallback).
// Tracks hit/miss ratios and supports pattern-based invalidation.
// ---------------------------------------------------------------------------

import { getRedis, TTL } from './redis.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CacheStats {
  hits: number;
  misses: number;
  ratio: number;
  total: number;
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

// ── Cache Manager ─────────────────────────────────────────────────────────

class CacheManager {
  private hits = 0;
  private misses = 0;
  private localCache = new Map<string, CacheEntry<unknown>>();
  private readonly LOCAL_TTL = 5000; // local cache TTL for hot items (5s)

  /**
   * Get a value from cache, or compute and store it using the fetch function.
   * Implements the cache-aside (aka lazy-loading) pattern.
   *
   * @param key - Cache key (namespace:key recommended, e.g. "user:123")
   * @param fetchFn - Async function that produces the value on cache miss
   * @param ttlSeconds - TTL in seconds (defaults to TTL.CACHE = 300)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = TTL.CACHE,
  ): Promise<T> {
    // 1. Try local hot cache first
    const local = this.localCache.get(key);
    if (local && Date.now() - local.storedAt < this.LOCAL_TTL) {
      this.hits++;
      return local.value as T;
    }

    // 2. Try Redis / in-memory fallback
    const redis = getRedis();
    const cached = await redis.get(key);

    if (cached !== null) {
      try {
        const parsed = JSON.parse(cached) as T;
        // Store in local hot cache
        this.localCache.set(key, { value: parsed, storedAt: Date.now() });
        this.hits++;
        return parsed;
      } catch {
        // JSON parse failed — treat as miss and re-fetch
        this.misses++;
      }
    } else {
      this.misses++;
    }

    // 3. Cache miss — fetch and store
    const value = await fetchFn();
    const serialized = JSON.stringify(value);

    // Store in Redis (fire-and-forget)
    await redis.set(key, serialized, ttlSeconds);

    // Store in local hot cache
    this.localCache.set(key, { value, storedAt: Date.now() });

    return value;
  }

  /**
   * Invalidate (delete) a specific cache key.
   */
  async invalidate(key: string): Promise<void> {
    this.localCache.delete(key);
    const redis = getRedis();
    await redis.del(key);
  }

  /**
   * Invalidate all keys matching a glob pattern.
   * NOTE: When using in-memory fallback, this deletes all keys whose string
   * representation matches the pattern.  When using real Redis, it uses
   * SCAN + DEL which is O(N) but non-blocking.
   *
   * @param pattern - Glob pattern, e.g. "user:*" or "rate-limit:*"
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Clear local cache entries whose keys match the pattern
    const regex = globToRegex(pattern);
    for (const key of this.localCache.keys()) {
      if (regex.test(key)) {
        this.localCache.delete(key);
      }
    }

    // Use the Redis service's delByPattern which handles both real Redis (SCAN + DEL)
    // and in-memory fallback (pattern iteration)
    const redis = getRedis();
    await redis.delByPattern(pattern);
  }

  /**
   * Clear all keys in a namespace (e.g. "user", "rate-limit", "cache").
   * Shortcut for invalidatePattern("namespace:*").
   */
  async clearNamespace(namespace: string): Promise<void> {
    await this.invalidatePattern(`${namespace}:*`);
  }

  /**
   * Get current cache hit/miss statistics.
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      ratio: total > 0 ? this.hits / total : 0,
      total,
    };
  }

  /**
   * Reset hit/miss counters (useful for testing or periodic reporting).
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Clear the local hot cache.
   */
  clearLocalCache(): void {
    this.localCache.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports `*` (any sequence), `?` (single char).
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// ── Singleton ─────────────────────────────────────────────────────────────

let instance: CacheManager | null = null;

export function getCache(): CacheManager {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}

export function _resetCacheSingleton(): void {
  instance = null;
}

export { CacheManager };
