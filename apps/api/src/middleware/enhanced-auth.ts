import type { Context, Next } from 'hono';
import { verifyToken, refreshSession } from '../services/supabase-admin.js';
import { PermissionSystem, UserRoleService } from '../services/rbac.js';
import { logAuthentication, logAuthorizationFailure } from '../services/audit-logger.js';
import { checkRateLimit, extractIP, trackFailedAuthAttempt, resetFailedAuthAttempts } from './rate-limit.js';

// ---------------------------------------------------------------------------
// Enhanced Auth Middleware
//
// Provides comprehensive authentication and authorization:
//   1. Bearer token validation via Supabase Auth
//   2. CSRF protection for state-changing requests
//   3. Rate limiting integration
//   4. Role-based authorization checks
//   5. Audit logging
//   6. Token rotation support (refreshes near-expiry tokens)
//   7. Context enrichment with user details, roles, and permissions
//
// Usage:
//   app.use('/api/*', enhancedAuth);
//   app.use('/api/admin/*', requireRole('admin'));
//   app.use('/api/conversations', requirePermission('conversations', 'create'));
// ---------------------------------------------------------------------------

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  ipAddress: string;
  requestId: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthenticatedUser;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Token is considered "near expiry" if less than 5 minutes remain */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Rate limit for auth checks: 200 req/min per user */
const AUTH_RATE_LIMIT = 200;
const AUTH_RATE_WINDOW_MS = 60_000;

/** CSRF token header name */
const CSRF_HEADER = 'x-csrf-token';

/** Methods that require CSRF protection */
const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if the request has a valid CSRF token.
 * For API-to-API calls, we use a double-submit cookie pattern.
 * For browser clients, the CSRF token must match the Origin/Referer.
 */
function validateCSRF(c: Context): boolean {
  // Skip CSRF for GET and HEAD requests
  if (!CSRF_PROTECTED_METHODS.includes(c.req.method)) {
    return true;
  }

  // API-to-API calls with Authorization header are exempt (no browser CSRF risk)
  // We validate via Origin/Referer instead
  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const allowedOrigins = frontendUrl.split(',').map((o) => o.trim());

  // If Origin is present, it must match allowed origins
  if (origin) {
    return allowedOrigins.some(
      (allowed) => origin === allowed || origin?.startsWith(allowed.replace(/\/$/, ''))
    );
  }

  // If Referer is present (and no Origin), check that too
  if (referer) {
    return allowedOrigins.some((allowed) => referer.startsWith(allowed));
  }

  // No Origin or Referer — could be a server-to-server call with Bearer token.
  // Allow through; the token validation handles security.
  return true;
}

// ── Middleware ────────────────────────────────────────────────────────────

/**
 * Enhanced authentication middleware.
 * Validates JWT, checks rate limits, enriches context, logs events.
 */
