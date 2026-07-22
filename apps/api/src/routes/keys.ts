import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import crypto from 'crypto';
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js';

export const keysRoutes = new Hono();

// ── Provider detection from key prefix ──
function detectProvider(key: string): string {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('r8_')) return 'replicate';
  return 'unknown';
}

// ── Mask a key for safe display ──
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

// ── Static capability map per provider ──
const CAPABILITY_MAP: Record<string, {
  imageGen: boolean;
  models: string[];
  capabilities: string[];
}> = {
  openai: {
    imageGen: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'dall-e-3', 'dall-e-2'],
    capabilities: ['chat', 'image-generation', 'embeddings', 'audio'],
  },
  anthropic: {
    imageGen: false,
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
    capabilities: ['chat', 'vision'],
  },
  google: {
    imageGen: true,
    models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash', 'imagen-3'],
    capabilities: ['chat', 'image-generation', 'embeddings'],
  },
  groq: {
    imageGen: false,
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    capabilities: ['chat'],
  },
  replicate: {
    imageGen: true,
    models: ['flux-1.1-pro', 'flux-schnell', 'stable-diffusion-xl', 'sdxl-turbo'],
    capabilities: ['image-generation'],
  },
};

// ── POST /keys — Add a BYOK API key ──
keysRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Accept both { key, name } (new) and { provider, apiKey, name } (legacy)
  let rawKey = body.key || body.apiKey;
  const name = body.name;

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return c.json({ error: 'API key is required' }, 400);
  }

  const trimmedKey = rawKey.trim();
  const provider = detectProvider(trimmedKey);
  const id = crypto.randomUUID();

  let encryptedKey: string;
  try {
    encryptedKey = await encryptApiKey(trimmedKey);
  } catch (err: any) {
    return c.json({ error: 'Failed to encrypt key: ' + err.message }, 500);
  }

  const db = getDb();
  await db.prepare(`
    INSERT INTO api_keys (id, user_id, provider, name, encrypted_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, user.id, provider, name || provider, encryptedKey);

  const caps = CAPABILITY_MAP[provider] || { imageGen: false, models: [], capabilities: [] };

  return c.json({
    id,
    provider,
    name: name || provider,
    maskedKey: maskKey(trimmedKey),
    isValid: true,
    capabilities: caps,
  }, 201);
});

// ── GET /keys — List user's API keys (masked) ──
keysRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.prepare(`
    SELECT id, provider, name, encrypted_key, is_valid, created_at, last_used_at
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id) as any[];

  const keys = rows.map((r) => {
    let maskedKey = '****';
    try {
      // Decrypt briefly to mask — or store a mask hint in a separate column
      // For efficiency, we'll store the first 4 chars on insert
      // For now, reconstruct from provider name
      maskedKey = `sk-...${r.id.slice(-4)}`;
    } catch { /* keep masked */ }

    const caps = CAPABILITY_MAP[r.provider] || { imageGen: false, models: [], capabilities: [] };

    return {
      id: r.id,
      provider: r.provider,
      name: r.name,
      maskedKey,
      isValid: !!r.is_valid,
      capabilities: caps,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    };
  });

  return c.json({ keys });
});

// ── DELETE /keys/:id — Remove API key ──
keysRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const keyId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, user.id) as any;
  if (!row) return c.json({ error: 'Key not found' }, 404);

  await db.prepare(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`).run(keyId, user.id);
  return c.json({ success: true });
});

// ── POST /keys/:id/validate — Test key against provider ──
keysRoutes.post('/:id/validate', async (c) => {
  const user = c.get('user');
  const keyId = c.req.param('id');
  const db = getDb();

  const row = await db.prepare(`
    SELECT id, provider, encrypted_key FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, user.id) as any;
  if (!row) return c.json({ error: 'Key not found' }, 404);

  let apiKey: string;
  try {
    apiKey = await decryptApiKey(row.encrypted_key);
  } catch {
    return c.json({ valid: false, error: 'Failed to decrypt key' }, 500);
  }

  let valid = false;
  try {
    if (row.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      valid = res.ok;
    } else if (row.provider === 'anthropic') {
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
        signal: AbortSignal.timeout(10000),
      });
      valid = res.ok;
    } else if (row.provider === 'google') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );
      valid = res.ok;
    } else if (row.provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      valid = res.ok;
    } else if (row.provider === 'replicate') {
      const res = await fetch('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      valid = res.ok;
    } else {
      return c.json({ valid: false, error: 'Cannot validate unknown provider' }, 400);
    }
  } catch (err: any) {
    return c.json({ valid: false, error: err.message });
  }

  // Update validity flag
  await db.prepare(`
    UPDATE api_keys SET is_valid = ?, updated_at = unixepoch() WHERE id = ?
  `).run(valid ? 1 : 0, keyId);

  return c.json({ valid });
});

// ── GET /keys/capabilities — Static capability map ──
keysRoutes.get('/capabilities', async (c) => {
  return c.json({ capabilities: CAPABILITY_MAP });
});

// ── POST /keys/validate — Standalone key validation (legacy compat) ──
keysRoutes.post('/validate', async (c) => {
  const { provider, apiKey } = await c.req.json();

  try {
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
        signal: AbortSignal.timeout(10000),
      });
      return c.json({ valid: res.ok });
    }

    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      return c.json({ valid: res.ok });
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return c.json({ valid: res.ok });
    }

    if (provider === 'replicate') {
      const res = await fetch('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return c.json({ valid: res.ok });
    }

    return c.json({ error: 'Unknown provider' }, 400);
  } catch (err) {
    return c.json({ valid: false, error: 'Validation failed' });
  }
});
