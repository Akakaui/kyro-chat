import { getDb } from '../db/init.js';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';

/**
 * Store a document chunk with its embedding in sqlite-vec
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

  // Convert Float32Array to Buffer for sqlite-vec
  const embeddingBuffer = Buffer.from(embedding.buffer);

  db.prepare(`
    INSERT INTO kb_chunks (id, kb_id, chunk_index, content, embedding, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, kbId, chunkIndex, content, embeddingBuffer, JSON.stringify(metadata));

  return id;
}

/**
 * Search for similar chunks using cosine similarity
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

  // Get chunks, optionally scoped to user's knowledge base
  const chunks = userId
    ? db.prepare(`
        SELECT kc.id, kc.content, kc.embedding, kc.metadata
        FROM kb_chunks kc
        JOIN knowledge_bases kb ON kc.kb_id = kb.id
        WHERE kc.kb_id = ? AND kb.user_id = ?
      `).all(kbId, userId) as Array<{
        id: string;
        content: string;
        embedding: Buffer;
        metadata: string;
      }>
    : db.prepare(`
        SELECT id, content, embedding, metadata
        FROM kb_chunks
        WHERE kb_id = ?
      `).all(kbId) as Array<{
        id: string;
        content: string;
        embedding: Buffer;
        metadata: string;
      }>;

  // Calculate similarity scores
  const scoredChunks = chunks.map(chunk => {
    // Convert Buffer back to Float32Array
    const chunkEmbedding = new Float32Array(chunk.embedding.buffer);
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);

    return {
      id: chunk.id,
      content: chunk.content,
      score,
      metadata: JSON.parse(chunk.metadata || '{}'),
    };
  });

  // Sort by score and return top results
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Delete all chunks for a knowledge base
 */
export function deleteChunks(kbId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM kb_chunks WHERE kb_id = ?').run(kbId);
}

/**
 * Get chunk count for a knowledge base
 */
export function getChunkCount(kbId: string): number {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM kb_chunks WHERE kb_id = ?
  `).get(kbId) as { count: number };
  return result.count;
}
