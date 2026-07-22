import { getDb } from '../db/init.js';

interface MemoryEntry {
  id: string;
  userId: string;
  agentId?: string;
  type: 'fact' | 'preference' | 'context' | 'instruction';
  content: string;
  metadata?: Record<string, any>;
  importance: number; // 1-10
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

class MemoryService {
  /**
   * Store a memory entry
   */
  store(
    userId: string,
    content: string,
    type: MemoryEntry['type'] = 'fact',
    options: {
      agentId?: string;
      metadata?: Record<string, any>;
      importance?: number;
    } = {}
  ): string {
    const db = getDb();
    const id = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO memory_entries (id, user_id, agent_id, type, content, metadata, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      options.agentId || null,
      type,
      content,
      JSON.stringify(options.metadata || {}),
      options.importance || 5
    );

    return id;
  }

  /**
   * Search memories by content
   */
  search(
    userId: string,
    query: string,
    options: {
      agentId?: string;
      type?: MemoryEntry['type'];
      limit?: number;
      minImportance?: number;
    } = {}
  ): MemoryEntry[] {
    const db = getDb();
    const { agentId, type, limit = 10, minImportance = 1 } = options;

    let sql = `
      SELECT * FROM memory_entries
      WHERE user_id = ? AND importance >= ?
      AND content LIKE ?
    `;
    const params: any[] = [userId, minImportance, `%${query}%`];

    if (agentId) {
      sql += ` AND (agent_id = ? OR agent_id IS NULL)`;
      params.push(agentId);
    }

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY importance DESC, last_accessed_at DESC LIMIT ?`;
    params.push(limit);

    const memories = await db.prepare(sql).all(...params) as any[];

    // Update access count
    for (const memory of memories) {
      await db.prepare(`
        UPDATE memory_entries
        SET access_count = access_count + 1, last_accessed_at = unixepoch()
        WHERE id = ?
      `).run(memory.id);
    }

    return memories.map(m => ({
      id: m.id,
      userId: m.user_id,
      agentId: m.agent_id,
      type: m.type,
      content: m.content,
      metadata: JSON.parse(m.metadata || '{}'),
      importance: m.importance,
      createdAt: m.created_at,
      lastAccessedAt: m.last_accessed_at,
      accessCount: m.access_count,
    }));
  }

  /**
   * Get recent memories
   */
  getRecent(
    userId: string,
    options: {
      agentId?: string;
      limit?: number;
    } = {}
  ): MemoryEntry[] {
    const db = getDb();
    const { agentId, limit = 20 } = options;

    let sql = `
      SELECT * FROM memory_entries
      WHERE user_id = ?
    `;
    const params: any[] = [userId];

    if (agentId) {
      sql += ` AND (agent_id = ? OR agent_id IS NULL)`;
      params.push(agentId);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const memories = await db.prepare(sql).all(...params) as any[];

    return memories.map(m => ({
      id: m.id,
      userId: m.user_id,
      agentId: m.agent_id,
      type: m.type,
      content: m.content,
      metadata: JSON.parse(m.metadata || '{}'),
      importance: m.importance,
      createdAt: m.created_at,
      lastAccessedAt: m.last_accessed_at,
      accessCount: m.access_count,
    }));
  }

  /**
   * Get memory context for agent
   */
  getContext(userId: string, agentId?: string, maxTokens: number = 2000): string {
    const memories = this.getRecent(userId, { agentId, limit: 50 });

    if (memories.length === 0) return '';

    const contextParts: string[] = ['## Agent Memory'];

    for (const memory of memories) {
      const typeLabel = memory.type.charAt(0).toUpperCase() + memory.type.slice(1);
      contextParts.push(`- [${typeLabel}] ${memory.content}`);
    }

    const context = contextParts.join('\n');

    // Rough token estimate
    const estimatedTokens = Math.ceil(context.length / 4);
    if (estimatedTokens > maxTokens) {
      return contextParts.slice(0, Math.floor(maxTokens / 20)).join('\n');
    }

    return context;
  }

  /**
   * Update memory
   */
  update(
    id: string,
    userId: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'type'>>
  ): boolean {
    const db = getDb();
    const result = await db.prepare(`
      UPDATE memory_entries
      SET content = COALESCE(?, content),
          importance = COALESCE(?, importance),
          type = COALESCE(?, type)
      WHERE id = ? AND user_id = ?
    `).run(
      updates.content || null,
      updates.importance || null,
      updates.type || null,
      id,
      userId
    );

    return result.changes > 0;
  }

  /**
   * Delete memory
   */
  delete(id: string, userId: string): boolean {
    const db = getDb();
    const result = await db.prepare(`
      DELETE FROM memory_entries WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }

  /**
   * Clear old/low-importance memories
   */
  cleanup(userId: string, maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    const db = getDb();
    const cutoff = Math.floor((Date.now() - maxAge) / 1000);

    const result = await db.prepare(`
      DELETE FROM memory_entries
      WHERE user_id = ?
      AND importance < 3
      AND last_accessed_at < ?
    `).run(userId, cutoff);

    return result.changes;
  }
}

export const memoryService = new MemoryService();
