// ---------------------------------------------------------------------------
// S3 Backend Adapter
//
// Adapts the s3.ts module functions into a StorageBackend interface
// so the high-level service can use S3 or local fs interchangeably.
// ---------------------------------------------------------------------------

import type { StorageBackend, UploadOptions, FileInfo, UploadResult, ListResult } from './types.js';

// Lazy import to allow graceful fallback if SDK not installed
let s3: typeof import('./s3.js') | null = null;

async function ensureLoaded(): Promise<typeof import('./s3.js')> {
  if (!s3) {
    s3 = await import('./s3.js');
  }
  return s3;
}

export const s3Backend: StorageBackend = {
  async init(): Promise<void> {
    const mod = await ensureLoaded();
    await mod.initStorage();
  },

  async upload(buffer: Buffer, key: string, mimetype: string, options?: UploadOptions): Promise<UploadResult> {
    const mod = await ensureLoaded();
    return mod.uploadFile(buffer, key, mimetype, options);
  },

  async download(key: string): Promise<Buffer> {
    const mod = await ensureLoaded();
    return mod.downloadFile(key);
  },

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const mod = await ensureLoaded();
    return mod.getSignedUrl(key, expiresIn);
  },

  async delete(key: string): Promise<void> {
    const mod = await ensureLoaded();
    return mod.deleteFile(key);
  },

  async deleteByPrefix(prefix: string): Promise<number> {
    const mod = await ensureLoaded();
    return mod.deleteFiles(prefix);
  },

  async list(prefix?: string, maxKeys?: number): Promise<ListResult> {
    const mod = await ensureLoaded();
    return mod.listFiles(prefix, maxKeys);
  },

  async exists(key: string): Promise<boolean> {
    const mod = await ensureLoaded();
    return mod.fileExists(key);
  },

  async info(key: string): Promise<FileInfo> {
    const mod = await ensureLoaded();
    return mod.getFileInfo(key);
  },

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const mod = await ensureLoaded();
    return mod.copyFile(sourceKey, destKey);
  },

  getUrl(key: string): string {
    // S3 module's getPublicUrl is synchronous
    const mod = s3;
    if (mod) return mod.getPublicUrl(key);
    return `/api/storage/download/${encodeURIComponent(key)}`;
  },
};
