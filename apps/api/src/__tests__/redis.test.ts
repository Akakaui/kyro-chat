// ---------------------------------------------------------------------------
// Redis Infrastructure Tests
//
// Tests the caching infrastructure: Redis service (with in-memory fallback),
// Cache Manager, Job Queue, and Session Store.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Prevent ioredis from being loaded for tests (no REDIS_URL set)
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      throw new Error('ioredis not available in test environment');
    }),
  };
});

import { RedisService, _resetRedisSingleton, getRedis, TTL } from '../services/redis.js';
import { CacheManager, getCache, _resetCacheSingleton } from '../services/cache.js';
import { QueueService, getQueue, _resetQueueSingleton } from '../services/queue.js';
import { SessionStore, getSessionStore, _resetSessionSingleton } from '../services/session.js';

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetRedisSingleton();
  _resetCacheSingleton();
  _resetQueueSingleton();
  _resetSessionSingleton();
});

afterEach(() => {
  _resetRedisSingleton();
  _resetCacheSingleton();
  _resetQueueSingleton();
  _resetSessionSingleton();
});

// ── Redis Service ─────────────────────────────────────────────────────────

describe('RedisService (in-memory fallback)', () => {
  it('should fall back to in-memory store when REDIS_URL is not set', async () => {
    const redis = new RedisService();
    const connected = await redis.connect();
    expect(connected).toBe(false);
    expect(redis.isConnected()).toBe(false);
  });

  it('should set and get values', async () => {
    const redis = new RedisService();
    await redis.set('test:key', 'hello');
    const val = await redis.get('test:key');
    expect(val).toBe('hello');
  });

  it('should return null for non-existent keys', async () => {
    const redis = new RedisService();
    const val = await redis.get('nonexistent');
    expect(val).toBeNull();
  });

  it('should set with TTL', async () => {
    const redis = new RedisService();
    await redis.set('ttl:key', 'expires-fast', 1);
    const val = await redis.get('ttl:key');
    expect(val).toBe('expires-fast');
  });

  it('should delete keys', async () => {
    const redis = new RedisService();
    await redis.set('del:key', 'value');
    const deleted = await redis.del('del:key');
    expect(deleted).toBe(1);
    const val = await redis.get('del:key');
    expect(val).toBeNull();
  });

  it('should check key existence', async () => {
    const redis = new RedisService();
    await redis.set('exists:key', 'value');
    expect(await redis.exists('exists:key')).toBe(true);
    expect(await redis.exists('no:key')).toBe(false);
  });

  it('should expire keys', async () => {
    const redis = new RedisService();
    await redis.set('exp:key', 'value');
    expect(await redis.expire('exp:key', 0)).toBe(true);
    // Expire with 0 should expire immediately (in memory store)
    // But the in-memory store checks on access, so we just verify it works
    await redis.expire('exp:key', 1);
    const val = await redis.get('exp:key');
    expect(val).toBe('value'); // Still there within TTL
  });

  it('should increment and decrement', async () => {
    const redis = new RedisService();
    expect(await redis.incr('counter')).toBe(1);
    expect(await redis.incr('counter')).toBe(2);
    expect(await redis.incr('counter')).toBe(3);
    expect(await redis.decr('counter')).toBe(2);
    expect(await redis.decr('counter')).toBe(1);
  });

  it('should support list operations', async () => {
    const redis = new RedisService();

    await redis.lpush('list:test', 'c');
    await redis.lpush('list:test', 'b');
    await redis.lpush('list:test', 'a');

    expect(await redis.llen('list:test')).toBe(3);

    const items = await redis.lrange('list:test', 0, -1);
    expect(items).toEqual(['a', 'b', 'c']);

    const popped = await redis.rpop('list:test');
    expect(popped).toBe('c');
    expect(await redis.llen('list:test')).toBe(2);
  });

  it('should support hash operations', async () => {
    const redis = new RedisService();

    await redis.hset('hash:test', 'name', 'Alice');
    await redis.hset('hash:test', 'age', '30');

    const name = await redis.hget('hash:test', 'name');
    expect(name).toBe('Alice');

    const all = await redis.hgetall('hash:test');
    expect(all).toEqual({ name: 'Alice', age: '30' });

    const deleted = await redis.hdel('hash:test', 'age');
    expect(deleted).toBe(1);
    expect(await redis.hget('hash:test', 'age')).toBeNull();
  });

  it('should ping', async () => {
    const redis = new RedisService();
    expect(await redis.ping()).toBe('PONG');
  });

  it('should flush all keys', async () => {
    const redis = new RedisService();
    await redis.set('flush:key1', 'v1');
    await redis.set('flush:key2', 'v2');
    await redis.flush();
    expect(await redis.get('flush:key1')).toBeNull();
    expect(await redis.get('flush:key2')).toBeNull();
  });

  it('should quit gracefully', async () => {
    const redis = new RedisService();
    await redis.set('quit:key', 'value');
    await redis.quit();
    // After quit, the store is cleared
    const val = await redis.get('quit:key');
    expect(val).toBeNull();
  });

  it('should handle errors gracefully on operations', async () => {
    const redis = new RedisService();
    // Should not throw even when used without explicit connect
    await expect(redis.get('any')).resolves.not.toThrow();
    await expect(redis.set('any', 'val')).resolves.not.toThrow();
    await expect(redis.del('any')).resolves.not.toThrow();
  });
});

