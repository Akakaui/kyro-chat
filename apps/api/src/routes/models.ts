import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import crypto from 'crypto';

export const modelRoutes = new Hono();

// Model definitions with usage limits per 4-hour window
const MODEL_REGISTRY = [
  // OpenAI models
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', limit: 100000, tier: 'pro' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', limit: 500000, tier: 'fast' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', limit: 80000, tier: 'pro' },
  // Anthropic models
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', limit: 150000, tier: 'pro' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', limit: 150000, tier: 'pro' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', limit: 400000, tier: 'fast' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', limit: 400000, tier: 'fast' },
  // Google models
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', limit: 500000, tier: 'fast' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'google', limit: 1000000, tier: 'fast' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', limit: 100000, tier: 'pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', limit: 500000, tier: 'fast' },
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

  // Get user's API keys to determine which providers are available
  const apiKeys = db.prepare(`
    SELECT provider, api_key FROM api_keys WHERE user_id = ?
  `).all(user.id) as Array<{ provider: string; api_key: string }>;

  const availableProviders = new Set(apiKeys.map(k => k.provider));

  // Also check env for system-provided keys
  if (process.env.OPENAI_API_KEY) availableProviders.add('openai');
  if (process.env.ANTHROPIC_API_KEY) availableProviders.add('anthropic');
  if (process.env.GOOGLE_AI_API_KEY) availableProviders.add('google');

  // Get usage for current window
  const usage = db.prepare(`
    SELECT model_id, tokens_used FROM model_usage
    WHERE user_id = ? AND window_start = ?
  `).all(user.id, windowStart) as Array<{ model_id: string; tokens_used: number }>;

  const usageMap = new Map(usage.map(u => [u.model_id, u.tokens_used]));

  const models = MODEL_REGISTRY.map(model => {
    const hasKey = availableProviders.has(model.provider);
    const used = usageMap.get(model.id) || 0;
    const remaining = Math.max(0, model.limit - used);
    const percentUsed = Math.min(100, Math.round((used / model.limit) * 100));

    return {
      ...model,
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

  return c.json({
    models,
    window: {
      start: getWindowStart(),
      end: getWindowEnd(),
      secondsUntilRefill: getTimeUntilRefill(),
    },
  });
});

// Record token usage after a message
modelRoutes.post('/usage', async (c) => {
  const user = c.get('user');
  const { modelId, provider, tokensUsed } = await c.req.json();

  // H8: Validate tokensUsed is a non-negative integer within bounds
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

  // Check if usage record exists for this window
  const existing = db.prepare(`
    SELECT id, tokens_used FROM model_usage
    WHERE user_id = ? AND model_id = ? AND window_start = ?
  `).get(user.id, modelId, windowStart) as { id: string; tokens_used: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE model_usage SET tokens_used = ? WHERE id = ?
    `).run(existing.tokens_used + tokensUsed, existing.id);
  } else {
    db.prepare(`
      INSERT INTO model_usage (id, user_id, model_id, provider, tokens_used, tokens_limit, window_start, window_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, modelId, provider, tokensUsed, MODEL_REGISTRY.find(m => m.id === modelId)?.limit || 100000, windowStart, windowEnd);
  }

  return c.json({ success: true });
});

// Check if a model is available for use
modelRoutes.get('/:modelId/check', async (c) => {
  const user = c.get('user');
  const modelId = c.req.param('modelId');
  const db = getDb();
  const windowStart = getWindowStart();

  const model = MODEL_REGISTRY.find(m => m.id === modelId);
  if (!model) {
    return c.json({ error: 'Model not found' }, 404);
  }

  // Check API key
  const apiKey = db.prepare(`
    SELECT api_key FROM api_keys WHERE user_id = ? AND provider = ?
  `).get(user.id, model.provider) as { api_key: string } | undefined;

  const hasKey = !!apiKey || !!process.env[`${model.provider.toUpperCase()}_API_KEY`];

  // Check usage
  const usage = db.prepare(`
    SELECT tokens_used FROM model_usage
    WHERE user_id = ? AND model_id = ? AND window_start = ?
  `).get(user.id, modelId, windowStart) as { tokens_used: number } | undefined;

  const used = usage?.tokens_used || 0;
  const remaining = Math.max(0, model.limit - used);

  return c.json({
    available: hasKey && remaining > 0,
    hasKey,
    usage: {
      used,
      limit: model.limit,
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

  const usage = db.prepare(`
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
