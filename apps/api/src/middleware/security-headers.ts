import { MiddlewareHandler } from 'hono';

/**
 * Security headers middleware for Hono.
 * Adds standard security headers to all responses.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  c.header('X-Frame-Options', 'DENY');

  // XSS protection (legacy browsers)
  c.header('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy - restrict camera, microphone, geolocation
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // H7: Content Security Policy
  // Restricts resource loading to same-origin; allows inline styles for UI frameworks;
  // allows WebSocket connections to localhost for noVNC proxy.
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' ws://localhost:* wss://localhost:*; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'"
  );

  // Strict Transport Security (HTTPS only in production)
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Remove server identification headers
  c.header('X-Powered-By', '');
};
