import { getDb } from '../db/init.js';
import { createHash } from 'crypto';
import { Sandbox } from 'e2b';

// TS7 native (7.0.2) has a type-resolution bug where it can't see properties
// and static methods on the E2B Sandbox class in certain files even though
// they are correctly declared in the .d.ts/.d.mts types.  We define a thin
// interface that mirrors the API surface we use and cast through it.
interface E2BSandbox {
  readonly sandboxId: string;
  readonly files: { write(path: string, data: string): Promise<void> };
  readonly commands: {
    run(
      cmd: string,
      opts?: { background?: boolean; cwd?: string; env?: Record<string, string> },
    ): Promise<{ wait(): Promise<void> }>;
  };
  setTimeout(ms: number): Promise<void>;
  getHost(port: number): string;
}
// The SandboxApi class we use for static `kill`
const SandboxApi = Sandbox as unknown as {
  kill(sandboxId: string): Promise<void>;
  create(opts?: Record<string, unknown>): Promise<E2BSandbox>;
};

interface Artifact {
  id: string;
  userId: string;
  type: 'html' | 'pdf' | 'markdown' | 'code';
  title: string;
  content: string;
  metadata?: Record<string, any>;
  shareHash?: string;
  shareExpiresAt?: number;
  sandboxId?: string;
  shareUrl?: string;
  sandboxExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Port used for the HTTP file server inside the E2B sandbox */
const SANDBOX_SERVE_PORT = 8080;
/** Default sandbox lifetime in milliseconds (30 minutes) */
const DEFAULT_SANDBOX_TTL_MS = 30 * 60 * 1000;

class ArtifactService {
  // ---- E2B sandbox sharing ----