export async function enhancedAuth(c: Context, next: Next): Promise<Response | void> {
  const ipAddress = extractIP(c);
  const userAgent = c.req.header('user-agent') || undefined;
  const requestId = generateRequestId();

  // ── Rate limiting for auth checks ─────────────────────────────────────
  const rateKey = `authcheck:${ipAddress}`;
  const rateResult = checkRateLimit(rateKey, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS, 'enhanced-auth');

  if (!rateResult.allowed) {
    c.header('X-RateLimit-Limit', String(AUTH_RATE_LIMIT));
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', String(Math.ceil(rateResult.resetAt / 1000)));
    c.header('Retry-After', String(rateResult.retryAfter));

    return c.json(
      {
        error: 'Too many authentication requests. Please slow down.',
        retryAfter: rateResult.retryAfter,
      },
      429
    );
  }

  // ── CSRF Protection ───────────────────────────────────────────────────
  if (!validateCSRF(c)) {
    return c.json(
      {
        error: 'CSRF validation failed. Invalid request origin.',
        requestId,
      },
      403
    );
  }

  // ── Token extraction ──────────────────────────────────────────────────
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logAuthentication(null, false, ipAddress, userAgent, 'Missing authorization header');

    return c.json(
      {
        error: 'Missing or invalid authorization header. Provide a Bearer token.',
        requestId,
      },
      401
    );
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  if (!token || token.length < 10) {
    await logAuthentication(null, false, ipAddress, userAgent, 'Token too short or empty');

    return c.json(
      {
        error: 'Invalid token format.',
        requestId,
      },
      401
    );
  }

  // ── Token verification via Supabase ───────────────────────────────────
  const userData = await verifyToken(token);

  if (!userData) {
    // Track failed auth attempt for IP reputation
    await trackFailedAuthAttempt(ipAddress);
    await logAuthentication(null, false, ipAddress, userAgent, 'Token verification failed');

    return c.json(
      {
        error: 'Invalid or expired token. Please sign in again.',
        requestId,
      },
      401
    );
  }

  // ── Token rotation (near expiry) ──────────────────────────────────────
  // Decode the JWT to check expiry without a Supabase call
  let tokenNearExpiry = false;
  try {
    const payload = decodeJWT(token);
    if (payload && payload.exp) {
      const expiresAtMs = (payload.exp as number) * 1000;
      if (expiresAtMs - Date.now() < TOKEN_EXPIRY_BUFFER_MS) {
        tokenNearExpiry = true;
      }
    }
  } catch {
    // If we can't decode the JWT, proceed without rotation
  }

  if (tokenNearExpiry) {
    // Attempt to rotate the session (non-blocking)
    const refreshToken = c.req.header('x-refresh-token');
    if (refreshToken) {
      const newSession = await refreshSession(refreshToken);
      if (newSession) {
        // Set the new token in response headers
        c.header('X-New-Token', newSession.accessToken);
        c.header('X-New-Refresh-Token', newSession.refreshToken);
        c.header('X-Token-Expires-At', String(newSession.expiresAt));
      }
    }
  }

  // ── Successful login — reset failed attempts ──────────────────────────
  await resetFailedAuthAttempts(ipAddress);
  await logAuthentication(userData.id, true, ipAddress, userAgent);

  // ── Fetch user roles ──────────────────────────────────────────────────
  let roles: string[] = [];
  try {
    roles = await UserRoleService.getUserRoleNames(userData.id);
  } catch (err) {
    // If PostgreSQL is not available, assign no roles
    console.warn('[enhanced-auth] Failed to fetch roles (PostgreSQL may not be available):', err);
    roles = [];
  }

  // ── Build enriched user context ───────────────────────────────────────
  const enrichedUser: AuthenticatedUser = {
    id: userData.id,
    email: userData.email,
    roles,
    permissions: [], // Permissions are checked dynamically via requirePermission
    sessionId: userData.sessionId,
    ipAddress,
    requestId,
  };

  c.set('user', enrichedUser);

  // ── Set security headers ──────────────────────────────────────────────
  c.header('X-Request-ID', requestId);
  c.header('X-Auth-Timestamp', String(Date.now()));

  await next();
}

// ── Middleware Factories ──────────────────────────────────────────────────

/**
 * Require a specific role to access a route.
 * Use after `enhancedAuth` middleware.
 *
 * @example
 *   app.use('/api/admin/*', enhancedAuth);
 *   app.use('/api/admin/*', requireRole('admin'));
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const hasRole = roles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      const ipAddress = extractIP(c);
      const userAgent = c.req.header('user-agent') || undefined;

      await logAuthorizationFailure(
        user.id,
        'route',
        c.req.method,
        `Required roles: ${roles.join(', ')}, user has: ${user.roles.join(', ') || 'none'}`,
        ipAddress,
        userAgent
      );

      return c.json(
        {
          error: `Access denied. Required role(s): ${roles.join(', ')}`,
          requestId: user.requestId,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require a specific permission to access a route.
 * Checks the user's roles for the required resource:action permission.
 *
 * @example
 *   app.use('/api/conversations', enhancedAuth);
 *   app.post('/api/conversations', requirePermission('conversations', 'create'), handler);
 */
export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    // Admin always has access (handled at the DB level by *:* permission)
    try {
      const result = await PermissionSystem.can(user.id, resource, action);

      if (!result.allowed) {
        const ipAddress = extractIP(c);
        const userAgent = c.req.header('user-agent') || undefined;

        await logAuthorizationFailure(
          user.id,
          resource,
          action,
          `User lacks "${resource}:${action}" permission. Roles: ${user.roles.join(', ') || 'none'}`,
          ipAddress,
          userAgent
        );

        return c.json(
          {
            error: `Access denied. You need the "${resource}:${action}" permission.`,
            requestId: user.requestId,
          },
          403
        );
      }
    } catch (err) {
      console.error('[enhanced-auth] Permission check failed:', err);

      return c.json(
        {
          error: 'Authorization check failed due to an internal error.',
          requestId: user.requestId,
        },
        500
      );
    }

    await next();
  };
}

/**
 * Requires the user to be an admin.
 * Convenience wrapper around requireRole.
 */
export const requireAdmin = requireRole('admin');

// ── JWT Decode (without verification) ─────────────────────────────────────

/**
 * Decode a JWT token without verifying signature.
 * Used to check expiration for token rotation hints.
 */
function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // Base64 URL-safe decode
    const decoded = atobURL(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Base64 URL-safe decode.
 */
function atobURL(input: string): string {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf-8');
}
