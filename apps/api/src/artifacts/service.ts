import { getDb } from '../db/init.js';
import { createHash } from 'crypto';

interface Artifact {
  id: string;
  userId: string;
  type: 'html' | 'pdf' | 'markdown' | 'code';
  title: string;
  content: string;
  metadata?: Record<string, any>;
  shareHash?: string;
  shareExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

class ArtifactService {
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

    db.prepare(`
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
    const artifact = db.prepare(`
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
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
    };
  }

  /**
   * List user's artifacts
   */
  list(userId: string, limit: number = 50): Artifact[] {
    const db = getDb();
    const artifacts = db.prepare(`
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
    const result = db.prepare(`
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
    const result = db.prepare(`
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

    db.prepare(`
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
    const artifact = db.prepare(`
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
      createdAt: artifact.created_at,
      updatedAt: artifact.updated_at,
    };
  }

  /**
   * Revoke share link
   */
  revokeShareLink(id: string, userId: string): boolean {
    const db = getDb();
    const result = db.prepare(`
      UPDATE artifacts
      SET share_hash = NULL, share_expires_at = NULL
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }
}

export const artifactService = new ArtifactService();
