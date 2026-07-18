import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import crypto from 'crypto';

export const apiKeyRoutes = new Hono();

// Simple encryption for API keys (in production, use a proper key management service)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Store API key
apiKeyRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { provider, apiKey, name } = await c.req.json();

  if (!provider || !apiKey) {
    return c.json({ error: 'Provider and API key are required' }, 400);
  }

  const id = crypto.randomUUID();
  const encryptedKey = encrypt(apiKey);

  const db = getDb();
  db.prepare(`
    INSERT INTO api_keys (id, user_id, provider, name, encrypted_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, user.id, provider, name || provider, encryptedKey);

  return c.json({ id, provider, name: name || provider });
});

// List API keys (masked)
apiKeyRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const keys = db.prepare(`
    SELECT id, provider, name, created_at
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id);

  return c.json({ keys });
});

// Get decrypted API key (for internal use)
apiKeyRoutes.get('/:id/decrypt', async (c) => {
  const user = c.get('user');
  const keyId = c.req.param('id');
  const db = getDb();

  const key = db.prepare(`
    SELECT * FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, user.id) as any;

  if (!key) return c.json({ error: 'Key not found' }, 404);

  const decryptedKey = decrypt(key.encrypted_key);
  return c.json({ provider: key.provider, apiKey: decryptedKey });
});

// Delete API key
apiKeyRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const keyId = c.req.param('id');
  const db = getDb();

  db.prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`).run(keyId, user.id);
  return c.json({ success: true });
});

// Validate API key
apiKeyRoutes.post('/validate', async (c) => {
  const { provider, apiKey } = await c.req.json();

  try {
    // Simple validation by making a test request
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      return c.json({ valid: res.ok });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return c.json({ valid: res.ok });
    }

    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      return c.json({ valid: res.ok });
    }

    return c.json({ error: 'Unknown provider' }, 400);
  } catch (err) {
    return c.json({ valid: false, error: 'Validation failed' });
  }
});
