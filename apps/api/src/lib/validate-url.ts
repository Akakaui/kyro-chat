import { isIPv4, isIPv6 } from 'net';

/**
 * Blocklist of private/reserved IP ranges for SSRF protection.
 * Covers RFC 1918, loopback, link-local, carrier-grade NAT, and cloud metadata.
 */
const BLOCKED_RANGES: Array<{ start: string; end: string }> = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private (RFC 1918)
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // Carrier-grade NAT
  { start: '100.64.0.0', end: '100.127.255.255' },
  // Cloud metadata (AWS, GCP, Azure)
  { start: '169.254.169.254', end: '169.254.169.254' },
  // Reserved
  { start: '0.0.0.0', end: '0.255.255.255' },
  { start: '192.0.0.0', end: '192.0.0.255' },
  { start: '192.0.2.0', end: '192.0.2.255' },
  { start: '198.18.0.0', end: '198.19.255.255' },
  { start: '203.0.113.0', end: '203.0.113.255' },
  { start: '240.0.0.0', end: '255.255.255.255' },
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'metadata.google.internal',
  'instance-data',
  '[::1]',
]);

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isIpBlocked(ip: string): boolean {
  // IPv6 loopback and private
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::' || lower.startsWith('fc') ||
        lower.startsWith('fd') || lower.startsWith('fe80') || lower === 'ff00::') {
      return true;
    }
    // Map IPv4-mapped IPv6
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isIpBlocked(mapped[1]);
    return false;
  }

  if (!isIPv4(ip)) return true; // Unknown format = block

  const ipLong = ipToLong(ip);
  for (const range of BLOCKED_RANGES) {
    if (ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a URL is safe to fetch (SSRF protection).
 * Blocks private IPs, localhost, cloud metadata, etc.
 * Returns { valid: true, url } or { valid: false, reason }.
 */
export async function validateUrl(
  urlStr: string,
  opts: { allowedSchemes?: string[]; maxRedirects?: number } = {}
): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
  const { allowedSchemes = ['http:', 'https:'], maxRedirects = 3 } = opts;

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // Check scheme
  if (!allowedSchemes.includes(url.protocol)) {
    return { valid: false, reason: `Protocol ${url.protocol} not allowed` };
  }

  // Check blocked hostnames
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: `Hostname "${hostname}" is blocked` };
  }

  // Resolve hostname and check IP
  const { lookup } = await import('dns');
  const { resolve4, resolve6 } = await import('dns').then(m => ({
    resolve4: m.promises.resolve4,
    resolve6: m.promises.resolve6,
  }));

  let ips: string[];
  try {
    const [v4, v6] = await Promise.allSettled([
      resolve4(hostname),
      resolve6(hostname),
    ]);
    ips = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
  } catch {
    return { valid: false, reason: `Could not resolve hostname "${hostname}"` };
  }

  if (ips.length === 0) {
    return { valid: false, reason: `No IP addresses found for "${hostname}"` };
  }

  for (const ip of ips) {
    if (isIpBlocked(ip)) {
      return { valid: false, reason: `IP ${ip} is in a blocked range` };
    }
  }

  return { valid: true, url };
}
