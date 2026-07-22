// ---------------------------------------------------------------------------
// S3 Storage Service
//
// Wraps @aws-sdk/client-s3 and @aws-sdk/lib-storage for file operations.
// Graceful fallback if AWS SDK packages are not installed.
// ---------------------------------------------------------------------------

import type { S3ClientConfig, PutObjectCommandInput, ListObjectsV2CommandInput } from '@aws-sdk/client-s3';
import type { UploadOptions } from './types.js';
import { StorageError, FileNotFoundError } from './types.js';

// ── Lazy-loaded SDK ────────────────────────────────────────────────────────

let S3Client: typeof import('@aws-sdk/client-s3').S3Client | null = null;
let S3: typeof import('@aws-sdk/client-s3') | null = null;
let Upload: typeof import('@aws-sdk/lib-storage').Upload | null = null;
let getSignedUrlFn: typeof import('@aws-sdk/s3-request-presigner').getSignedUrl | null = null;

async function loadSdk(): Promise<void> {
  if (S3Client) return;
  try {
    const s3Mod = await import('@aws-sdk/client-s3');
    const libMod = await import('@aws-sdk/lib-storage');
    const presignerMod = await import('@aws-sdk/s3-request-presigner');
    S3 = s3Mod;
    S3Client = s3Mod.S3Client as unknown as typeof S3Client;
    Upload = libMod.Upload as unknown as typeof Upload;
    getSignedUrlFn = presignerMod.getSignedUrl as unknown as typeof getSignedUrlFn;
  } catch (err) {
    throw new StorageError('Failed to load AWS SDK packages', err);
  }
}

// ── Client ─────────────────────────────────────────────────────────────────

let client: import('@aws-sdk/client-s3').S3Client | null = null;
let bucketName = '';

function getConfig(): S3ClientConfig & { forcePathStyle?: boolean } {
  return {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
}

function log(msg: string, ...args: unknown[]): void {
  console.log('[Storage:S3]', msg, ...args);
}

// ── Initialization ─────────────────────────────────────────────────────────

export async function initStorage(): Promise<void> {
  await loadSdk();
  if (!S3 || !S3Client) throw new StorageError('AWS SDK not loaded');
  bucketName = process.env.S3_BUCKET || 'kyro-chat';
  if (client) return;
  const config = getConfig();
  client = new S3Client(config);
  try {
    await client.send(new S3.HeadBucketCommand({ Bucket: bucketName }));
    log(`Bucket "${bucketName}" already exists`);
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      try {
        await client.send(new S3.CreateBucketCommand({
          Bucket: bucketName,
          ...(config.region && config.region !== 'us-east-1'
            ? { CreateBucketConfiguration: { LocationConstraint: config.region as any } }
            : {}),
        }));
        log(`Bucket "${bucketName}" created`);
      } catch (createErr) {
        throw new StorageError(`Failed to create bucket "${bucketName}"`, createErr);
      }
    } else log(`Bucket check failed (may not exist): ${err.message}`);
  }
}

function getClient(): import('@aws-sdk/client-s3').S3Client {
  if (!client) throw new StorageError('S3 not initialized. Call initStorage() first.');
  return client;
}

// ── S3 Operations ──────────────────────────────────────────────────────────

export async function uploadFile(
  buffer: Buffer,
  key: string,
  mimetype: string,
  options: UploadOptions = {},
): Promise<{ key: string; url: string; etag?: string }> {
  const s3 = getClient();
  const params: PutObjectCommandInput = {
    Bucket: bucketName, Key: key, Body: buffer, ContentType: mimetype,
    ACL: options.acl || 'public-read',
  };
  if (options.metadata) params.Metadata = options.metadata;
  if (options.cacheControl) params.CacheControl = options.cacheControl;
  if (options.contentDisposition) params.ContentDisposition = options.contentDisposition;
  if (options.storageClass) params.StorageClass = options.storageClass as any;
  const result = await s3.send(new S3!.PutObjectCommand(params));
  log(`Uploaded "${key}" (${mimetype}, ${buffer.length} bytes)`);
  return { key, url: getPublicUrl(key), etag: result.ETag };
}

export async function downloadFile(key: string): Promise<Buffer> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  try {
    const command = new S3.GetObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3.send(command);
    if (!response.Body) throw new FileNotFoundError(key);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) throw new FileNotFoundError(key);
    throw new StorageError(`Failed to download "${key}"`, err);
  }
}

export async function getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const s3 = getClient();
  if (!S3 || !getSignedUrlFn) throw new StorageError('AWS SDK not loaded');
  const command = new S3.GetObjectCommand({ Bucket: bucketName, Key: key });
  return getSignedUrlFn(s3, command, { expiresIn });
}

export async function deleteFile(key: string): Promise<void> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  await s3.send(new S3.DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  log(`Deleted "${key}"`);
}

export async function deleteFiles(prefix: string): Promise<number> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  let deleted = 0;
  let continuationToken: string | undefined;
  do {
    const listParams: ListObjectsV2CommandInput = { Bucket: bucketName, Prefix: prefix };
    if (continuationToken) listParams.ContinuationToken = continuationToken;
    const listed = await s3.send(new S3.ListObjectsV2Command(listParams));
    if (!listed.Contents || listed.Contents.length === 0) break;
    const keys = listed.Contents.map((item) => item.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      await s3.send(new S3.DeleteObjectsCommand({
        Bucket: bucketName, Delete: { Objects: keys.map((k) => ({ Key: k })) },
      }));
      deleted += keys.length;
    }
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  log(`Deleted ${deleted} files under "${prefix}"`);
  return deleted;
}

export async function listFiles(
  prefix?: string,
  maxKeys = 100,
): Promise<{ keys: string[]; nextContinuationToken?: string }> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  const params: ListObjectsV2CommandInput = { Bucket: bucketName, MaxKeys: maxKeys };
  if (prefix) params.Prefix = prefix;
  const result = await s3.send(new S3.ListObjectsV2Command(params));
  return {
    keys: (result.Contents || []).map((item) => item.Key!).filter(Boolean),
    nextContinuationToken: result.NextContinuationToken,
  };
}

export async function fileExists(key: string): Promise<boolean> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  try {
    await s3.send(new S3.HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch { return false; }
}

export async function getFileInfo(key: string): Promise<{
  size: number;
  mimetype: string;
  lastModified: Date;
  etag?: string;
  metadata?: Record<string, string>;
}> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  try {
    const result = await s3.send(new S3.HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return {
      size: result.ContentLength || 0,
      mimetype: result.ContentType || 'application/octet-stream',
      lastModified: result.LastModified || new Date(),
      etag: result.ETag,
      metadata: result.Metadata,
    };
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) throw new FileNotFoundError(key);
    throw new StorageError(`Failed to get info for "${key}"`, err);
  }
}

export async function copyFile(sourceKey: string, destKey: string): Promise<void> {
  const s3 = getClient();
  if (!S3) throw new StorageError('AWS SDK not loaded');
  await s3.send(new S3.CopyObjectCommand({
    Bucket: bucketName, CopySource: `/${bucketName}/${sourceKey}`, Key: destKey,
  }));
  log(`Copied "${sourceKey}" → "${destKey}"`);
}

export function getPublicUrl(key: string): string {
  const publicUrl = process.env.S3_PUBLIC_URL;
  if (publicUrl) return `${publicUrl.replace(/\/$/, '')}/${key}`;
  const endpoint = (process.env.S3_ENDPOINT || 'http://localhost:9000').replace(/\/$/, '');
  return `${endpoint}/${bucketName}/${key}`;
}
