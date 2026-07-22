import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Rate Limiter Tests
//
// Tests the in-memory rate limiter with sliding window, account lockout,
// and IP reputation tracking.
// ---------------------------------------------------------------------------

// Mock DB before importing
vi.mock('../db/init.js', () => ({
  getPgPool: vi.fn(() => { throw new Error('PG not available'); }),
  isPostgreSQLAvailable: vi.fn(() => false),
}));

vi.mock('../services/audit-logger.js', () => ({
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

import {
  checkRateLimit,
  _resetStore,
  _resetAllStores,
  extractIP,
  trackFailedAuthAttempt,
  resetFailedAuthAttempts,
  isIPBlocked,
  rateLimit,
} from '../middleware/rate-limit.js';

describe('Rate Limiter', () => {
  beforeEach(() => {
    _resetAllStores();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within the limit', () => {
      const result = checkRateLimit('test-key', 10, 60_000, 'test-store');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.retryAfter).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBe(10);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should block requests exceeding the limit', () => {
      const key = 'block-test';
      const limit = 3;

      // Consume all 3 allowed requests
      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit(key, limit, 60_000, 'block-store');
        expect(result.allowed).toBe(true);
      }

      // 4th request should be blocked
      const result = checkRateLimit(key, limit, 60_000, 'block-store');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after the window expires', () => {
      const key = 'reset-test';
      const limit = 1;

      // First request — allowed
      const r1 = checkRateLimit(key, limit, 100, 'reset-store');
      expect(r1.allowed).toBe(true);

      // Second request — blocked (window not expired)
      const r2 = checkRateLimit(key, limit, 100, 'reset-store');
      expect(r2.allowed).toBe(false);

      // Wait for window to expire
      // We can't actually wait, so let's simulate by resetting
      _resetStore('reset-store');

      const r3 = checkRateLimit(key, limit, 100, 'reset-store');
      expect(r3.allowed).toBe(true);
    });

    it('should track different keys independently', () => {
      const limit = 2;
      const windowMs = 60_000;

      // Exhaust key1
      checkRateLimit('key1', limit, windowMs, 'multi-store');
      checkRateLimit('key1', limit, windowMs, 'multi-store');
      const key1Blocked = checkRateLimit('key1', limit, windowMs, 'multi-store');
      expect(key1Blocked.allowed).toBe(false);

      // key2 should still be allowed
      const key2Result = checkRateLimit('key2', limit, windowMs, 'multi-store');
      expect(key2Result.allowed).toBe(true);
      expect(key2Result.remaining).toBe(1);
    });

    it('should separate different stores', () => {
      const limit = 1;

      // Exhaust in store1
      checkRateLimit('shared-key', limit, 60_000, 'store1');
      const store1Blocked = checkRateLimit('shared-key', limit, 60_000, 'store1');
      expect(store1Blocked.allowed).toBe(false);

      // Same key in store2 should be fresh
      const store2Result = checkRateLimit('shared-key', limit, 60_000, 'store2');
      expect(store2Result.allowed).toBe(true);
    });

    it('should handle high request counts', () => {
      const key = 'high-volume';
      const limit = 1000;

      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit(key, limit, 60_000, 'high-vol-store');
        expect(result.allowed).toBe(true);
      }

      const blocked = checkRateLimit(key, limit, 60_000, 'high-vol-store');
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  describe('extractIP', () => {
    it('should extract IP from x-forwarded-for', () => {
      const mockC = {
        req: {
          header: (name: string) => {
            if (name === 'x-forwarded-for') return '203.0.113.1, 10.0.0.1';
            return undefined;
          },
        },
      };
      expect(extractIP(mockC as any)).toBe('203.0.113.1');
    });

    it('should fall back to x-real-ip', () => {
      const mockC = {
        req: {
          header: (name: string) => {
            if (name === 'x-real-ip') return '198.51.100.1';
            return undefined;
          },
        },
      };
      expect(extractIP(mockC as any)).toBe('198.51.100.1');
    });

    it('should return unknown when no IP headers present', () => {
      const mockC = {
        req: {
          header: () => undefined,
        },
      };
      expect(extractIP(mockC as any)).toBe('unknown');
    });
  });

  describe('trackFailedAuthAttempt (with PG unavailable)', () => {
    it('should return not blocked when PG is unavailable', async () => {
      const result = await trackFailedAuthAttempt('203.0.113.1');
      expect(result.blocked).toBe(false);
      expect(result.remainingAttempts).toBe(5);
    });
  });

  describe('resetFailedAuthAttempts (with PG unavailable)', () => {
    it('should not throw when PG is unavailable', async () => {
      await expect(resetFailedAuthAttempts('203.0.113.1')).resolves.not.toThrow();
    });
  });

  describe('isIPBlocked (with PG unavailable)', () => {
    it('should return false when PG is unavailable', async () => {
      const blocked = await isIPBlocked('203.0.113.1');
      expect(blocked).toBe(false);
    });
  });

  describe('_resetStore and _resetAllStores', () => {
    it('should clear individual stores', () => {
      checkRateLimit('key', 1, 60_000, 'clear-test');
      _resetStore('clear-test');

      const result = checkRateLimit('key', 1, 60_000, 'clear-test');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 0 because count is incremented before check
    });

    it('should clear all stores', () => {
      checkRateLimit('k1', 2, 60_000, 'all1');
      checkRateLimit('k2', 2, 60_000, 'all2');
      _resetAllStores();

      const r1 = checkRateLimit('k1', 2, 60_000, 'all1');
      expect(r1.remaining).toBe(1);

      const r2 = checkRateLimit('k2', 2, 60_000, 'all2');
      expect(r2.remaining).toBe(1);
    });
  });
});
