import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock 'dns' by providing both the named exports AND a default export
// since validateUrl uses `await import('dns')` for `lookup` and `promises`.
const mockResolve4 = vi.fn();
const mockResolve6 = vi.fn();
const mockLookup = vi.fn();

vi.mock('dns', () => ({
  default: {
    promises: {
      resolve4: mockResolve4,
      resolve6: mockResolve6,
    },
    lookup: mockLookup,
  },
  promises: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
  lookup: mockLookup,
  resolve4: mockResolve4,
  resolve6: mockResolve6,
  isIPv4: vi.fn((ip: string) => {
    // Use the real net.isIPv4 logic
    const parts = ip.split('.');
    return parts.length === 4 && parts.every((p: string) => {
      const n = Number(p);
      return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
    });
  }),
  isIPv6: vi.fn((ip: string) => {
    // Simple heuristic: contains ':'
    return ip.includes(':');
  }),
}));

import { validateUrl } from '../lib/validate-url.js';

/**
 * Helper: set DNS resolution to return specific IPs
 */
function mockDns(ips: { v4?: string[]; v6?: string[] }) {
  mockResolve4.mockResolvedValue(ips.v4 || []);
  mockResolve6.mockResolvedValue(ips.v6 || []);
}

function mockDnsReject() {
  mockResolve4.mockRejectedValue(new Error('DNS error'));
  mockResolve6.mockRejectedValue(new Error('DNS error'));
}

describe('validateUrl (SSRF protection)', () => {
  beforeEach(() => {
    mockDns({ v4: ['93.184.216.34'] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('valid public URLs', () => {
    it('should allow https://example.com', async () => {
      mockDns({ v4: ['93.184.216.34'] });
      const result = await validateUrl('https://example.com');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.url.hostname).toBe('example.com');
      }
    });

    it('should allow https://google.com', async () => {
      mockDns({ v4: ['142.250.80.46'] });
      const result = await validateUrl('https://google.com');
      expect(result.valid).toBe(true);
    });

    it('should allow URLs with paths and query params', async () => {
      mockDns({ v4: ['93.184.216.34'] });
      const result = await validateUrl('https://example.com/path?foo=bar&baz=1');
      expect(result.valid).toBe(true);
    });
  });

  describe('blocked hostnames', () => {
    const blockedHosts = [
      'localhost',
      'http://127.0.0.1:8080/test',
      'http://0.0.0.0',
      'http://[::1]:3000',
      'http://metadata.google.internal',
      'http://instance-data',
    ];

    for (const host of blockedHosts) {
      it(`should block "${host}"`, async () => {
        let urlToTest = host;
        if (!host.includes('://')) {
          urlToTest = `http://${host}`;
        }
        const result = await validateUrl(urlToTest);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.reason).toMatch(/blocked|Hostname|Invalid/i);
        }
      });
    }
  });

  describe('blocked IP ranges', () => {
    const blockedIps = [
      { ip: '127.0.0.1', label: 'loopback' },
      { ip: '10.0.0.50', label: 'private 10.x' },
      { ip: '192.168.1.1', label: 'private 192.168.x' },
      { ip: '172.16.0.1', label: 'private 172.16.x' },
      { ip: '169.254.169.254', label: 'cloud metadata' },
      { ip: '169.254.1.1', label: 'link-local 169.254.x' },
    ];

    for (const { ip, label } of blockedIps) {
      it(`should block ${label} (${ip})`, async () => {
        // Use a hostname that resolves to the blocked IP
        mockDns({ v4: [ip] });
        const result = await validateUrl(`http://internal-service.example.com`);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.reason).toMatch(/blocked/i);
        }
      });
    }
  });

  describe('protocol validation', () => {
    it('should block ftp:// URLs', async () => {
      const result = await validateUrl('ftp://example.com/file');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('Protocol');
    });

    it('should block file:// URLs', async () => {
      const result = await validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('Protocol');
    });

    it('should block javascript: URLs', async () => {
      const result = await validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
    });
  });

  describe('invalid URL format', () => {
    it('should reject malformed URLs', async () => {
      const result = await validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe('Invalid URL format');
    });

    it('should reject empty string', async () => {
      const result = await validateUrl('');
      expect(result.valid).toBe(false);
    });
  });

  describe('DNS resolution failures', () => {
    it('should block when DNS resolution returns no IPs', async () => {
      mockDnsReject();
      const result = await validateUrl('http://nonexistent.internal');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Promise.allSettled catches rejections -> empty array -> "No IP addresses"
        expect(result.reason).toMatch(/No IP|resolve/i);
      }
    });

    it('should block when no IPs are returned', async () => {
      mockDns({ v4: [], v6: [] });
      const result = await validateUrl('http://nodns.example');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toMatch(/No IP/i);
    });
  });
});