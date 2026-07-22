// ---------------------------------------------------------------------------
// File Storage Routes
//
// REST endpoints for file upload, download, and management.
// All routes require authentication (mounted under /api).
//
// Note: File keys contain slashes (e.g., "uploads/{userId}/{uuid}.ext").
// Routes use URL-encoded keys. The client encodes the key so it becomes a
// single path segment (e.g., encodeURIComponent("uploads/u/file.txt") →
// "uploads%2Fu%2Ffile.txt"). Hono's `:key{.+}` captures everything.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import * as storageService from '../services/storage/index.js';

export const storageRoutes = new Hono();

// ── Upload file (multipart) ────────────────────────────────────────────────

storageRoutes.post('/storage/upload', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const body = await c.req.parseBody();
    const fileField = body['file'];

    if (!fileField) {
      return c.json({ error: 'No file provided. Use "file" field.' }, 400);
    }

    let buffer: Buffer;
    let originalname: string;
    let mimetype: string;

    // Use duck-typing check since DOM types are not in the target lib
    const isFileLike = fileField && typeof (fileField as any).arrayBuffer === 'function';

    if (isFileLike) {
      const ff = fileField as any;
      const arrBuf: ArrayBuffer = await ff.arrayBuffer();
      buffer = Buffer.from(arrBuf);
      originalname = ff.name || 'file.bin';
      mimetype = ff.type || 'application/octet-stream';
    } else {
      return c.json({ error: 'Unsupported file type' }, 400);
    }

    // Validate file size (50MB default limit)
    const maxSize = parseInt(
      process.env.MAX_UPLOAD_SIZE || String(50 * 1024 * 1024),
    );
    if (buffer.length > maxSize) {
      const maxMb = Math.round(maxSize / 1024 / 1024);
      return c.json({ error: `File too large. Max size: ${maxMb}MB` }, 413);
    }

    const result = await storageService.saveUpload(user.id, {
      buffer,
      originalname,
      mimetype,
    });

    return c.json(
      {
        key: result.key,
        url: result.url,
        size: result.size,
        mimetype: result.mimetype,
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[Storage] Upload error:', message);
    return c.json({ error: message }, 500);
  }
});

// ── Download file ──────────────────────────────────────────────────────────

storageRoutes.get('/storage/download/:key{.+}', async (c) => {
  const encodedKey = c.req.param('key') || '';

  try {
    const key = decodeURIComponent(encodedKey);
    const buffer = await storageService.getFile(key);

    // Try to get metadata for response headers
    let mimetype = 'application/octet-stream';
    try {
      const info = await storageService.getFileInfoByKey(key);
      mimetype = info.mimetype;
    } catch { /* use default */ }

    const filename = c.req.query('filename') || key.split('/').pop() || 'download';

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimetype,
        'Content-Length': String(buffer.length),
        'Content-Disposition':
          `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (err: any) {
    if (err.name === 'FileNotFoundError') {
      return c.json({ error: 'File not found' }, 404);
    }
    console.error('[Storage] Download error:', err.message);
    return c.json({ error: 'Download failed' }, 500);
  }
});

// ── Get file info ──────────────────────────────────────────────────────────

storageRoutes.get('/storage/info/:key{.+}', async (c) => {
  const encodedKey = c.req.param('key') || '';

  try {
    const key = decodeURIComponent(encodedKey);
    const info = await storageService.getFileInfoByKey(key);

    return c.json({
      key,
      size: info.size,
      mimetype: info.mimetype,
      lastModified: info.lastModified.toISOString(),
      etag: info.etag,
    });
  } catch (err: any) {
    if (err.name === 'FileNotFoundError') {
      return c.json({ error: 'File not found' }, 404);
    }
    console.error('[Storage] Info error:', err.message);
    return c.json({ error: 'Failed to get file info' }, 500);
  }
});

// ── Delete file ────────────────────────────────────────────────────────────

storageRoutes.delete('/storage/:key{.+}', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const encodedKey = c.req.param('key') || '';

  try {
    const key = decodeURIComponent(encodedKey);
    await storageService.deleteFileByKey(key);
    return c.json({ message: 'File deleted' });
  } catch (err: any) {
    console.error('[Storage] Delete error:', err.message);
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

// ── Get storage usage ──────────────────────────────────────────────────────

storageRoutes.get('/storage/usage', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const usage = await storageService.getStorageUsage(user.id);
    return c.json({
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
      files: usage.files.map((f) => ({
        key: f.key,
        size: f.size,
        mimetype: f.mimetype,
        lastModified: f.lastModified.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[Storage] Usage error:', (err as Error).message);
    return c.json({ error: 'Failed to get storage usage' }, 500);
  }
});

// ── Storage health check ───────────────────────────────────────────────────

storageRoutes.get('/storage/health', async (c) => {
  const health = await storageService.checkStorageHealth();
  const status = health.ok ? 200 : 503;
  return c.json(health, status);
});
