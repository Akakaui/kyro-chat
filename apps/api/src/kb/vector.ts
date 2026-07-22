import { getDb } from '../db/init.js';
import { generateEmbedding } from './embeddings.js';

/**
 * Store a document chunk with its embedding in pgvector
 */
export async function storeChunk(
  kbId: string,
  chunkIndex: number,
  content: string,
  metadata: Record<string, any> = {}
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();

  // Generate embedding
  const embedding = await generateEmbedding(content);

  // Format for pgvector: '[1.1, 2.2, ...]'
  const embeddingStr = JSON.stringify(Array.from(embedding));

  await db.prepare(`
    INSERT INTO kb_chunks (id, kb_id, chunk_index, content, embedding, metadata)
    VALUES (?, ?, ?, ?, ?::vector, ?)
  `).run(id, kbId, chunkIndex, content, embeddingStr, JSON.stringify(metadata));

  return id;
}

/**
 * Search for similar chunks using pgvector cosine distance
 */
export async function searchChunks(
  kbId: string,
  query: string,
  limit: number = 5,
  userId?: string
): Promise<Array<{
  id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}>> {
  const db = getDb();

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  const queryEmbeddingStr = JSON.stringify(Array.from(queryEmbedding));

  // Perform vector search directly in PostgreSQL using <=> operator
  let results;
  
  if (userId) {
    results = await db.prepare(`
        SELECT kc.id, kc.content, kc.metadata, 1 - (kc.embedding <=> ?::vector) as score
        FROM kb_chunks kc
        JOIN knowledge_bases kb ON kc.kb_id = kb.id
        WHERE kc.kb_id = ? AND kb.user_id = ?
        ORDER BY kc.embedding <=> ?::vector
        LIMIT ?
      `).all(queryEmbeddingStr, kbId, userId, queryEmbeddingStr, limit) as Array<{
        id: string;
        content: string;
        score: number;
        metadata: string;
      }>;
  } else {
    results = await db.prepare(`
        SELECT id, content, metadata, 1 - (embedding <=> ?::vector) as score
        FROM kb_chunks
        WHERE kb_id = ?
        ORDER BY embedding <=> ?::vector
        LIMIT ?
      `).all(queryEmbeddingStr, kbId, queryEmbeddingStr, limit) as Array<{
        id: string;
        content: string;
        score: number;
        metadata: string;
      }>;
  }

  return results.map(row => ({
    id: row.id,
    content: row.content,
    score: Number(row.score),
    metadata: JSON.parse(row.metadata || '{}')
  }));
}

/**
 * Delete all chunks for a knowledge base
 */
export async function deleteChunks(kbId: string): Promise<void> {
  const db = getDb();
  await db.prepare('DELETE FROM kb_chunks WHERE kb_id = ?').run(kbId);
}

/**
 * Get chunk count for a knowledge base
 */
export async function getChunkCount(kbId: string): Promise<number> {
  const db = getDb();
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM kb_chunks WHERE kb_id = ?
  `).get(kbId) as { count: string | number };
  return Number(result.count);
}
