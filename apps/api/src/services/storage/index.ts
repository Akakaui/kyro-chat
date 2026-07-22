// ---------------------------------------------------------------------------
// File Storage Service
//
// High-level file management with auto-selection between S3 and local fs.
// ---------------------------------------------------------------------------

import type { StorageBackend, UploadOptions, FileInfo } from './types.js';
import { Paths } from './paths.js';

export { Paths };

function log(msg: string, ...args: unknown[]): void {
  console.log('[Storage]', msg, ...args);
}

// ── Backend Selection ──────────────────────────────────────────────────────

let backend: StorageBackend | null = null;
let usingLocalFallback = false;

export async function initFileStorage(): Promise<void> {
  const useS3 = !!process.env.S3_ENDPOINT;
  if (useS3) {
    try {
      const { s3Backend } = await import('./s3-wrapper.js');
      backend = s3Backend;
      await backend.init();
      usingLocalFallback = false;
      log('Using S3 storage backend');
      return;
    } catch (err) {
      log('Failed to initialize S3, falling back to local:', (err as Error).message);
    }
  }
  const { localBackend } = await import('./local.js');
  backend = localBackend;
  await backend.init();
  usingLocalFallback = useS3;
  if (useS3) log('WARNING: S3 not available — using local filesystem fallback');
  else log('Using local filesystem storage');
}

function getBackend(): StorageBackend {
  if (!backend) throw new Error('[Storage] Not initialized. Call initFileStorage() first.');
  return backend;
}

export function isUsingLocalFallback(): boolean {
  return usingLocalFallback;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SaveFileResult {
  key: string;
  url: string;
  size: number;
  mimetype: string;
}

type InputFile = { buffer: Buffer; originalname: string; mimetype: string };

// ── File Operations ────────────────────────────────────────────────────────

export async function saveUpload(
  userId: string,
  file: InputFile,
  options?: UploadOptions,
): Promise<SaveFileResult> {
  const key = Paths.upload(userId, file.originalname);
  const bk = getBackend();
  const result = await bk.upload(file.buffer, key, file.mimetype, options);
  return { key: result.key, url: result.url, size: file.buffer.length, mimetype: file.mimetype };
}

export async function saveAvatar(
  userId: string,
  file: InputFile,
): Promise<SaveFileResult> {
  const key = Paths.avatar(userId, file.originalname);
  const bk = getBackend();
  try { await bk.delete(key); } catch { /* ignore old avatar */ }
  const result = await bk.upload(file.buffer, key, file.mimetype, {
    acl: 'public-read',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return { key: result.key, url: result.url, size: file.buffer.length, mimetype: file.mimetype };
}

export async function saveAttachment(
  conversationId: string,
  file: InputFile,
): Promise<SaveFileResult> {
  const key = Paths.attachment(conversationId, file.originalname);
  const bk = getBackend();
  const result = await bk.upload(file.buffer, key, file.mimetype, { acl: 'private' });
  return { key: result.key, url: result.url, size: file.buffer.length, mimetype: file.mimetype };
}

export async function saveExport(
  data: string | Buffer,
  format: 'json' | 'csv' | 'pdf' | 'txt',
): Promise<SaveFileResult> {
  const contentTypes: Record<string, string> = {
    json: 'application/json', csv: 'text/csv',
    pdf: 'application/pdf', txt: 'text/plain',
  };
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const key = Paths.exportFile(`export.${format}`);
  const bk = getBackend();
  const result = await bk.upload(buffer, key, contentTypes[format] || 'application/octet-stream', {
    acl: 'private',
    contentDisposition: `attachment; filename="export.${format}"`,
  });
  return { key: result.key, url: result.url, size: buffer.length, mimetype: contentTypes[format] || 'application/octet-stream' };
}

export async function getFile(key: string): Promise<Buffer> {
  return getBackend().download(key);
}

export async function getDownloadUrl(key: string, filename?: string): Promise<string> {
  const bk = getBackend();
  if (filename) {
    const url = await bk.getSignedUrl(key);
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}filename=${encodeURIComponent(filename)}`;
  }
  return bk.getSignedUrl(key);
}

export async function deleteUserFiles(userId: string): Promise<number> {
  return getBackend().deleteByPrefix(Paths.userPrefix(userId));
}

export async function deleteConversationFiles(conversationId: string): Promise<number> {
  return getBackend().deleteByPrefix(Paths.conversationPrefix(conversationId));
}

export async function cleanupTempFiles(olderThanMs: number): Promise<number> {
  const bk = getBackend();
  const result = await bk.list('temp/');
  const now = Date.now();
  let deleted = 0;
  for (const key of result.keys) {
    try {
      const info = await bk.info(key);
      if (now - info.lastModified.getTime() >= olderThanMs) {
        await bk.delete(key);
        deleted++;
      }
    } catch { /* skip files we can't stat */ }
  }
  if (deleted > 0) log(`Cleaned up ${deleted} temp files older than ${olderThanMs}ms`);
  return deleted;
}

export async function getStorageUsage(userId: string): Promise<{
  totalBytes: number;
  fileCount: number;
  files: Array<{ key: string; size: number; mimetype: string; lastModified: Date }>;
}> {
  const bk = getBackend();
  const result = await bk.list(Paths.userPrefix(userId));
  const files: Array<{ key: string; size: number; mimetype: string; lastModified: Date }> = [];
  for (const key of result.keys) {
    try {
      const info = await bk.info(key);
      files.push({ key, size: info.size, mimetype: info.mimetype, lastModified: info.lastModified });
    } catch { /* skip */ }
  }
  return { totalBytes: files.reduce((s, f) => s + f.size, 0), fileCount: files.length, files };
}

export async function deleteFileByKey(key: string): Promise<void> {
  await getBackend().delete(key);
}

export async function getFileInfoByKey(key: string): Promise<FileInfo> {
  return getBackend().info(key);
}

function detectBackendType(): 's3' | 'local' {
  const useS3 = !!process.env.S3_ENDPOINT;
  if (!useS3 || usingLocalFallback) return 'local';
  return 's3';
}

export async function checkStorageHealth(): Promise<{ ok: boolean; backend: string; error?: string }> {
  try {
    await getBackend().exists('health-check');
    return { ok: true, backend: detectBackendType() };
  } catch (err) {
    return { ok: false, backend: detectBackendType(), error: (err as Error).message };
  }
}