  /**
   * Create an E2B sandbox for an HTML artifact.
   * Writes the HTML to an index.html file, starts a tiny HTTP server,
   * and returns a public share URL.
   */
  async createSandboxShare(
    id: string,
    userId: string,
    expiresInHours: number = 1,
  ): Promise<{ shareUrl: string; sandboxId: string; expiresAt: number } | null> {
    const db = getDb();
    const artifact = this.get(id, userId);
    if (!artifact) return null;

    // Clean up any previous sandbox for this artifact
    if (artifact.sandboxId) {
      try {
        await SandboxApi.kill(artifact.sandboxId);
      } catch {
        // Best-effort
      }
    }

    const sandbox = await SandboxApi.create({
      metadata: {
        'artifact-id': id,
        'user-id': userId,
        'purpose': 'artifact-share',
      },
    });

    await sandbox.setTimeout(60 * 60 * 1000); // 1 hour timeout

    // Write the HTML file
    await sandbox.files.write('/index.html', artifact.content);

    // Start a lightweight static file server in the background
    // Python's http.server is available in the default template
    const handle = await sandbox.commands.run(
      `python3 -m http.server ${SANDBOX_SERVE_PORT} --directory /`,
      { background: true },
    );

    const shareUrl = sandbox.getHost(SANDBOX_SERVE_PORT);
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;

    await db.prepare(`
      UPDATE artifacts
      SET sandbox_id = ?, share_url = ?, sandbox_expires_at = ?,
          updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(sandbox.sandboxId, shareUrl, expiresAt, id, userId);

    // Schedule automatic cleanup
    const ttlMs = Math.min(expiresInHours * 60 * 60 * 1000, DEFAULT_SANDBOX_TTL_MS);
    setTimeout(() => {
      this.destroySandboxShare(id, userId).catch(() => {});
    }, ttlMs);

    return { shareUrl, sandboxId: sandbox.sandboxId, expiresAt };
  }

  /**
   * Destroy the E2B sandbox for an artifact share.
   */
  async destroySandboxShare(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    const artifact = this.get(id, userId);
    if (!artifact?.sandboxId) return false;

    try {
      await SandboxApi.kill(artifact.sandboxId);
    } catch {
      // Already dead or not found
    }

    await db.prepare(`
      UPDATE artifacts
      SET sandbox_id = NULL, share_url = NULL, sandbox_expires_at = NULL,
          updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return true;
  }
  /**
   * Create a new artifact
   */
  async create(
    userId: string,
    type: Artifact['type'],
    title: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Artifact> {
    const db = getDb();
    const id = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO artifacts (id, user_id, type, title, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, title, content, JSON.stringify(metadata || {}));

    return {
      id,
      userId,
      type,
      title,
      content,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Get artifact by ID
   */
  get(id: string, userId: string): Artifact | null {
    const db = getDb();
    const artifact = await db.prepare(`
      SELECT * FROM artifacts WHERE id = ? AND user_id = ?
    `).get(id, userId) as any;

    if (!artifact) return null;

    return {
      id: artifact.id,
      userId: artifact.user_id,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      metadata: JSON.parse(artifact.metadata || '{}'),
      shareHash: artifact.share_hash,
      shareExpiresAt: artifact.share_expires_at,
      sandboxId: artifact.sandbox_id,
      shareUrl: artifact.share_url,
      sandboxExpiresAt: artifact.sandbox_expires_at,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
    };
  }

  /**
   * List user's artifacts
   */
  list(userId: string, limit: number = 50): Artifact[] {
    const db = getDb();
    const artifacts = await db.prepare(`
      SELECT * FROM artifacts
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    return artifacts.map(a => ({
      id: a.id,
      userId: a.user_id,
      type: a.type,
      title: a.title,
      content: a.content,
      metadata: JSON.parse(a.metadata || '{}'),
      shareHash: a.share_hash,
      shareExpiresAt: a.share_expires_at,
      sandboxId: a.sandbox_id,
      shareUrl: a.share_url,
      sandboxExpiresAt: a.sandbox_expires_at,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));
  }

  /**
   * Update artifact
   */
  update(
    id: string,
    userId: string,
    updates: Partial<Pick<Artifact, 'title' | 'content' | 'metadata'>>
  ): boolean {
    const db = getDb();
    const result = await db.prepare(`
      UPDATE artifacts
      SET title = COALESCE(?, title),
          content = COALESCE(?, content),
          metadata = COALESCE(?, metadata),
          updated_at = unixepoch()
      WHERE id = ? AND user_id = ?
    `).run(
      updates.title || null,
      updates.content || null,
      updates.metadata ? JSON.stringify(updates.metadata) : null,
      id,
      userId
    );

    return result.changes > 0;
  }

  /**
   * Delete artifact
   */
  delete(id: string, userId: string): boolean {
    const db = getDb();
    const result = await db.prepare(`
      DELETE FROM artifacts WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }

  /**
   * Generate temporary share link
   */
  createShareLink(
    id: string,
    userId: string,
    expiresInHours: number = 24
  ): { shareUrl: string; expiresAt: number } | null {
    const db = getDb();
    const artifact = this.get(id, userId);
    if (!artifact) return null;

    // Generate hash-based share ID
    const shareHash = createHash('sha256')
      .update(`${id}-${userId}-${Date.now()}`)
      .digest('hex')
      .slice(0, 12);

    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;

    await db.prepare(`
      UPDATE artifacts
      SET share_hash = ?, share_expires_at = ?
      WHERE id = ? AND user_id = ?
    `).run(shareHash, expiresAt, id, userId);

    return {
      shareUrl: `/share/${shareHash}`,
      expiresAt,
    };
  }

  /**
   * Get artifact by share hash (public access)
   */
  getByShareHash(hash: string): Artifact | null {
    const db = getDb();
    const artifact = await db.prepare(`
      SELECT * FROM artifacts
      WHERE share_hash = ?
      AND (share_expires_at IS NULL OR share_expires_at > ?)
    `).get(hash, Date.now()) as any;

    if (!artifact) return null;

    return {
      id: artifact.id,
      userId: artifact.user_id,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      metadata: JSON.parse(artifact.metadata || '{}'),
      shareHash: artifact.share_hash,
      shareExpiresAt: artifact.share_expires_at,
      sandboxId: artifact.sandbox_id,
      shareUrl: artifact.share_url,
      sandboxExpiresAt: artifact.sandbox_expires_at,
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
    };
  }

  /**
   * Revoke share link
   */
  revokeShareLink(id: string, userId: string): boolean {
    const db = getDb();
    const result = await db.prepare(`
      UPDATE artifacts
      SET share_hash = NULL, share_expires_at = NULL
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }
}

export const artifactService = new ArtifactService();
