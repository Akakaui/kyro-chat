import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Enhanced Auth Middleware Tests
//
// Tests the authentication middleware functions:
//   - Token validation
//   - CSRF protection
//   - Rate limiting integration
//   - Role-based authorization
//   - Permission checking
//
// We mock external dependencies (Supabase, DB) to test middleware logic.
// ---------------------------------------------------------------------------

// Mock all external dependencies
vi.mock('../services/supabase-admin.js', () => ({
  verifyToken: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('../services/rbac.js', () => ({
  PermissionSystem: {
    can: vi.fn(),
  },
  UserRoleService: {
    getUserRoleNames: vi.fn(),
  },
}));

vi.mock('../services/audit-logger.js', () => ({
  logAuthentication: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  checkRateLimit: vi.fn(),
  extractIP: vi.fn(() => '127.0.0.1'),
  trackFailedAuthAttempt: vi.fn(),
  resetFailedAuthAttempts: vi.fn(),
}));

vi.mock('hono', () => ({
  Context: class MockContext {
    private _headers: Record<string, string> = {};
    private _variables: Record<string, unknown> = {};
    private _status: number = 200;
    private _body: unknown = null;

    req = {
      header: (name: string) => this._headers[name.toLowerCase()] || undefined,
      method: 'GET',
      path: '/api/test',
      query: () => ({}),
    };

    header(name: string, value: string) {
      this._headers[name] = value;
    }

    set(name: string, value: unknown) {
      this._variables[name] = value;
    }

    get(name: string) {
      return this._variables[name];
    }

    json(body: unknown, status?: number) {
      this._body = body;
      if (status) this._status = status;
      return new Response(JSON.stringify(body), { status: status || this._status });
    }

    get status() { return this._status; }
    get body() { return this._body; }
    get headers() { return this._headers; }
  },
}));

// Now import the middleware and mocked modules
import { enhancedAuth, requireRole, requirePermission } from '../middleware/enhanced-auth.js';
import { verifyToken } from '../services/supabase-admin.js';
import { PermissionSystem, UserRoleService } from '../services/rbac.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

describe('Enhanced Auth Middleware', () => {
  let mockC: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fresh mock context
    mockC = {
      req: {
        header: vi.fn((name: string) => {
          const headers: Record<string, string> = {
            'authorization': 'Bearer valid-test-token',
            'origin': 'http://localhost:3000',
            'user-agent': 'test-agent',
          };
          return headers[name.toLowerCase()];
        }),
        method: 'GET',
        path: '/api/test',
      },
      header: vi.fn(),
      set: vi.fn(),
      json: vi.fn((body: unknown, status?: number) => ({
        body,
        status: status || 200,
      })),
      get: vi.fn(() => undefined), // Will be overridden where needed
    };

    mockNext = vi.fn();

    // Default mock: rate limit allows
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 199,
      retryAfter: 0,
      limit: 200,
      resetAt: Date.now() + 60000,
    });

    // Default mock: verify token succeeds
    vi.mocked(verifyToken).mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      sessionId: 'test-session',
    });

    // Default mock: user has roles
    vi.mocked(UserRoleService.getUserRoleNames).mockResolvedValue(['user']);

    // Default mock: permission check allows
    vi.mocked(PermissionSystem.can).mockResolvedValue({
      allowed: true,
      role: 'user',
      permission: 'conversations:read',
    });
  });

  // ── Auth Flow Tests ──────────────────────────────────────────────────

  describe('enhancedAuth middleware', () => {
    it('should pass valid requests through', async () => {
      const result = await enhancedAuth(mockC, mockNext);

      // Should call next() and not return an error response
      expect(mockNext).toHaveBeenCalled();
      expect(mockC.json).not.toHaveBeenCalled();
    });

    it('should reject requests without Authorization header', async () => {
      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'origin': 'http://localhost:3000',
          'user-agent': 'test-agent',
        };
        return headers[name.toLowerCase()];
      });

      const result = await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('authorization') }),
        401
      );
    });

    it('should reject invalid token format', async () => {
      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'InvalidFormat',
          'origin': 'http://localhost:3000',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('authorization') }),
        expect.any(Number)
      );
    });

    it('should reject expired/invalid tokens', async () => {
      vi.mocked(verifyToken).mockResolvedValue(null);

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('expired') }),
        401
      );
    });

    it('should set user context with enriched data', async () => {
      await enhancedAuth(mockC, mockNext);

      expect(mockC.set).toHaveBeenCalledWith('user', expect.objectContaining({
        id: 'test-user-id',
        email: 'test@example.com',
        roles: ['user'],
        ipAddress: '127.0.0.1',
      }));
    });

    it('should set security headers', async () => {
      await enhancedAuth(mockC, mockNext);

      expect(mockC.header).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
      expect(mockC.header).toHaveBeenCalledWith('X-Auth-Timestamp', expect.any(String));
    });

    it('should reject rate-limited requests', async () => {
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: false,
        remaining: 0,
        retryAfter: 30,
        limit: 200,
        resetAt: Date.now() + 30000,
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Too many') }),
        429
      );
    });

    it('should handle empty token', async () => {
      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer ',
          'origin': 'http://localhost:3000',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('token') }),
        401
      );
    });

    it('should handle very short token', async () => {
      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer ab',
          'origin': 'http://localhost:3000',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ── Role Authorization Tests ─────────────────────────────────────────

  describe('requireRole middleware', () => {
    it('should allow users with the required role', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['admin'],
        requestId: 'req-123',
      }));

      const middleware = requireRole('admin');
      await middleware(mockC, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockC.json).not.toHaveBeenCalled();
    });

    it('should reject users without the required role', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['user'],
        requestId: 'req-123',
      }));

      const middleware = requireRole('admin');
      await middleware(mockC, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Access denied') }),
        403
      );
    });

    it('should reject unauthenticated users', async () => {
      mockC.get = vi.fn(() => undefined);

      const middleware = requireRole('user');
      await middleware(mockC, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Authentication') }),
        401
      );
    });

    it('should allow users with any of multiple required roles', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['editor'],
        requestId: 'req-123',
      }));

      const middleware = requireRole('admin', 'editor');
      await middleware(mockC, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject users with no matching role', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['viewer'],
        requestId: 'req-123',
      }));

      const middleware = requireRole('admin', 'editor');
      await middleware(mockC, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // ── Permission Check Tests ───────────────────────────────────────────

  describe('requirePermission middleware', () => {
    it('should allow users with the required permission', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['user'],
        requestId: 'req-123',
      }));

      vi.mocked(PermissionSystem.can).mockResolvedValue({
        allowed: true,
        role: 'user',
        permission: 'conversations:read',
      });

      const middleware = requirePermission('conversations', 'read');
      await middleware(mockC, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject users without the required permission', async () => {
      mockC.get = vi.fn(() => ({
        id: 'test-user',
        email: 'test@example.com',
        roles: ['viewer'],
        requestId: 'req-123',
      }));

      vi.mocked(PermissionSystem.can).mockResolvedValue({
        allowed: false,
        role: null,
        permission: null,
      });

      const middleware = requirePermission('conversations', 'delete');
      await middleware(mockC, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Access denied') }),
        403
      );
    });

    it('should reject unauthenticated users', async () => {
      mockC.get = vi.fn(() => undefined);

      const middleware = requirePermission('conversations', 'read');
      await middleware(mockC, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockC.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Authentication') }),
        401
      );
    });
  });

  // ── CSRF Protection Tests ─────────────────────────────────────────────

  describe('CSRF protection', () => {
    it('should allow requests with valid origin', async () => {
      // GET requests skip CSRF
      mockC.req.method = 'POST';

      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer valid-test-token',
          'origin': 'http://localhost:3000',
          'user-agent': 'test-agent',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow requests with valid referer', async () => {
      mockC.req.method = 'POST';

      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer valid-test-token',
          'referer': 'http://localhost:3000/dashboard',
          'user-agent': 'test-agent',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow server-to-server calls without origin', async () => {
      mockC.req.method = 'POST';

      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer valid-test-token',
          'user-agent': 'test-agent',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip CSRF for GET requests', async () => {
      mockC.req.method = 'GET';

      // No origin should still work for GET
      mockC.req.header = vi.fn((name: string) => {
        const headers: Record<string, string> = {
          'authorization': 'Bearer valid-test-token',
          'user-agent': 'test-agent',
        };
        return headers[name.toLowerCase()];
      });

      await enhancedAuth(mockC, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
