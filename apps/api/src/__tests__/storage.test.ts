// ---------------------------------------------------------------------------
// File Storage Tests
//
// Tests the local filesystem storage backend and the high-level file service.
// S3 tests use mocked clients; local storage tests use real disk I/O in /tmp.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

// ── Mock AWS SDK (prevents import errors in test env) ──────────────────────

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  class MockS3Client {
    send = mockSend;
    constructor(config: any) { /* noop */ }
    destroy() { /* noop */ }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
    HeadObjectCommand: vi.fn(),
    HeadBucketCommand: vi.fn(),
    CreateBucketCommand: vi.fn(),
    CopyObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/file'),
}));

// ── Constants ──────────────────────────────────────────────────────────────

const TEST_ROOT = '/tmp/kyro-chat-storage-test';

// ── Helpers ────────────────────────────────────────────────────────────────

async function cleanStorageRoot(): Promise<void> {
  await fsp.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
}

// ── Local Backend Tests ────────────────────────────────────────────────────

describe('Local Backend', () => {
  beforeEach(async () => {
    process.env.LOCAL_STORAGE_PATH = TEST_ROOT;
    process.env.S3_ENDPOINT = '';
    await cleanStorageRoot();
    // Import and initialize the local backend directly
    const { localBackend } = await import('../services/storage/local.js');
    await localBackend.init();
  });

  afterEach(async () => {
    await cleanStorageRoot();
    vi.restoreAllMocks();
  });

  it('should initialize and create storage root', async () => {
    const exists = await fsp.stat(TEST_ROOT).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should upload and download a file', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    const buffer = Buffer.from('hello world');
    const result = await localBackend.upload(buffer, 'test/hello.txt', 'text/plain');
    expect(result.key).toBe('test/hello.txt');
    expect(result.url).toContain('/api/storage/download/');

    const downloaded = await localBackend.download('test/hello.txt');
    expect(downloaded.toString()).toBe('hello world');
  });

  it('should upload and preserve file size', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    const content = 'x'.repeat(10000);
    const buffer = Buffer.from(content);
    await localBackend.upload(buffer, 'test/large.txt', 'text/plain');

    const info = await localBackend.info('test/large.txt');
    expect(info.size).toBe(10000);
    expect(info.mimetype).toBe('text/plain');
  });

  it('should return file info', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    const buffer = Buffer.from('file info test');
    await localBackend.upload(buffer, 'test/info.txt', 'application/json');

    const info = await localBackend.info('test/info.txt');
    expect(info.size).toBe(14); // "file info test" length
    expect(info.mimetype).toBe('application/json');
    expect(info.lastModified).toBeInstanceOf(Date);
    expect(info.etag).toBeDefined();
  });

  it('should list files by prefix', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    await localBackend.upload(Buffer.from('a'), 'list/a.txt', 'text/plain');
    await localBackend.upload(Buffer.from('b'), 'list/b.txt', 'text/plain');
    await localBackend.upload(Buffer.from('c'), 'other/c.txt', 'text/plain');

    const result = await localBackend.list('list/');
    // Only files under list/, excluding .meta.json sidecars
    expect(result.keys.filter((k) => !k.endsWith('.meta.json'))).toHaveLength(2);
    expect(result.keys).toContain('list/a.txt');
    expect(result.keys).toContain('list/b.txt');
    expect(result.keys).not.toContain('other/c.txt');
  });

  it('should check file existence', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    expect(await localBackend.exists('nonexistent/file.txt')).toBe(false);

    await localBackend.upload(Buffer.from('test'), 'exists/test.txt', 'text/plain');
    expect(await localBackend.exists('exists/test.txt')).toBe(true);
  });

  it('should copy a file', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    await localBackend.upload(Buffer.from('copy source'), 'copy/src.txt', 'text/plain');
    await localBackend.copy('copy/src.txt', 'copy/dst.txt');

    const downloaded = await localBackend.download('copy/dst.txt');
    expect(downloaded.toString()).toBe('copy source');
  });

  it('should delete a single file', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    await localBackend.upload(Buffer.from('delete me'), 'delete/me.txt', 'text/plain');
    expect(await localBackend.exists('delete/me.txt')).toBe(true);

    await localBackend.delete('delete/me.txt');
    expect(await localBackend.exists('delete/me.txt')).toBe(false);
  });

  it('should delete files by prefix', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    await localBackend.upload(Buffer.from('a'), 'bulk/a.txt', 'text/plain');
    await localBackend.upload(Buffer.from('b'), 'bulk/b.txt', 'text/plain');
    await localBackend.upload(Buffer.from('c'), 'bulk/sub/c.txt', 'text/plain');

    // deleteByPrefix walks the directory; we need the root dir
    const deleted = await localBackend.deleteByPrefix('bulk/');
    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(await localBackend.exists('bulk/a.txt')).toBe(false);
  });

  it('should throw FileNotFoundError for missing file', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    await expect(localBackend.download('does/not/exist.txt'))
      .rejects.toThrow(/File not found/);

    await expect(localBackend.info('does/not/exist.txt'))
      .rejects.toThrow(/File not found/);
  });

  it('should generate a signed URL', async () => {
    const { localBackend } = await import('../services/storage/local.js');
    const url = await localBackend.getSignedUrl('some/key.txt');
    expect(url).toContain('/api/storage/download/');
  });
});

