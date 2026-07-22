// ---------------------------------------------------------------------------
// Shared Types for Storage Services
// ---------------------------------------------------------------------------

// ── Error Classes ──────────────────────────────────────────────────────────

/** Generic storage error. */
export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Error thrown when a file is not found. */
export class FileNotFoundError extends StorageError {
  constructor(key: string) {
    super(`File not found: ${key}`);
    this.name = 'FileNotFoundError';
  }
}

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface UploadOptions {
  acl?: 'public-read' | 'private' | 'authenticated-read';
  metadata?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
  storageClass?: string;
}

export interface FileInfo {
  size: number;
  mimetype: string;
  lastModified: Date;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  etag?: string;
}

export interface ListResult {
  keys: string[];
  nextContinuationToken?: string;
}

export interface StorageBackend {
  init(): Promise<void>;
  upload(buffer: Buffer, key: string, mimetype: string, options?: UploadOptions): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
  list(prefix?: string, maxKeys?: number): Promise<ListResult>;
  exists(key: string): Promise<boolean>;
  info(key: string): Promise<FileInfo>;
  copy(sourceKey: string, destKey: string): Promise<void>;
  getUrl(key: string): string;
}
