import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Audit Logger Tests
//
// Tests the audit logger service functions. Since these functions interact
// with PostgreSQL, we mock the database layer to test logic and error
// handling in isolation.
// ---------------------------------------------------------------------------

// Mock the database module
vi.mock('../db/init.js', () => ({
  getPgPool: vi.fn(() => {
    throw new Error('PostgreSQL not available in test');
  }),
  isPostgreSQLAvailable: vi.fn(() => false),
}));

import {
  logAuthentication,
  logAuthorizationFailure,
  logSecurityEvent,
  logPermissionChange,
  logRateLimitExceeded,
  logRoleAssignment,
  logRoleRemoval,
  getAuditLogs,
  getSecurityEvents,
} from '../services/audit-logger.js';

describe('Audit Logger', () => {
  describe('logAuthentication', () => {
    it('should handle successful authentication log', async () => {
      // Should not throw when PostgreSQL is unavailable
      await expect(
        logAuthentication('user-123', true, '127.0.0.1', 'test-agent', 'Login successful')
      ).resolves.not.toThrow();
    });

    it('should handle failed authentication log', async () => {
      await expect(
        logAuthentication(null, false, '192.168.1.1', 'malicious-bot', 'Invalid password')
      ).resolves.not.toThrow();
    });

    it('should handle missing optional parameters', async () => {
      await expect(
        logAuthentication('user-123', true)
      ).resolves.not.toThrow();
    });
  });

  describe('logAuthorizationFailure', () => {
    it('should log authorization failures', async () => {
      await expect(
        logAuthorizationFailure(
          'user-123',
          'conversations',
          'delete',
          'User lacks admin role',
          '10.0.0.1',
          'curl/7.0'
        )
      ).resolves.not.toThrow();
    });

    it('should handle missing user ID', async () => {
      await expect(
        logAuthorizationFailure(null, 'admin', 'access', 'Not authenticated')
      ).resolves.not.toThrow();
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events', async () => {
      await expect(
        logSecurityEvent('user-123', 'account_locked', 'Account locked after 5 failed attempts')
      ).resolves.not.toThrow();
    });

    it('should log security events without user ID', async () => {
      await expect(
        logSecurityEvent(null, 'suspicious_activity', 'Multiple requests from unknown IP')
      ).resolves.not.toThrow();
    });
  });

  describe('logPermissionChange', () => {
    it('should log permission grants', async () => {
      await expect(
        logPermissionChange('user-123', 'target-user-456', 'admin', 'granted', 'admin-user')
      ).resolves.not.toThrow();
    });

    it('should log permission revocations', async () => {
      await expect(
        logPermissionChange('user-123', 'target-user-456', 'editor', 'revoked', 'admin-user')
      ).resolves.not.toThrow();
    });
  });

  describe('logRateLimitExceeded', () => {
    it('should log rate limit events', async () => {
      await expect(
        logRateLimitExceeded('user:user-123', '10.0.0.1', '/api/chat/messages', 'POST')
      ).resolves.not.toThrow();
    });

    it('should handle IP-based rate limit events (no user)', async () => {
      await expect(
        logRateLimitExceeded('ip:192.168.1.1', '192.168.1.1', '/auth/login', 'POST')
      ).resolves.not.toThrow();
    });
  });

  describe('logRoleAssignment and logRoleRemoval', () => {
    it('should log role assignments', async () => {
      await expect(
        logRoleAssignment('target-user', 'admin', 'admin-user', '10.0.0.1')
      ).resolves.not.toThrow();
    });

    it('should log role removals', async () => {
      await expect(
        logRoleRemoval('target-user', 'editor', 'admin-user', '10.0.0.1')
      ).resolves.not.toThrow();
    });
  });

  describe('getAuditLogs', () => {
    it('should return empty logs when PostgreSQL is unavailable', async () => {
      const result = await getAuditLogs('user-123');
      expect(result).toEqual({ logs: [], total: 0 });
    });

    it('should handle query options', async () => {
      const result = await getAuditLogs('user-123', {
        limit: 10,
        offset: 0,
        category: 'auth',
        eventType: 'login_success',
        startDate: Date.now() - 86400000,
        endDate: Date.now(),
        orderDirection: 'DESC',
      });
      expect(result).toEqual({ logs: [], total: 0 });
    });
  });

  describe('getSecurityEvents', () => {
    it('should return empty events when PostgreSQL is unavailable', async () => {
      const result = await getSecurityEvents();
      expect(result).toEqual({ events: [], total: 0 });
    });

    it('should handle filter options', async () => {
      const result = await getSecurityEvents({
        eventType: 'account_locked',
        userId: 'user-123',
        startDate: Date.now() - 86400000,
        endDate: Date.now(),
        limit: 20,
        offset: 0,
      });
      expect(result).toEqual({ events: [], total: 0 });
    });
  });
});
