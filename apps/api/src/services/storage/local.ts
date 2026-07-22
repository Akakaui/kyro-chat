// ---------------------------------------------------------------------------
// Local Filesystem Storage (Fallback)
//
// Drop-in replacement for S3 storage that writes to local disk.
// Used when S3_ENDPOINT is not configured.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import * as crypto from 'node:crypto';
import type { StorageBackend, UploadOptions, FileInfo, UploadResult, ListResult } from './types.js';
import { StorageError, FileNotFoundError } from './types.js';

function getStorageRoot(): string {
  return process.env.LOCAL_STORAGE_PATH || '/tmp/kyro-chat-storage';
}

function log(msg: string, ...args: unknown[]): void {
  console.log('[Storage:Local]', msg, ...args);
}

function safePath(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(getStorageRoot(), normalized);
}

async function ensureDir(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

// ── Backend Implementation ─────────────────────────────────────────────────

export const localBackend: StorageBackend = {
  async init(): Promise<void> {
    await fsp.mkdir(getStorageRoot(), { recursive: true });
    log(`Local storage root: ${getStorageRoot()}`);
  },

  async upload(buffer: Buffer, key: string, mimetype: string, options?: UploadOptions): Promise<UploadResult> {
    const filePath = safePath(key);
    await ensureDir(filePath);
    await fsp.writeFile(filePath, buffer);
    const metaPath = filePath + '.meta.json';
    await fsp.writeFile(metaPath, JSON.stringify({
      mimetype, size: buffer.length, uploadedAt: new Date().toISOString(), metadata: options?.metadata || {},
    }, null, 2));
    log(`Saved "${key}" (${mimetype}, ${buffer.length} bytes)`);
    return { key, url: localBackend.getUrl(key) };
  },

  async download(key: string): Promise<Buffer> {
    try { return await fsp.readFile(safePath(key)); }
    catch (err: any) {
      if (err.code === 'ENOENT') throw new FileNotFoundError(key);
      throw new StorageError(`Failed to read "${key}"`, err);
    }
  },

  async getSignedUrl(key: string, _expiresIn = 3600): Promise<string> {
    return localBackend.getUrl(key);
  },

  async delete(key: string): Promise<void> {
    const filePath = safePath(key);
    try {
      await fsp.unlink(filePath);
      await fsp.unlink(filePath + '.meta.json').catch(() => {});
      log(`Deleted "${key}"`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw new StorageError(`Failed to delete "${key}"`, err);
    }
  },

  async deleteByPrefix(prefix: string): Promise<number> {
    const listResult = await this.list(prefix);
    let deleted = 0;
    for (const key of listResult.keys) {
      try {
        const fp = safePath(key);
        await fsp.rm(fp, { force: true });
        await fsp.rm(fp + '.meta.json', { force: true }).catch(() => {});
        deleted++;
      } catch { /* skip */ }
    }
    if (deleted > 0 && prefix.endsWith('/')) {
      await fsp.rm(safePath(prefix.slice(0, -1)), { recursive: true, force: true }).catch(() => {});
    }
    log(`Deleted ${deleted} files under "${prefix}"`);
    return deleted;
  },

  async list(prefix?: string, _maxKeys = 100): Promise<ListResult> {
    const keys: string[] = [];
    if (prefix) {
      const dirKey = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      if (prefix.endsWith('/')) {
        try { await walkDir(safePath(dirKey), keys, ''); } catch { /* may not exist */ }
      } else {
        const parentDir = safePath(path.dirname(dirKey) || '.');
        try { await walkDir(parentDir, keys, ''); } catch { /* may not exist */ }
        return { keys: keys.filter((k) => k.startsWith(prefix) && !k.endsWith('.meta.json')), nextContinuationToken: undefined };
      }
    } else {
      try { await walkDir(getStorageRoot(), keys, ''); } catch { /* may not exist */ }
    }
    return {
      keys: keys.filter((k) => !k.endsWith('.meta.json')),
      nextContinuationToken: keys.filter((k) => !k.endsWith('.meta.json')).length >= _maxKeys ? 'more' : undefined,
    };
  },

  async exists(key: string): Promise<boolean> {
    try { await fsp.access(safePath(key), fs.constants.F_OK); return true; }
    catch { return false; }
  },

  async info(key: string): Promise<FileInfo> {
    const filePath = safePath(key);
    try {
      const stat = await fsp.stat(filePath);
      let mimetype = 'application/octet-stream';
      let metaData: Record<string, string> | undefined;
      try {
        const meta = JSON.parse(await fsp.readFile(filePath + '.meta.json', 'utf-8'));
        mimetype = meta.mimetype || mimetype;
        metaData = meta.metadata;
      } catch {
        const ext = path.extname(key).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain',
          '.html': 'text/html', '.csv': 'text/csv',
        };
        mimetype = mimeMap[ext] || 'application/octet-stream';
      }
      const etag = crypto.createHash('md5').update(`${stat.ino}-${stat.mtimeMs}`).digest('hex');
      return { size: stat.size, mimetype, lastModified: stat.mtime, etag, metadata: metaData };
    } catch (err: any) {
      if (err.code === 'ENOENT') throw new FileNotFoundError(key);
      throw new StorageError(`Failed to get info for "${key}"`, err);
    }
  },

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const srcPath = safePath(sourceKey);
    const dstPath = safePath(destKey);
    await ensureDir(dstPath);
    await fsp.copyFile(srcPath, dstPath);
    try { await fsp.copyFile(srcPath + '.meta.json', dstPath + '.meta.json'); } catch { /* no sidecar */ }
    log(`Copied "${sourceKey}" → "${destKey}"`);
  },

  getUrl(key: string): string {
    return `/api/storage/download/${encodeURIComponent(key)}`;
  },
};

// ── Directory Walk Helper ──────────────────────────────────────────────────

async function walkDir(dir: string, keys: string[], basePrefix: string): Promise<void> {
  let entries: fs.Dirent[];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, keys, basePrefix);
    } else if (entry.isFile()) {
      keys.push(path.relative(getStorageRoot(), fullPath).replace(/\\/g, '/'));
    }
  }
}
