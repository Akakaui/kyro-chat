// ---------------------------------------------------------------------------
// Sentry Middleware
//
// Hono middleware that creates a Sentry transaction per request.
// Captures request metadata, user context, errors, and response times.
// Gracefully no-ops if Sentry is not initialized.
// ---------------------------------------------------------------------------

import type { Context, Next } from 'hono';
import {
  startTransaction,
  stopTransaction,
  setUser,
  clearUser,
  captureError,
  isSentryEnabled,
} from '../services/sentry.js';
import { trackApiRoute } from '../services/monitor.js';
import type { SentryTransaction } from '../services/sentry.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract a clean route path from the request.
 * Replaces UUIDs, nanoids, and numeric IDs with parameter placeholders.
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[A-Za-z0-9_-]{21}(?=[/?]|$)/g, '/:id')   // nanoid
    .replace(/\/\d+(?=[/?]|$)/g, '/:id');
}

/**
 * Extract user info from context if authenticated.
 */
function getUserFromContext(c: Context): { id: string; email?: string } | null {
  try {
    const user = c.get('user');
    if (user?.id) {
      return { id: user.id, email: user.email };
    }
  } catch {
    // 'user' not set on context — unauthenticated route
  }
  return null;
}

// ── Middleware ─────────────────────────────────────────────────────────────

/**
 * Sentry request middleware.
 *
 * Usage:
 *   app.use('*', sentryMiddleware);
 *
 * Creates a transaction for each request, captures tags, user context,
 * and automatically finishes the transaction on response.
 */
export async function sentryMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Skip if Sentry is not enabled
  if (!isSentryEnabled()) {
    return next();
  }

  const method = c.req.method;
  const path = c.req.path;
  const normalizedPath = normalizePath(path);
  const transactionName = `${method} ${normalizedPath}`;

  // Start transaction
  const transaction = startTransaction(transactionName, 'http.server');

  // Set request-level tags
  if (transaction) {
    transaction.span.setAttribute('http.method', method);
    transaction.span.setAttribute('http.path', path);
    transaction.span.setAttribute('http.normalized_path', normalizedPath);
    transaction.span.setAttribute('http.query', c.req.query() ? JSON.stringify(c.req.query()) : '');
  }

  // Set user context if authenticated
  const userInfo = getUserFromContext(c);
  if (userInfo) {
    setUser(userInfo.id, userInfo.email);
  }

  // Track start time
  const startTime = Date.now();
  let statusCode = 200;

  try {
    await next();
    statusCode = c.res.status;
  } catch (err) {
    statusCode = err instanceof Error && 'status' in err ? (err as any).status : 500;
    captureError(err, {
      tags: {
        http_method: method,
        http_path: path,
        http_status: String(statusCode),
      },
      extra: {
        query: c.req.query(),
        headers: sanitizeHeaders(c.req.header('content-type') || '', c.req.header('user-agent') || ''),
      },
    });
    throw err; // Re-throw — let the app error handler deal with it
  } finally {
    const duration = Date.now() - startTime;

    // Track API route performance
    trackApiRoute(method, normalizedPath, statusCode, duration);

    // Finish transaction
    if (transaction) {
      transaction.span.setAttribute('http.status_code', statusCode);
      transaction.span.setAttribute('http.duration_ms', duration);

      const statusCategory = `${Math.floor(statusCode / 100)}xx`;
      stopTransaction(transaction, statusCategory);
    }

    // Clear user context after request
    if (userInfo) {
      clearUser();
    }
  }
}

/**
 * Sanitize sensitive data from headers before sending to Sentry.
 */
function sanitizeHeaders(...allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  // Only include explicitly allowed header values
  if (allowed[0]) result['content-type'] = allowed[0];
  if (allowed[1]) result['user-agent'] = allowed[1];
  return result;
}
