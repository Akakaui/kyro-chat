import { describe, it, expect } from 'vitest';
import { sanitizeError, formatApiError } from '../lib/sanitize-error.js';

describe('sanitizeError', () => {
  describe('redacts sensitive patterns', () => {
    it('should redact OpenAI API keys (sk- pattern)', () => {
      // Note: the regex is /sk-[a-zA-Z0-9]{20,}/ which requires 20+ alphanumeric
      // chars AFTER "sk-", no dashes. So we use a key that matches.
      const msg = 'Error: API key sk-abcdefghijklmnopqrstuvwxyz123 invalid';
      const result = sanitizeError(msg);
      expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123');
      expect(result).toContain('[REDACTED_KEY]');
    });

    it('should redact OpenAI live keys', () => {
      const msg = 'Failed with sk_live_abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeError(msg);
      expect(result).not.toContain('sk_live_abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[REDACTED_KEY]');
    });

    it('should redact OpenAI test keys', () => {
      const msg = 'Test key sk_test_abcdefghijklmnopqrstuvwxyz failed';
      const result = sanitizeError(msg);
      expect(result).not.toContain('sk_test_abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[REDACTED_KEY]');
    });

    it('should redact GitHub personal access tokens', () => {
      const msg = 'Auth failed with ghp_abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeError(msg);
      expect(result).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[REDACTED_TOKEN]');
    });

    it('should redact GitHub OAuth tokens', () => {
      const msg = 'OAuth error: gho_abcdefghijklmnopqrstuvwxyz';
      const result = sanitizeError(msg);
      expect(result).not.toContain('gho_abcdefghijklmnopqrstuvwxyz');
      expect(result).toContain('[REDACTED_TOKEN]');
    });

    it('should redact Slack tokens', () => {
      const msg = 'Slack failure: xoxb-1234567890-abcdefghijk';
      const result = sanitizeError(msg);
      expect(result).toContain('[REDACTED_TOKEN]');
      expect(result).not.toMatch(/xoxb/);
    });

    it('should redact AWS access keys', () => {
      const msg = 'AWS error with AKIA1234567890ABCDEF';
      const result = sanitizeError(msg);
      expect(result).not.toContain('AKIA1234567890ABCDEF');
      expect(result).toContain('[REDACTED_KEY]');
    });

    it('should redact JWT tokens', () => {
      const msg = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = sanitizeError(msg);
      expect(result).toContain('[REDACTED_JWT]');
      expect(result).not.toMatch(/eyJ/);
    });

    it('should redact connection strings', () => {
      const msg = 'Cannot connect to postgres://user:pass@localhost:5432/db';
      const result = sanitizeError(msg);
      expect(result).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('should redact password=value patterns', () => {
      const msg = 'Config error: password=mySecretPassword123';
      const result = sanitizeError(msg);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('mySecretPassword123');
    });

    it('should redact token=value patterns', () => {
      const msg = 'Auth: token=abcdefgh12345678';
      const result = sanitizeError(msg);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('does not leak file paths', () => {
    it('should redact /home/ paths', () => {
      const msg = 'Error at /home/ubuntu/project/src/file.ts:42';
      const result = sanitizeError(msg);
      expect(result).not.toContain('/home/ubuntu');
      expect(result).toContain('/home/[USER]');
    });

    it('should redact /Users/ paths', () => {
      const msg = 'Failed at /Users/john/project/index.js:10';
      const result = sanitizeError(msg);
      expect(result).not.toContain('/Users/john');
      expect(result).toContain('/Users/[USER]');
    });
  });

  describe('does not leak internal IPs', () => {
    it('should redact 10.x.x.x', () => {
      const msg = 'Connection to 10.0.1.50 refused';
      const result = sanitizeError(msg);
      expect(result).toContain('[INTERNAL_IP]');
      expect(result).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    });

    it('should redact 192.168.x.x', () => {
      const msg = 'Timeout connecting to 192.168.1.100:8080';
      const result = sanitizeError(msg);
      expect(result).toContain('[INTERNAL_IP]');
    });

    it('should redact 172.16-31.x.x', () => {
      const msg = 'Error from 172.20.0.5';
      const result = sanitizeError(msg);
      expect(result).toContain('[INTERNAL_IP]');
    });
  });

  describe('handles various input types', () => {
    it('should handle Error objects', () => {
      const error = new Error('Something went wrong');
      expect(sanitizeError(error)).toBe('Something went wrong');
    });

    it('should handle string input', () => {
      expect(sanitizeError('A string error')).toBe('A string error');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeError(null)).toBe('An unexpected error occurred');
      expect(sanitizeError(undefined)).toBe('An unexpected error occurred');
    });

    it('should handle objects without message', () => {
      expect(sanitizeError({})).toBe('An unexpected error occurred');
    });

    it('should handle Error with empty message', () => {
      const error = new Error('');
      expect(sanitizeError(error)).toBe('An unexpected error occurred');
    });
  });

  describe('truncation', () => {
    it('should truncate messages longer than 500 chars', () => {
      const longMsg = 'x'.repeat(600);
      const result = sanitizeError(longMsg);
      expect(result.length).toBeLessThanOrEqual(515);
      expect(result).toContain('...[truncated]');
    });

    it('should not truncate short messages', () => {
      const msg = 'Short error';
      expect(sanitizeError(msg)).toBe('Short error');
    });
  });

  describe('returns generic message when empty', () => {
    it('should return default message if redaction leaves empty', () => {
      const msg = 'sk-abcdefghijklmnopqrstuvwxyz123';
      const result = sanitizeError(msg);
      expect(result).toBe('[REDACTED_KEY]');
    });
  });
});

describe('formatApiError', () => {
  it('should return sanitized error with status code', () => {
    const error = new Error('Not found');
    const result = formatApiError(error);
    expect(result.status).toBe(404);
    expect(result.error).toBe('Not found');
  });

  it('should return 401 for unauthorized errors', () => {
    expect(formatApiError(new Error('Unauthorized access')).status).toBe(401);
    expect(formatApiError(new Error('No api key provided')).status).toBe(401);
  });

  it('should return 403 for forbidden/permission errors', () => {
    expect(formatApiError(new Error('Forbidden')).status).toBe(403);
    expect(formatApiError(new Error('Permission denied')).status).toBe(403);
  });

  it('should return 413 for too large errors', () => {
    expect(formatApiError(new Error('Payload too large')).status).toBe(413);
  });

  it('should return 429 for rate limit errors', () => {
    expect(formatApiError(new Error('Rate limit exceeded')).status).toBe(429);
  });

  it('should return 400 for invalid/validation errors', () => {
    expect(formatApiError(new Error('Invalid input')).status).toBe(400);
    expect(formatApiError(new Error('Validation failed')).status).toBe(400);
  });

  it('should return 500 for generic errors', () => {
    expect(formatApiError(new Error('Unknown error')).status).toBe(500);
  });

  it('should sanitize sensitive data in formatted error', () => {
    const error = new Error(
      'Failed with sk-abcdefghijklmnopqrstuvwxyz12 at /home/ubuntu/src'
    );
    const result = formatApiError(error);
    expect(result.error).not.toContain('sk-');
    expect(result.error).not.toContain('/home/ubuntu');
    expect(result.error).toContain('[REDACTED_KEY]');
  });

  it('should handle string (non-Error) input', () => {
    const result = formatApiError('Just a string error');
    expect(result.status).toBe(500);
  });

  it('should include context in log', () => {
    const result = formatApiError(new Error('Test'), 'route-name');
    expect(result.error).toBeDefined();
  });
});