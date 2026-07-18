import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { storeChunk, searchChunks, deleteChunks } from '../kb/vector.js';
import { parseBuffer, chunkDocument } from '../kb/parser.js';

export const kbRoutes = new Hono();

// Upload file to knowledge base
kbRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const agentId = formData.get('agentId') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // Read file content
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await parseBuffer(buffer, file.name, file.type);

  // Chunk the text
  const chunks = chunkDocument(text);

  // Create KB source record
  const kbId = crypto.randomUUID();
  const db = getDb();

  db.prepare(`
    INSERT INTO kb_chunks (id, user_id, agent_id, source_file, content, chunk_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(kbId, user.id, agentId, file.name, '', 0);

  // Store chunks with embeddings
  let storedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      await storeChunk(kbId, i, chunks[i], {
        sourceFile: file.name,
        mimeType: file.type,
        chunkTotal: chunks.length,
      });
      storedCount++;
    } catch (err) {
      console.error(`Failed to store chunk ${i}:`, err);
    }
  }

  return c.json({
    id: kbId,
    filename: file.name,
    chunks: storedCount,
    totalChunks: chunks.length,
  });
});

// Search knowledge base
kbRoutes.post('/search', async (c) => {
  const user = c.get('user');
  const { query, agentId, limit = 5 } = await c.req.json();

  if (!query) {
    return c.json({ error: 'Query required' }, 400);
  }

  const db = getDb();

  // Get all KB sources for this user
  const sources = db.prepare(`
    SELECT DISTINCT kb_id FROM kb_chunks WHERE user_id = ?
  `).all(user.id) as Array<{ kb_id: string }>;

  // Search across all sources
  const allResults: Array<{
    id: string;
    content: string;
    score: number;
    metadata: Record<string, any>;
  }> = [];

  for (const source of sources) {
    const results = await searchChunks(source.kb_id, query, limit);
    allResults.push(...results);
  }

  // Sort and deduplicate
  const sorted = allResults
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return c.json({ results: sorted });
});

// List KB sources
kbRoutes.get('/sources', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const sources = db.prepare(`
    SELECT
      kb_id,
      source_file,
      COUNT(*) as chunk_count,
      MAX(created_at) as last_updated
    FROM kb_chunks
    WHERE user_id = ?
    GROUP BY kb_id, source_file
    ORDER BY last_updated DESC
  `).all(user.id);

  return c.json({ sources });
});

// Delete KB source
kbRoutes.delete('/sources/:kbId', async (c) => {
  const user = c.get('user');
  const kbId = c.req.param('kbId');
  const db = getDb();

  // Delete chunks
  deleteChunks(kbId);

  // Delete source record
  db.prepare(`
    DELETE FROM kb_chunks WHERE id = ? AND user_id = ?
  `).run(kbId, user.id);

  return c.json({ success: true });
});

// Get context for agent (RAG injection)
kbRoutes.post('/context', async (c) => {
  const user = c.get('user');
  const { query, agentId, maxTokens = 2000 } = await c.req.json();

  const results = await searchChunks('', query, 10);

  // Build context string
  const context = results
    .map((r, i) => `[Source ${i + 1}] (score: ${r.score.toFixed(2)})\n${r.content}`)
    .join('\n\n---\n\n');

  return c.json({
    context,
    sources: results.map(r => ({
      score: r.score,
      metadata: r.metadata,
    })),
    totalTokens: Math.ceil(context.length / 4), // Rough estimate
  });
});
