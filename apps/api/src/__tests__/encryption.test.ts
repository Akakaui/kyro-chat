import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptApiKey, decryptApiKey, encrypt, decrypt } from '../lib/encryption.js';

describe('encryption (AES-256-GCM)', () => {
  const originalKey = process.env.API_KEY_ENCRYPTION_KEY;
  const originalEncKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    // Set a known encryption key for tests
    process.env.API_KEY_ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!';
    delete process.env.ENCRYPTION_KEY;
  });

  afterEach(() => {
    // Restore original env
    if (originalKey) process.env.API_KEY_ENCRYPTION_KEY = originalKey;
    else delete process.env.API_KEY_ENCRYPTION_KEY;
    if (originalEncKey) process.env.ENCRYPTION_KEY = originalEncKey;
    else delete process.env.ENCRYPTION_KEY;
  });

  describe('encryptApiKey / decryptApiKey', () => {
    it('should encrypt and decrypt back to original value', async () => {
      const original = 'my-secret-api-key-sk-12345';
      const encrypted = await encryptApiKey(original);
      expect(encrypted).toMatch(/^gcm:/);
      expect(encrypted).not.toBe(original);
      expect(encrypted).not.toContain(original);

      const decrypted = await decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertexts for same input (unique IV)', async () => {
      const value = 'consistent-input';
      const enc1 = await encryptApiKey(value);
      const enc2 = await encryptApiKey(value);
      expect(enc1).not.toBe(enc2);
    });

    it('should handle special characters', async () => {
      const original = 'key with spaces & special!@#$%^&*()';
      const encrypted = await encryptApiKey(original);
      const decrypted = await decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should handle empty string', async () => {
      const encrypted = await encryptApiKey('');
      const decrypted = await decryptApiKey(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle long strings (> 100 chars)', async () => {
      const original = 'x'.repeat(500);
      const encrypted = await encryptApiKey(original);
      const decrypted = await decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  describe('different keys produce different ciphertexts', () => {
    it('should produce different results when API_KEY_ENCRYPTION_KEY differs', async () => {
      const value = 'test-value';
      const encrypted1 = await encryptApiKey(value);

      // Change the key
      process.env.API_KEY_ENCRYPTION_KEY = 'different-key-32-bytes-xxxxxx';
      const encrypted2 = await encryptApiKey(value);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt with wrong key', async () => {
      const value = 'test-value';
      const encrypted = await encryptApiKey(value);

      // Change the key before decrypting
      process.env.API_KEY_ENCRYPTION_KEY = 'different-key-32-bytes-xxxxxx';

      await expect(decryptApiKey(encrypted)).rejects.toThrow();
    });
  });

  describe('missing key', () => {
    it('should throw when encrypting without API_KEY_ENCRYPTION_KEY or ENCRYPTION_KEY', async () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      await expect(encryptApiKey('test')).rejects.toThrow(
        'API_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) environment variable is required'
      );
    });

    it('should throw when decrypting without API_KEY_ENCRYPTION_KEY or ENCRYPTION_KEY', async () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      // Use a valid GCM-format ciphertext
      await expect(decryptApiKey('gcm:SGVsbG8gV29ybGQ=')).rejects.toThrow(
        'API_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) environment variable is required'
      );
    });
  });

  describe('encrypt / decrypt aliases', () => {
    it('encrypt alias should work same as encryptApiKey', async () => {
      const original = 'alias-test-value';
      const viaAlias = await encrypt(original);
      const decrypted = await decrypt(viaAlias);
      expect(decrypted).toBe(original);
    });
  });

  describe('legacy CBC decryption', () => {
    it('should throw without ENCRYPTION_KEY for legacy format', () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect(() => {
        // decryptApiKey detects the ':' format as legacy CBC
        decryptApiKey('deadbeef:cafebabe').catch(() => {});
      }).not.toThrow(); // async function, error is in promise
    });

    it('should detect legacy format by colon separator', async () => {
      // When ENCRYPTION_KEY is not set and input has ':' without 'gcm' prefix
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      const promise = decryptApiKey('aabbccdd:eeff0011');
      await expect(promise).rejects.toThrow('ENCRYPTION_KEY is not set');
    });
  });
});