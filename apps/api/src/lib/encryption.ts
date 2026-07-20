/**
 * Shared encryption utilities for API keys, MCP tokens, and other secrets.
 * Primary: AES-256-GCM via Web Crypto API.
 * Legacy: AES-256-CBC via Node crypto (for migrating existing apikeys.ts data).
 *
 * WARNING: The CBC path (decryptCbcLegacy) is legacy-only. It exists solely to
 * decrypt data that was encrypted before the migration to GCM. All new encryptions
 * use GCM. The CBC path should be removed once all legacy ciphertexts have been
 * re-encrypted. See H3 audit note.
 */

import crypto from 'crypto';

// ── Key Resolution ──────────────────────────────────────────────
// Accepts either API_KEY_ENCRYPTION_KEY (GCM) or ENCRYPTION_KEY (CBC legacy).
function getKeyFromEnv(): string | undefined {
  return process.env.API_KEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
}

// ── Startup validation ──────────────────────────────────────────
// In production, reject encryption keys that are too short to derive a
// proper 256-bit key without destructive padding.
if (process.env.NODE_ENV === 'production') {
  const envKey = process.env.API_KEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length < 32) {
    console.error(
      '[SECURITY] API_KEY_ENCRYPTION_KEY / ENCRYPTION_KEY must be at least 32 characters in production. ' +
      'Current length: ' + envKey.length
    );
    process.exit(1);
  }
}

// ── H4: PBKDF2 key derivation (replaces zero-padding) ──────────
const PBKDF2_SALT = 'kyro-chat-encryption-salt-v1';
const PBKDF2_ITERATIONS = 100_000;

function deriveKey(envKey: string): Buffer {
  return crypto.pbkdf2Sync(envKey, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
}

// ── AES-256-GCM (preferred) ─────────────────────────────────────

async function encryptApiKey(key: string): Promise<string> {
  const cryptoKeyEnv = process.env.API_KEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!cryptoKeyEnv) {
    throw new Error(
      'API_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) environment variable is required for encryption'
    );
  }
  // H4: Use PBKDF2-derived key instead of zero-padded env string
  const derivedKeyBuffer = deriveKey(cryptoKeyEnv);
  const keyData = new Uint8Array(derivedKeyBuffer);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoSubtle = globalThis.crypto.subtle;
  const cryptoKeyObj = await cryptoSubtle.importKey(
    'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const encrypted = await cryptoSubtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKeyObj,
    new TextEncoder().encode(key)
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const ivBytes = new Uint8Array(iv);
  const result = new Uint8Array(ivBytes.length + encryptedBytes.length);
  result.set(ivBytes, 0);
  result.set(encryptedBytes, ivBytes.length);
  return 'gcm:' + btoa(String.fromCharCode(...result));
}

async function decryptApiKey(encrypted: string): Promise<string> {
  // Detect format: 'gcm:' prefix = new GCM format, 'hex:hex' = legacy CBC
  if (encrypted.startsWith('gcm:')) {
    return decryptGcm(encrypted.slice(4));
  }
  if (encrypted.includes(':') && !encrypted.startsWith('gcm:')) {
    return decryptCbcLegacy(encrypted);
  }
  // Assume GCM for bare base64
  return decryptGcm(encrypted);
}

async function decryptGcm(encrypted: string): Promise<string> {
  const cryptoKeyEnv = process.env.API_KEY_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!cryptoKeyEnv) {
    throw new Error(
      'API_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) environment variable is required for decryption'
    );
  }
  const decoder = new TextDecoder();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  // H4: Use PBKDF2-derived key instead of zero-padded env string
  const derivedKeyBuffer = deriveKey(cryptoKeyEnv);
  const keyData = new Uint8Array(derivedKeyBuffer);
  const cryptoSubtle = globalThis.crypto.subtle;
  const cryptoKeyObj = await cryptoSubtle.importKey(
    'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const decrypted = await cryptoSubtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKeyObj,
    data
  );
  return decoder.decode(decrypted);
}

// ── AES-256-CBC Legacy (for decrypting existing apikeys.ts data) ──

function decryptCbcLegacy(encrypted: string): string {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set. Cannot decrypt legacy CBC-encrypted data.');
  }
  const [ivHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// ── Aliases for backward compatibility ──────────────────────────

const encrypt = encryptApiKey;
const decrypt = decryptApiKey;

export { encryptApiKey, decryptApiKey, encrypt, decrypt };