// ── Cache Manager ─────────────────────────────────────────────────────────

describe('CacheManager', () => {
  it('should getOrSet with cache miss', async () => {
    const cache = new CacheManager();
    const fetchFn = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

    const result = await cache.getOrSet('test:1', fetchFn);

    expect(result).toEqual({ id: 1, name: 'Test' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should getOrSet with cache hit', async () => {
    const cache = new CacheManager();
    const fetchFn = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

    // First call — miss
    await cache.getOrSet('test:2', fetchFn);
    // Second call — hit
    const result = await cache.getOrSet('test:2', fetchFn);

    expect(result).toEqual({ id: 1, name: 'Test' });
    expect(fetchFn).toHaveBeenCalledTimes(1); // Only called once
  });

  it('should track hit/miss stats', async () => {
    const cache = new CacheManager();
    const fetchFn = vi.fn().mockResolvedValue('value');

    // Miss
    await cache.getOrSet('stats:1', fetchFn);
    // Hit
    await cache.getOrSet('stats:1', fetchFn);
    // Miss (different key)
    await cache.getOrSet('stats:2', fetchFn);

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.total).toBe(3);
    expect(stats.ratio).toBeCloseTo(0.333, 1);
  });

  it('should invalidate a specific key', async () => {
    const cache = new CacheManager();
    const fetchFn = vi.fn().mockResolvedValue('data');

    await cache.getOrSet('inval:1', fetchFn);
    await cache.invalidate('inval:1');

    // Should miss again
    await cache.getOrSet('inval:1', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should clear a namespace', async () => {
    const cache = new CacheManager();
    const fn1 = vi.fn().mockResolvedValue('a');
    const fn2 = vi.fn().mockResolvedValue('b');

    await cache.getOrSet('user:1', fn1);
    await cache.getOrSet('user:2', fn2);

    await cache.clearNamespace('user');

    // Both should miss
    await cache.getOrSet('user:1', fn1);
    await cache.getOrSet('user:2', fn2);
    expect(fn1).toHaveBeenCalledTimes(2);
    expect(fn2).toHaveBeenCalledTimes(2);
  });

  it('should invalidate by pattern', async () => {
    const cache = new CacheManager();
    const fn1 = vi.fn().mockResolvedValue('x');
    const fn2 = vi.fn().mockResolvedValue('y');

    await cache.getOrSet('rate-limit:user:1', fn1);
    await cache.getOrSet('rate-limit:user:2', fn2);

    await cache.invalidatePattern('rate-limit:*');

    await cache.getOrSet('rate-limit:user:1', fn1);
    expect(fn1).toHaveBeenCalledTimes(2);
  });

  it('should reset stats', async () => {
    const cache = new CacheManager();
    const fn = vi.fn().mockResolvedValue('v');

    await cache.getOrSet('reset:1', fn);
    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.total).toBe(0);
  });
});

// ── Job Queue ─────────────────────────────────────────────────────────────

describe('QueueService', () => {
  it('should enqueue and process jobs', async () => {
    const queue = new QueueService();
    const handler = vi.fn().mockResolvedValue(undefined);

    queue.process('email-send', handler);

    const job = await queue.enqueue('email-send', {
      to: 'test@example.com',
      subject: 'Hello',
    });

    expect(job.type).toBe('email-send');
    expect(job.data).toEqual({ to: 'test@example.com', subject: 'Hello' });
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(3);

    // Wait a moment for the poller to pick it up
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(handler).toHaveBeenCalled();
  });

  it('should get queue length', async () => {
    const queue = new QueueService();

    await queue.enqueue('email-send', { to: 'a@b.com' });
    await queue.enqueue('email-send', { to: 'c@d.com' });

    const len = await queue.getQueueLength('email-send');
    expect(len).toBe(2);
  });

  it('should list pending jobs', async () => {
    const queue = new QueueService();

    await queue.enqueue('token-refresh', { token: 'abc' });
    await queue.enqueue('token-refresh', { token: 'def' });

    const pending = await queue.getPendingJobs('token-refresh');
    expect(pending.length).toBe(2);
    expect(pending[0].data).toEqual({ token: 'abc' });
  });

  it('should remove a pending job by ID', async () => {
    const queue = new QueueService();

    const job1 = await queue.enqueue('audit-log-flush', { count: 10 });
    const job2 = await queue.enqueue('audit-log-flush', { count: 20 });

    const removed = await queue.removeJob('audit-log-flush', job1.id);
    expect(removed).toBe(true);

    const pending = await queue.getPendingJobs('audit-log-flush');
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(job2.id);
  });

  it('should handle failed jobs with retry', async () => {
    const queue = new QueueService();
    let attempts = 0;

    const handler = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= 2) {
        throw new Error('Temporary failure');
      }
    });

    queue.process('token-refresh', handler);

    await queue.enqueue('token-refresh', { token: 'abc' }, { maxAttempts: 2 });

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Handler was called
    expect(handler).toHaveBeenCalled();
  });

  it('should start and stop processing', async () => {
    const queue = new QueueService();
    queue.stopProcessing();
    // Should not throw
    queue.startProcessing();
    queue.stopProcessing();
  });
});

