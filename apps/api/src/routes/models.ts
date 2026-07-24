import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import crypto from 'crypto';
import { modelLimit } from '../middleware/rateLimit.js';
import { ALL_PROVIDERS, getProviderInfo } from '../agent/providers.js';

export const modelRoutes = new Hono();

// Apply model-tier rate limit to all model/usage routes
modelRoutes.use('*', modelLimit);

// Built-in model definitions with usage limits per 4-hour window
const BUILTIN_MODELS = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', limit: 100000, tier: 'pro' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', limit: 500000, tier: 'fast' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', limit: 80000, tier: 'pro' },
  // Anthropic
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', limit: 150000, tier: 'pro' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', limit: 150000, tier: 'pro' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', limit: 400000, tier: 'fast' },
  // Google
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', limit: 500000, tier: 'fast' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', limit: 100000, tier: 'pro' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', limit: 500000, tier: 'fast' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'google', limit: 1000000, tier: 'fast' },
];

const WINDOW_DURATION = 4 * 60 * 60; // 4 hours in seconds

function getWindowStart(): number {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % WINDOW_DURATION);
}

function getWindowEnd(): number {
  return getWindowStart() + WINDOW_DURATION;
}

function getTimeUntilRefill(): number {
  return getWindowEnd() - Math.floor(Date.now() / 1000);
}

// Get all available models with user's usage status
modelRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = getDb();
  const windowStart = getWindowStart();

  // Get user's API keys (includes BYOK custom keys)
  const apiKeys = await db.prepare(`
    SELECT provider, encrypted_key, base_url, custom_model FROM api_keys WHERE user_id = ?
  `).all(user.id) as Array<{ provider: string; encrypted_key: string; base_url: string | null; custom_model: string | null }>;

  const availableProviders = new Set(apiKeys.map(k => k.provider));

  // Also check env for system-provided keys
  if (process.env.OPENAI_API_KEY) availableProviders.add('openai');
  if (process.env.ANTHROPIC_API_KEY) availableProviders.add('anthropic');
  if (process.env.GOOGLE_AI_API_KEY) availableProviders.add('google');

  // Get usage for current window
  const usage = await db.prepare(`
    SELECT model_id, tokens_used FROM model_usage
    WHERE user_id = ? AND window_start = ?
  `).all(user.id, windowStart) as Array<{ model_id: string; tokens_used: number }>;

  const usageMap = new Map(usage.map(u => [u.model_id, u.tokens_used]));

  // Build built-in models list
  const models = BUILTIN_MODELS.map(model => {
    const hasKey = availableProviders.has(model.provider);
    const used = usageMap.get(model.id) || 0;
    const remaining = Math.max(0, model.limit - used);
    const percentUsed = Math.min(100, Math.round((used / model.limit) * 100));

    return {
      ...model,
      builtin: true,
      available: hasKey,
      usage: {
        used,
        limit: model.limit,
        remaining,
        percentUsed,
        exhausted: remaining <= 0,
      },
    };
  });

  // Build BYOK models from user's custom keys
  const byokModels: Array<typeof models[number] & { baseURL?: string }> = [];
  for (const key of apiKeys) {
    if (key.custom_model) {
      const info = getProviderInfo(key.provider);
      const modelId = `${key.provider}/${key.custom_model}`;
      const used = usageMap.get(modelId) || 0;
      const limit = 500000; // Default BYOK limit
      const remaining = Math.max(0, limit - used);

      byokModels.push({
        id: modelId,
        name: key.custom_model,
        provider: key.provider,
        limit,
        tier: 'byok',
        builtin: false,
        available: true,
        baseURL: key.base_url || undefined,
        usage: {
          used,
          limit,
          remaining,
          percentUsed: Math.min(100, Math.round((used / limit) * 100)),
          exhausted: remaining <= 0,
        },
      });
    }
  }

  return c.json({
    models: [...models, ...byokModels],
    providers: ALL_PROVIDERS.map(p => ({
      id: p.id,
      name: p.name,
      native: p.native,
      models: p.models,
    })),
    window: {
      start: getWindowStart(),
      end: getWindowEnd(),
      secondsUntilRefill: getTimeUntilRefill(),
    },
  });
});

