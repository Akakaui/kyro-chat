import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import crypto from 'crypto';
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js';
import { ALL_PROVIDERS, getProviderInfo } from '../agent/providers.js';

export const keysRoutes = new Hono();

// ── Provider detection from key prefix ──
function detectProvider(key: string): string {
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('fw_')) return 'fireworks';
  if (key.startsWith('sk-')) return 'openai';
  return 'unknown';
}

// ── Mask a key for safe display ──
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

// ── Validate key against any OpenAI-compatible endpoint ──
async function validateKey(provider: string, apiKey: string, baseURL?: string): Promise<boolean> {
  const info = getProviderInfo(provider);

  // Native providers: use their specific validation
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  }

  if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    return res.ok;
  }

  // Everything else: OpenAI-compatible /v1/models endpoint
  const url = (baseURL || info?.baseURL || 'https://api.openai.com/v1') + '/models';
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── POST /keys — Add a BYOK API key ──
keysRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const rawKey = body.key || body.apiKey;
  const name = body.name;
  const baseURL = body.base_url || body.baseURL || undefined;
  const customModel = body.model || body.custom_model || undefined;

  // Allow user to override provider detection
  let provider = body.provider;

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return c.json({ error: 'API key is required' }, 400);
  }

  const trimmedKey = rawKey.trim();

  // Auto-detect provider if not specified
  if (!provider || provider === 'unknown') {
    provider = detectProvider(trimmedKey);
  }

  // If still unknown and baseURL provided, mark as 'custom'
  if (provider === 'unknown') {
    provider = 'custom';
  }

  const id = crypto.randomUUID();

  let encryptedKey: string;
  try {
    encryptedKey = await encryptApiKey(trimmedKey);
  } catch (err: any) {
    return c.json({ error: 'Failed to encrypt key: ' + err.message }, 500);
  }

  const db = getDb();
  await db.prepare(`
    INSERT INTO api_keys (id, user_id, provider, name, encrypted_key, base_url, custom_model, is_valid)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, user.id, provider, name || provider, encryptedKey, baseURL || null, customModel || null);

  return c.json({
    id,
    provider,
    name: name || provider,
    baseURL: baseURL || null,
    model: customModel || null,
    maskedKey: maskKey(trimmedKey),
    isValid: true,
  }, 201);
});

// ── GET /keys — List user's API keys (masked) ──
keysRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const rows = await db.prepare(`
    SELECT id, provider, name, encrypted_key, base_url, custom_model, is_valid, created_at, last_used_at
    FROM api_keys WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(user.id) as any[];

  const keys = rows.map((r) => {
    let maskedKey = '****';
    try {
      maskedKey = `sk-...${r.id.slice(-4)}`;
    } catch { /* keep masked */ }

    const info = getProviderInfo(r.provider);

    return {
      id: r.id,
      provider: r.provider,
      name: r.name,
      baseURL: r.base_url,
      model: r.custom_model,
      maskedKey,
      isValid: !!r.is_valid,
      isNative: info?.native ?? false,
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
    SELECT id, provider, encrypted_key, base_url FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, user.id) as any;
  if (!row) return c.json({ error: 'Key not found' }, 404);

  let apiKey: string;
  try {
    apiKey = await decryptApiKey(row.encrypted_key);
  } catch {
    return c.json({ valid: false, error: 'Failed to decrypt key' }, 500);
  }

  const valid = await validateKey(row.provider, apiKey, row.base_url);

  await db.prepare(`
    UPDATE api_keys SET is_valid = ?, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = ?
  `).run(valid ? 1 : 0, keyId);

  return c.json({ valid });
});

// ── GET /providers — List all supported providers ──
keysRoutes.get('/providers', async (c) => {
  return c.json({
    providers: ALL_PROVIDERS.map(p => ({
      id: p.id,
      name: p.name,
      baseURL: p.baseURL,
      keyPrefix: p.keyPrefix,
      keyPlaceholder: p.keyPlaceholder,
      models: p.models,
      native: p.native,
    })),
  });
});

// ── POST /validate — Standalone key validation (any provider) ──
keysRoutes.post('/validate', async (c) => {
  const { provider, apiKey, base_url } = await c.req.json();

  if (!provider || !apiKey) {
    return c.json({ error: 'provider and apiKey are required' }, 400);
  }

  const valid = await validateKey(provider, apiKey, base_url);
  return c.json({ valid });
});
