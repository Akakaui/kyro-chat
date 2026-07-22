// ---------------------------------------------------------------------------
// Redis Service
//
// Lazy-initialized Redis client with automatic fallback to in-memory storage
// when Redis is unavailable.  All operations degrade gracefully.
// ---------------------------------------------------------------------------

import type { Redis as RedisClientType, ChainableCommander } from 'ioredis';
import { InMemoryStore } from './redis-store.js';

// ── TTL defaults ──────────────────────────────────────────────────────────

export const TTL = {
  SESSION: 3600,
  RATE_LIMIT: 60,
  CACHE: 300,
  CHAT_HISTORY: 7200,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function log(level: 'log' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const prefix = '[Redis]';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, message, ...args);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// ── Redis Service ─────────────────────────────────────────────────────────

export class RedisService {
  private client: RedisClientType | null = null;
  private fallback: InMemoryStore | null = null;
  private connecting = false;
  private connected = false;
  private url: string;

  constructor(url?: string) {
    this.url = url || process.env.REDIS_URL || '';
  }

  // ── Connection management ──────────────────────────────────────────────

  async connect(): Promise<boolean> {
    if (this.connected && this.client) return true;
    if (this.fallback) return false;
    if (this.connecting) {
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (!this.connecting) resolve();
          else setTimeout(check, 10);
        };
        check();
      });
      return this.connected && this.client !== null;
    }
    if (!this.url) {
      log('warn', 'REDIS_URL not set — using in-memory fallback');
      this.fallback = new InMemoryStore();
      return false;
    }

    this.connecting = true;
    try {
      const { default: IORedis } = await import('ioredis');
      this.client = new IORedis(this.url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.client.on('connect', () => { this.connected = true; });
      this.client.on('ready', () => { this.connected = true; });
      this.client.on('close', () => { this.connected = false; log('warn', 'Connection closed'); });
      this.client.on('reconnecting', () => { log('log', 'Reconnecting...'); });
      this.client.on('error', (err: Error) => { log('error', 'Error:', err.message); });
      await this.client.connect();
      this.connected = true;
      log('log', 'Connected to Redis');
      return true;
    } catch (err) {
      log('warn', 'Failed to connect to Redis — using in-memory fallback:', (err as Error).message);
      if (this.client) { try { this.client.disconnect(); } catch { /* ignore */ } this.client = null; }
      this.fallback = new InMemoryStore();
      this.connected = false;
      return false;
    } finally {
      this.connecting = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  // ── Generic fallback helper ───────────────────────────────────────────

  /**
   * Execute a Redis operation with the in-memory fallback chain.
   * Reduces boilerplate across all methods.
   */
  private async withFallback<T>(
    redisFn: (client: RedisClientType) => Promise<T>,
    fallbackFn: () => T,
    errorVal: T,
  ): Promise<T> {
    if (this.fallback) return fallbackFn();
    await this.ensure();
    if (this.fallback) return fallbackFn();
    try {
      return await redisFn(this.client!);
    } catch (err) {
      log('error', 'Command failed:', (err as Error).message);
      return errorVal;
    }
  }

  // ── Key-Value operations ───────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.withFallback(
      (c) => c.get(key),
      () => this.fallback!.get(key),
      null,
    );
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK' | null> {
    return this.withFallback(
      (c) => ttlSeconds ? c.setex(key, ttlSeconds, value) : c.set(key, value),
      () => { this.fallback!.set(key, value, ttlSeconds); return 'OK' as const; },
      null,
    );
  }

  async del(...keys: string[]): Promise<number> {
    return this.withFallback(
      (c) => c.del(...keys),
      () => { let count = 0; for (const k of keys) count += this.fallback!.del(k); return count; },
      0,
    );
  }

  async exists(key: string): Promise<boolean> {
    return this.withFallback(
      async (c) => (await c.exists(key)) === 1,
      () => this.fallback!.exists(key),
      false,
    );
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.withFallback(
      async (c) => (await c.expire(key, seconds)) === 1,
      () => this.fallback!.expire(key, seconds),
      false,
    );
  }

  async incr(key: string): Promise<number> {
    return this.withFallback(
      (c) => c.incr(key),
      () => this.fallback!.incr(key),
      0,
    );
  }

  async decr(key: string): Promise<number> {
    return this.withFallback(
      (c) => c.decr(key),
      () => this.fallback!.decr(key),
      0,
    );
  }

  // ── List operations ────────────────────────────────────────────────────

  async lpush(key: string, value: string): Promise<number> {
    return this.withFallback(
      (c) => c.lpush(key, value),
      () => this.fallback!.lpush(key, value),
      0,
    );
  }

  async rpop(key: string): Promise<string | null> {
    return this.withFallback(
      (c) => c.rpop(key),
      () => this.fallback!.rpop(key),
      null,
    );
  }

  async llen(key: string): Promise<number> {
    return this.withFallback(
      (c) => c.llen(key),
      () => this.fallback!.llen(key),
      0,
    );
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.withFallback(
      (c) => c.lrange(key, start, stop),
      () => this.fallback!.lrange(key, start, stop),
      [],
    );
  }

  // ── Hash operations ────────────────────────────────────────────────────

  async hget(key: string, field: string): Promise<string | null> {
    return this.withFallback(
      (c) => c.hget(key, field),
      () => this.fallback!.hget(key, field),
      null,
    );
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.withFallback(
      (c) => c.hset(key, field, value),
      () => this.fallback!.hset(key, field, value),
      0,
    );
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.withFallback(
      (c) => c.hgetall(key),
      () => this.fallback!.hgetall(key),
      {},
    );
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.withFallback(
      (c) => c.hdel(key, field),
      () => this.fallback!.hdel(key, field),
      0,
    );
  }

  // ── Pipeline ───────────────────────────────────────────────────────────

  pipeline(): Record<string, unknown> {
    if (this.client) return this.client.pipeline() as unknown as Record<string, unknown>;
    return {};
  }

  // ── Pattern deletion ──────────────────────────────────────────────────

  async delByPattern(pattern: string): Promise<number> {
    const regex = globToRegex(pattern);
    const fb = this.fallback;
    if (fb) {
      let count = 0;
      for (const key of fb.getKeys()) {
        if (regex.test(key)) count += fb.del(key);
      }
      return count;
    }
    await this.ensure();
    const fb2 = this.fallback;
    if (fb2) {
      let count = 0;
      for (const key of fb2.getKeys()) {
        if (regex.test(key)) count += fb2.del(key);
      }
      return count;
    }
    try {
      const client = this.client!;
      let count = 0;
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) count += await client.del(...keys);
      } while (cursor !== '0');
      return count;
    } catch (err) {
      log('error', `delByPattern(${pattern}) failed:`, (err as Error).message);
      return 0;
    }
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async ping(): Promise<string> {
    return this.withFallback(
      (c) => c.ping(),
      () => this.fallback!.ping(),
      'NO_REDIS',
    );
  }

  async flush(): Promise<void> {
    const fb = this.fallback;
    if (fb) { fb.flush(); return; }
    if (process.env.NODE_ENV === 'production') { log('warn', 'flush() skipped in production'); return; }
    await this.ensure();
    const fb2 = this.fallback;
    if (fb2) { fb2.flush(); return; }
    try {
      await this.client!.flushall();
      log('log', 'All keys flushed');
    } catch (err) {
      log('error', 'flush failed:', (err as Error).message);
    }
  }

  async quit(): Promise<void> {
    if (this.fallback) { this.fallback.quit(); this.fallback = null; return; }
    if (this.client) {
      try { await this.client.quit(); } catch (err) { log('error', 'quit failed:', (err as Error).message); }
      this.client = null;
    }
    this.connected = false;
    log('log', 'Disconnected');
  }

  private async ensure(): Promise<void> {
    if (this.connected && this.client) return;
    if (this.fallback) return;
    await this.connect();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let instance: RedisService | null = null;

export function getRedis(): RedisService {
  if (!instance) instance = new RedisService();
  return instance;
}

export function _resetRedisSingleton(): void {
  instance = null;
}