// ── POST /models/custom — Add a custom model for a BYOK key ──
modelRoutes.post('/custom', async (c) => {
  const user = c.get('user');
  const { keyId, modelId, modelName } = await c.req.json();

  if (!keyId || !modelId) {
    return c.json({ error: 'keyId and modelId are required' }, 400);
  }

  const db = getDb();

  // Verify key belongs to user
  const key = await db.prepare(`
    SELECT id, provider FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, user.id) as any;
  if (!key) return c.json({ error: 'Key not found' }, 404);

  // Update the key with the custom model
  await db.prepare(`
    UPDATE api_keys SET custom_model = ?, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = ?
  `).run(modelId, keyId);

  return c.json({
    success: true,
    model: {
      id: `${key.provider}/${modelId}`,
      name: modelName || modelId,
      provider: key.provider,
    },
  });
});

// Record token usage after a message
modelRoutes.post('/usage', async (c) => {
  const user = c.get('user');
  const { modelId, provider, tokensUsed } = await c.req.json();

  if (
    typeof tokensUsed !== 'number' ||
    !Number.isInteger(tokensUsed) ||
    tokensUsed < 0 ||
    tokensUsed > 100_000
  ) {
    return c.json({
      error: 'Invalid tokensUsed: must be a non-negative integer between 0 and 100,000',
    }, 400);
  }

  const db = getDb();
  const windowStart = getWindowStart();
  const windowEnd = getWindowEnd();
  const id = crypto.randomUUID();

  const existing = await db.prepare(`
    SELECT id, tokens_used FROM model_usage
    WHERE user_id = ? AND model_id = ? AND window_start = ?
  `).get(user.id, modelId, windowStart) as { id: string; tokens_used: number } | undefined;

  const modelDef = BUILTIN_MODELS.find(m => m.id === modelId);
  const limit = modelDef?.limit || 500000;

  if (existing) {
    await db.prepare(`
      UPDATE model_usage SET tokens_used = ? WHERE id = ?
    `).run(existing.tokens_used + tokensUsed, existing.id);
  } else {
    await db.prepare(`
      INSERT INTO model_usage (id, user_id, model_id, provider, tokens_used, tokens_limit, window_start, window_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, modelId, provider, tokensUsed, limit, windowStart, windowEnd);
  }

  return c.json({ success: true });
});

// Check if a model is available for use
modelRoutes.get('/:modelId/check', async (c) => {
  const user = c.get('user');
  const modelId = c.req.param('modelId');
  const db = getDb();
  const windowStart = getWindowStart();

  // Check built-in models
  const model = BUILTIN_MODELS.find(m => m.id === modelId);

  // Check BYOK models (format: provider/modelId)
  const [byokProvider, ...byokModelParts] = modelId.split('/');
  const byokModelId = byokModelParts.join('/');

  let hasKey = false;
  let limit = 500000;

  if (model) {
    // Built-in model
    const apiKey = await db.prepare(`
      SELECT api_key FROM api_keys WHERE user_id = ? AND provider = ?
    `).get(user.id, model.provider) as { api_key: string } | undefined;
    hasKey = !!apiKey || !!process.env[`${model.provider.toUpperCase()}_API_KEY`];
    limit = model.limit;
  } else if (byokProvider && byokModelId) {
    // BYOK model
    const apiKey = await db.prepare(`
      SELECT id FROM api_keys WHERE user_id = ? AND provider = ? AND custom_model = ?
    `).get(user.id, byokProvider, byokModelId) as any;
    hasKey = !!apiKey;
  }

  const usage = await db.prepare(`
    SELECT tokens_used FROM model_usage
    WHERE user_id = ? AND model_id = ? AND window_start = ?
  `).get(user.id, modelId, windowStart) as { tokens_used: number } | undefined;

  const used = usage?.tokens_used || 0;
  const remaining = Math.max(0, limit - used);

  return c.json({
    available: hasKey && remaining > 0,
    hasKey,
    usage: {
      used,
      limit,
      remaining,
      exhausted: remaining <= 0,
    },
    secondsUntilRefill: getTimeUntilRefill(),
  });
});

// Get usage stats for all models
modelRoutes.get('/usage/stats', async (c) => {
  const user = c.get('user');
  const db = getDb();
  const windowStart = getWindowStart();

  const usage = await db.prepare(`
    SELECT model_id, provider, tokens_used, tokens_limit, window_start
    FROM model_usage
    WHERE user_id = ? AND window_start = ?
  `).all(user.id, windowStart);

  return c.json({
    usage,
    window: {
      start: getWindowStart(),
      end: getWindowEnd(),
      secondsUntilRefill: getTimeUntilRefill(),
    },
  });
});
