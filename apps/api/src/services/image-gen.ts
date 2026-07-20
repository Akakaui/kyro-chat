import { decryptApiKey } from '../lib/encryption.js';
import { getDb } from '../db/init.js';
import crypto from 'crypto';

export interface ImageGenResult {
  id: string;
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  size: string;
}

export interface ImageGenOptions {
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
  conversationId?: string;
  messageId?: string;
}

// ── Generate with OpenAI DALL-E ──
async function generateWithOpenAI(
  apiKey: string,
  prompt: string,
  size: string,
  style: string,
  count: number
): Promise<{ url: string; revisedPrompt?: string }> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: Math.min(count, 1),
      size: size || '1024x1024',
      style: style || 'vivid',
      response_format: 'url',
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI DALL-E error: ${(err as any).error?.message || res.statusText}`);
  }

  const data = await res.json() as any;
  const item = data.data?.[0];
  if (!item) throw new Error('No image returned from DALL-E');

  return { url: item.url, revisedPrompt: item.revised_prompt };
}

// ── Generate with Replicate (Flux) ──
async function generateWithReplicate(
  apiKey: string,
  prompt: string,
  size: string
): Promise<{ url: string; revisedPrompt?: string }> {
  // Create a prediction
  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({
      input: {
        prompt,
        width: parseInt(size?.split('x')[0] || '1024'),
        height: parseInt(size?.split('x')[1] || '1024'),
        num_outputs: 1,
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(`Replicate error: ${(err as any).detail || createRes.statusText}`);
  }

  const prediction = await createRes.json() as any;
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) throw new Error('No polling URL returned from Replicate');

  // Poll for completion (max 120s)
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const status = await pollRes.json() as any;
    if (status.status === 'succeeded') {
      const output = Array.isArray(status.output) ? status.output[0] : status.output;
      return { url: output };
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Replicate generation failed: ${status.error || 'unknown error'}`);
    }
  }

  throw new Error('Replicate generation timed out');
}

// ── Main generate function ──
export async function generateImage(
  userId: string,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const { prompt, size = '1024x1024', style = 'vivid', count = 1, conversationId, messageId } = options;

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }

  const db = getDb();

  // Find user's BYOK key with image gen support
  const rows = db.prepare(`
    SELECT id, provider, encrypted_key FROM api_keys
    WHERE user_id = ? AND is_valid = 1
    ORDER BY created_at ASC
  `).all(userId) as any[];

  // Prefer OpenAI for DALL-E, then Replicate for Flux
  let chosenRow = rows.find((r) => r.provider === 'openai');
  if (!chosenRow) {
    chosenRow = rows.find((r) => r.provider === 'replicate');
  }
  if (!chosenRow) {
    throw new Error(
      'No API key with image generation support found. Add an OpenAI or Replicate key in Settings → Models.'
    );
  }

  // Decrypt the key
  const apiKey = await decryptApiKey(chosenRow.encrypted_key);

  // Route to provider
  let url: string;
  let revisedPrompt: string | undefined;

  if (chosenRow.provider === 'openai') {
    const result = await generateWithOpenAI(apiKey, prompt.trim(), size, style, count);
    url = result.url;
    revisedPrompt = result.revisedPrompt;
  } else if (chosenRow.provider === 'replicate') {
    const result = await generateWithReplicate(apiKey, prompt.trim(), size);
    url = result.url;
  } else {
    throw new Error(`Image generation not supported for provider: ${chosenRow.provider}`);
  }

  // Store in DB
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO generated_images (id, user_id, conversation_id, message_id, provider, model, prompt, url, size, revised_prompt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, conversationId || null, messageId || null,
    chosenRow.provider, chosenRow.provider === 'openai' ? 'dall-e-3' : 'flux-1.1-pro',
    prompt.trim(), url, size, revisedPrompt || null
  );

  return {
    id,
    url,
    revisedPrompt,
    provider: chosenRow.provider,
    model: chosenRow.provider === 'openai' ? 'dall-e-3' : 'flux-1.1-pro',
    size,
  };
}

// ── Get a generated image by ID ──
export function getImageById(imageId: string, userId: string): any | null {
  const db = getDb();
  return db.prepare(`
    SELECT id, user_id, provider, model, prompt, url, size, revised_prompt, created_at
    FROM generated_images WHERE id = ? AND user_id = ?
  `).get(imageId, userId) || null;
}