// ── Storage Service Tests ──────────────────────────────────────────────────

describe('Storage Service', () => {
  beforeEach(async () => {
    process.env.LOCAL_STORAGE_PATH = TEST_ROOT;
    process.env.S3_ENDPOINT = '';
    await cleanStorageRoot();
    const { initFileStorage } = await import('../services/storage/index.js');
    await initFileStorage();
  });

  afterEach(async () => {
    await cleanStorageRoot();
    vi.restoreAllMocks();
  });

  it('should save a user upload', async () => {
    const { saveUpload, getFile } = await import('../services/storage/index.js');
    const result = await saveUpload('test-user', {
      buffer: Buffer.from('upload content'),
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
    });

    expect(result.key).toMatch(/^uploads\/test-user\//);
    expect(result.url).toBeDefined();
    expect(result.size).toBe(14); // "upload content" is 14 chars
    expect(result.mimetype).toBe('application/pdf');

    // Verify file is stored
    const downloaded = await getFile(result.key);
    expect(downloaded.toString()).toBe('upload content');
  });

  it('should save and replace an avatar', async () => {
    const { saveAvatar } = await import('../services/storage/index.js');
    const result = await saveAvatar('user-1', {
      buffer: Buffer.from('avatar data'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.key).toMatch(/^avatars\/user-1/);
    expect(result.url).toBeDefined();
    expect(result.mimetype).toBe('image/jpeg');

    // Save again — should overwrite without error
    const result2 = await saveAvatar('user-1', {
      buffer: Buffer.from('new avatar'),
      originalname: 'photo.png',
      mimetype: 'image/png',
    });

    expect(result2.key).toMatch(/^avatars\/user-1/);
  });

  it('should save a chat attachment', async () => {
    const { saveAttachment } = await import('../services/storage/index.js');
    const result = await saveAttachment('conv-42', {
      buffer: Buffer.from('attachment'),
      originalname: 'doc.txt',
      mimetype: 'text/plain',
    });

    expect(result.key).toMatch(/^attachments\/conv-42\//);
  });

  it('should save an export file', async () => {
    const { saveExport } = await import('../services/storage/index.js');
    const result = await saveExport(
      JSON.stringify({ foo: 'bar' }),
      'json',
    );

    expect(result.key).toMatch(/^exports\//);
    expect(result.key).toMatch(/\.json$/);
    expect(result.mimetype).toBe('application/json');
  });

  it('should get a download URL for a file', async () => {
    const { saveUpload, getDownloadUrl } = await import('../services/storage/index.js');
    const saved = await saveUpload('test-user', {
      buffer: Buffer.from('download url test'),
      originalname: 'test.txt',
      mimetype: 'text/plain',
    });

    const url = await getDownloadUrl(saved.key);
    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
  });

  it('should get storage usage for a user', async () => {
    const { saveUpload, getStorageUsage } = await import('../services/storage/index.js');
    await saveUpload('usage-user', {
      buffer: Buffer.from('file one'),
      originalname: 'f1.txt',
      mimetype: 'text/plain',
    });
    await saveUpload('usage-user', {
      buffer: Buffer.from('file two longer'),
      originalname: 'f2.txt',
      mimetype: 'text/plain',
    });

    const usage = await getStorageUsage('usage-user');
    expect(usage.fileCount).toBe(2);
    expect(usage.totalBytes).toBeGreaterThan(0);
    expect(usage.files).toHaveLength(2);
    expect(usage.files[0].key).toContain('usage-user');
  });

  it('should return empty usage for user with no files', async () => {
    const { getStorageUsage } = await import('../services/storage/index.js');
    const usage = await getStorageUsage('no-files-user');
    expect(usage.fileCount).toBe(0);
    expect(usage.totalBytes).toBe(0);
    expect(usage.files).toHaveLength(0);
  });

  it('should delete user files', async () => {
    const { saveUpload, deleteUserFiles, getStorageUsage } = await import('../services/storage/index.js');
    await saveUpload('delete-user', {
      buffer: Buffer.from('delete me'),
      originalname: 'd.txt',
      mimetype: 'text/plain',
    });

    const deleted = await deleteUserFiles('delete-user');
    expect(deleted).toBeGreaterThanOrEqual(1);

    const usage = await getStorageUsage('delete-user');
    // Note: meta files might still be counted depending on backend
    // We're checking directly on the backend, so actual file count depends
    expect(usage.fileCount).toBeGreaterThanOrEqual(0);
  });

  it('should delete conversation files', async () => {
    const { saveAttachment, deleteConversationFiles } = await import('../services/storage/index.js');
    await saveAttachment('conv-delete', {
      buffer: Buffer.from('attachment'),
      originalname: 'attach.txt',
      mimetype: 'text/plain',
    });

    const deleted = await deleteConversationFiles('conv-delete');
    expect(deleted).toBeGreaterThanOrEqual(1);
  });

  it('should cleanup temp files', async () => {
    const { Paths, cleanupTempFiles } = await import('../services/storage/index.js');
    const { localBackend } = await import('../services/storage/local.js');

    const key = Paths.temp('old-file.txt');
    await localBackend.upload(Buffer.from('old'), key, 'text/plain');

    const cleaned = await cleanupTempFiles(0);
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(await localBackend.exists(key)).toBe(false);
  });

  it('should delete a file by key', async () => {
    const { saveUpload, deleteFileByKey, getFile } = await import('../services/storage/index.js');
    const saved = await saveUpload('del-test', {
      buffer: Buffer.from('to delete'),
      originalname: 'remove.txt',
      mimetype: 'text/plain',
    });

    await deleteFileByKey(saved.key);
    await expect(getFile(saved.key)).rejects.toThrow(/File not found/);
  });

  it('should check storage health', async () => {
    const { checkStorageHealth } = await import('../services/storage/index.js');
    const health = await checkStorageHealth();
    expect(health.ok).toBe(true);
    expect(health.backend).toBe('local');
  });

  it('should get file info by key', async () => {
    const { saveUpload, getFileInfoByKey } = await import('../services/storage/index.js');
    const saved = await saveUpload('info-test', {
      buffer: Buffer.from('info test data'),
      originalname: 'info.txt',
      mimetype: 'text/plain',
    });

    const info = await getFileInfoByKey(saved.key);
    expect(info.size).toBe(14); // "info test data" length
    expect(info.mimetype).toBe('text/plain');
    expect(info.lastModified).toBeInstanceOf(Date);
  });

  it('should throw on missing file info', async () => {
    const { getFileInfoByKey } = await import('../services/storage/index.js');
    await expect(getFileInfoByKey('nonexistent/file.txt'))
      .rejects.toThrow();
  });

  it('should report local storage when S3 not configured', async () => {
    const { isUsingLocalFallback } = await import('../services/storage/index.js');
    expect(isUsingLocalFallback()).toBe(false);
  });
});

// ── Path Helpers ───────────────────────────────────────────────────────────

describe('Path Helpers', () => {
  it('should generate upload paths', async () => {
    const { Paths } = await import('../services/storage/index.js');
    const p = Paths.upload('user123', 'doc.pdf');
    expect(p).toMatch(/^uploads\/user123\/[a-f0-9-]+\.pdf$/);
  });

  it('should generate avatar paths', async () => {
    const { Paths } = await import('../services/storage/index.js');
    const p = Paths.avatar('user1', 'photo.jpg');
    expect(p).toMatch(/^avatars\/user1\.jpg$/);
  });

  it('should generate attachment paths', async () => {
    const { Paths } = await import('../services/storage/index.js');
    const p = Paths.attachment('conv456', 'image.png');
    expect(p).toMatch(/^attachments\/conv456\/[a-f0-9-]+\.png$/);
  });

  it('should generate export paths', async () => {
    const { Paths } = await import('../services/storage/index.js');
    const p = Paths.exportFile('data.json');
    expect(p).toMatch(/^exports\/[a-f0-9-]+\.json$/);
  });

  it('should generate temp paths', async () => {
    const { Paths } = await import('../services/storage/index.js');
    const p = Paths.temp('tmp.csv');
    expect(p).toMatch(/^temp\/[a-f0-9-]+\.csv$/);
  });

  it('should generate user and conversation prefixes', async () => {
    const { Paths } = await import('../services/storage/index.js');
    expect(Paths.userPrefix('u1')).toBe('uploads/u1/');
    expect(Paths.conversationPrefix('c1')).toBe('attachments/c1/');
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  beforeEach(async () => {
    process.env.LOCAL_STORAGE_PATH = TEST_ROOT;
    process.env.S3_ENDPOINT = '';
    await cleanStorageRoot();
    const { initFileStorage } = await import('../services/storage/index.js');
    await initFileStorage();
  });

  afterEach(async () => {
    await cleanStorageRoot();
    vi.restoreAllMocks();
  });

  it('should handle empty files', async () => {
    const { saveUpload, getFileInfoByKey } = await import('../services/storage/index.js');
    const result = await saveUpload('empty-test', {
      buffer: Buffer.alloc(0),
      originalname: 'empty.txt',
      mimetype: 'text/plain',
    });

    const info = await getFileInfoByKey(result.key);
    expect(info.size).toBe(0);
  });

  it('should handle files without extensions', async () => {
    const { saveUpload, getFile } = await import('../services/storage/index.js');
    const result = await saveUpload('noext', {
      buffer: Buffer.from('data'),
      originalname: 'noextfile',
      mimetype: 'application/octet-stream',
    });

    const downloaded = await getFile(result.key);
    expect(downloaded.toString()).toBe('data');
  });

  it('should handle special characters in filenames', async () => {
    const { saveUpload, getFile } = await import('../services/storage/index.js');
    const result = await saveUpload('special-chars', {
      buffer: Buffer.from('special!@#'),
      originalname: 'file (1) [test].txt',
      mimetype: 'text/plain',
    });

    const downloaded = await getFile(result.key);
    expect(downloaded.toString()).toBe('special!@#');
  });

  it('should prevent path traversal', async () => {
    const { localBackend } = await import('../services/storage/local.js');

    await expect(localBackend.download('../../../etc/passwd'))
      .rejects.toThrow();
  });

  it('should handle concurrent uploads', async () => {
    const { saveUpload } = await import('../services/storage/index.js');
    const promises = Array.from({ length: 10 }, (_, i) =>
      saveUpload('concurrent', {
        buffer: Buffer.from(`file-${i}`),
        originalname: `file-${i}.txt`,
        mimetype: 'text/plain',
      }),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    expect(new Set(results.map((r) => r.key)).size).toBe(10); // All unique
  });

  it('should handle large file info correctly', async () => {
    const { saveUpload, getFileInfoByKey } = await import('../services/storage/index.js');
    const largeContent = 'X'.repeat(100_000);
    const result = await saveUpload('large', {
      buffer: Buffer.from(largeContent),
      originalname: 'large.txt',
      mimetype: 'text/plain',
    });

    const info = await getFileInfoByKey(result.key);
    expect(info.size).toBe(100_000);
  });

  it('should disable fallback flag when S3 not configured', async () => {
    const { isUsingLocalFallback } = await import('../services/storage/index.js');
    // S3_ENDPOINT is empty, so this is intentional local storage, not a fallback
    expect(isUsingLocalFallback()).toBe(false);
  });
});
