/**
 * Patterns that indicate sensitive information in error messages.
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys and tokens
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_KEY]' },
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_KEY]' },
  { pattern: /sk_test_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_KEY]' },
  { pattern: /ghp_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_TOKEN]' },
  { pattern: /xox[bpoas]-[a-zA-Z0-9-]+/g, replacement: '[REDACTED_TOKEN]' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[REDACTED_KEY]' },
  // Passwords and secrets in strings
  { pattern: /(password|passwd|secret|token|api_?key)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi,
    replacement: '$1=[REDACTED]' },
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
    replacement: '[REDACTED_JWT]' },
  // Connection strings
  { pattern: /(mongodb|postgres|mysql|redis|amqp):\/\/[^\s]+/gi,
    replacement: '[REDACTED_CONNECTION_STRING]' },
  // File paths that reveal system structure
  { pattern: /\/home\/[^\/]+/g, replacement: '/home/[USER]' },
  { pattern: /\/Users\/[^\/]+/g, replacement: '/Users/[USER]' },
  // Internal IPs in error messages
  { pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[INTERNAL_IP]' },
  { pattern: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g, replacement: '[INTERNAL_IP]' },
  { pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g, replacement: '[INTERNAL_IP]' },
];

/**
 * Sanitize an error message by redacting sensitive information.
 * Returns a safe string for client consumption.
 */
export function sanitizeError(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message || 'An unexpected error occurred';
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'An unexpected error occurred';
  }

  // Apply all redaction patterns
  let sanitized = message;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Truncate extremely long messages
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + '...[truncated]';
  }

  return sanitized || 'An unexpected error occurred';
}

/**
 * Format an error for API response.
 * Logs the full error internally, returns sanitized version to client.
 */
export function formatApiError(error: unknown, context?: string): {
  error: string;
  status: number;
} {
  const fullMessage = error instanceof Error ? error.message : String(error);
  const fullStack = error instanceof Error ? error.stack : undefined;

  // Log full error server-side
  console.error(`[API Error${context ? `: ${context}` : ''}]`, fullMessage);
  if (fullStack) {
    console.error(fullStack);
  }

  // Determine HTTP status from error type
  let status = 500;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not found') || msg.includes('missing')) status = 404;
    else if (msg.includes('unauthorized') || msg.includes('no api key')) status = 401;
    else if (msg.includes('forbidden') || msg.includes('permission')) status = 403;
    else if (msg.includes('rate limit')) status = 429;
    else if (msg.includes('too large')) status = 413;
    else if (msg.includes('invalid') || msg.includes('validation')) status = 400;
  }

  return {
    error: sanitizeError(error),
    status,
  };
}