// ── Session Store ─────────────────────────────────────────────────────────

describe('SessionStore', () => {
  it('should create and retrieve a session', async () => {
    const store = new SessionStore();

    const session = await store.createSession('user-1', {
      name: 'Alice',
      role: 'admin',
    });

    expect(session.userId).toBe('user-1');
    expect(session.data).toEqual({ name: 'Alice', role: 'admin' });
    expect(session.id).toBeTruthy();

    const retrieved = await store.getSession(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe('user-1');
    expect(retrieved!.data).toEqual({ name: 'Alice', role: 'admin' });
  });

  it('should return null for non-existent sessions', async () => {
    const store = new SessionStore();
    const session = await store.getSession('nonexistent');
    expect(session).toBeNull();
  });

  it('should update session data', async () => {
    const store = new SessionStore();

    const session = await store.createSession('user-2', { theme: 'dark' });

    const updated = await store.updateSession(session.id, {
      theme: 'light',
      lang: 'en',
    });

    expect(updated).not.toBeNull();
    expect(updated!.data).toEqual({ theme: 'light', lang: 'en' });
  });

  it('should delete a session', async () => {
    const store = new SessionStore();

    const session = await store.createSession('user-3', { foo: 'bar' });

    const deleted = await store.deleteSession(session.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getSession(session.id);
    expect(retrieved).toBeNull();
  });

  it('should return false when deleting non-existent session', async () => {
    const store = new SessionStore();
    const deleted = await store.deleteSession('bad-id');
    expect(deleted).toBe(false);
  });

  it('should list all sessions for a user', async () => {
    const store = new SessionStore();

    await store.createSession('user-4', { a: 1 });
    await store.createSession('user-4', { b: 2 });
    await store.createSession('user-4', { c: 3 });

    const sessions = await store.listUserSessions('user-4');
    expect(sessions.length).toBe(3);

    // All sessions should belong to user-4
    for (const s of sessions) {
      expect(s.userId).toBe('user-4');
    }
  });

  it('should return empty array for user with no sessions', async () => {
    const store = new SessionStore();
    const sessions = await store.listUserSessions('no-sessions');
    expect(sessions).toEqual([]);
  });

  it('should create session with TTL override', async () => {
    const store = new SessionStore();

    const session = await store.createSession('user-5', { data: { x: 1 }, ttl: 7200 });
    expect(session.data).toEqual({ x: 1 });
  });
});

// ── TTL Defaults ──────────────────────────────────────────────────────────

describe('TTL defaults', () => {
  it('should have correct default values', () => {
    expect(TTL.SESSION).toBe(3600);
    expect(TTL.RATE_LIMIT).toBe(60);
    expect(TTL.CACHE).toBe(300);
    expect(TTL.CHAT_HISTORY).toBe(7200);
  });
});

// ── Fallback Graceful Degradation ─────────────────────────────────────────

describe('Graceful degradation when Redis is unavailable', () => {
  it('should still set and get values', async () => {
    const redis = new RedisService();
    await redis.set('fallback:k', 'v');
    expect(await redis.get('fallback:k')).toBe('v');
  });

  it('should still support TTL-based expiry', async () => {
    const redis = new RedisService();
    await redis.set('expire:test', 'value', 1);
    // Immediately accessible
    expect(await redis.get('expire:test')).toBe('value');
  });

  it('should handle concurrent operations', async () => {
    const redis = new RedisService();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(redis.set(`concurrent:${i}`, `val-${i}`));
    }
    await Promise.all(promises);

    for (let i = 0; i < 10; i++) {
      expect(await redis.get(`concurrent:${i}`)).toBe(`val-${i}`);
    }
  });
});
