import { Hono } from 'hono';
import { generateImage, getImageById } from '../services/image-gen.js';

export const imageRoutes = new Hono();

// ── POST /image/generate — Generate an image ──
imageRoutes.post('/generate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { prompt, size, style, count, conversationId, messageId } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  if (prompt.length > 4000) {
    return c.json({ error: 'prompt must be 4000 characters or fewer' }, 400);
  }

  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  if (size && !validSizes.includes(size)) {
    return c.json({ error: `Invalid size. Must be one of: ${validSizes.join(', ')}` }, 400);
  }

  const validStyles = ['vivid', 'natural'];
  if (style && !validStyles.includes(style)) {
    return c.json({ error: `Invalid style. Must be one of: ${validStyles.join(', ')}` }, 400);
  }

  if (count && (count < 1 || count > 4)) {
    return c.json({ error: 'count must be between 1 and 4' }, 400);
  }

  try {
    const result = await generateImage(user.id, {
      prompt,
      size: size || '1024x1024',
      style: style || 'vivid',
      count: count || 1,
      conversationId,
      messageId,
    });

    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 502);
  }
});

// ── GET /image/:id — Get a generated image record ──
imageRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const imageId = c.req.param('id');

  const image = getImageById(imageId, user.id);
  if (!image) return c.json({ error: 'Image not found' }, 404);

  return c.json({ image });
});
