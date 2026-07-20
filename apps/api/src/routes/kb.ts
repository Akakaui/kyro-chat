import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { storeChunk, searchChunks, deleteChunks } from '../kb/vector.js';
import { parseBuffer, chunkDocument } from '../kb/parser.js';
import { apiLimit } from '../middleware/rateLimit.js';

export const kbRoutes = new Hono();

// Apply general API rate limit to all KB routes
kbRoutes.use('*', apiLimit);

// Upload file to knowledge base
kbRoutes.post('/upload', async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const agentId = formData.get('agentId') as string | null;
  const projectId = formData.get('projectId') as string | null;
  const kbId = formData.get('kbId') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // Validate project exists if provided
  if (projectId) {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, user.id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
  }

  // Read file content
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await parseBuffer(buffer, file.name, file.type);

  // Chunk the text
  const chunks = chunkDocument(text);

  // Create KB source record
  const finalKbId = kbId || crypto.randomUUID();
  const db = getDb();

  db.prepare(`
    INSERT INTO kb_chunks (id, kb_id, user_id, agent_id, source_file, content, chunk_index, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), finalKbId, user.id, agentId, file.name, '', 0, projectId);

  // Store chunks with embeddings
  let storedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      await storeChunk(finalKbId, i, chunks[i], {
        sourceFile: file.name,
        mimeType: file.type,
        chunkTotal: chunks.length,
        projectId,
      });
      storedCount++;
    } catch (err) {
      console.error(`Failed to store chunk ${i}:`, err);
    }
  }

  return c.json({
    id: finalKbId,
    filename: file.name,
    chunks: storedCount,
    totalChunks: chunks.length,
  });
});

// Search knowledge base
kbRoutes.post('/search', async (c) => {
  const user = c.get('user');
  const { query, agentId, projectId, limit = 5 } = await c.req.json();

  if (!query) {
    return c.json({ error: 'Query required' }, 400);
  }

  const db = getDb();

  // Get KB sources for this user (optionally scoped to project)
  let sources;
  if (projectId) {
    sources = db.prepare(`
      SELECT DISTINCT kb_id FROM kb_chunks WHERE user_id = ? AND project_id = ?
    `).all(user.id, projectId) as Array<{ kb_id: string }>;
  } else {
    sources = db.prepare(`
      SELECT DISTINCT kb_id FROM kb_chunks WHERE user_id = ?
    `).all(user.id) as Array<{ kb_id: string }>;
  }

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

// List KB sources (supports project filtering)
kbRoutes.get('/sources', async (c) => {
  const user = c.get('user');
  const projectId = c.req.query('projectId');
  const db = getDb();

  let query = `
    SELECT
      kb_id,
      source_file,
      project_id,
      COUNT(*) as chunk_count,
      MAX(created_at) as last_updated
    FROM kb_chunks
    WHERE user_id = ?
  `;
  const params: any[] = [user.id];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }

  query += ' GROUP BY kb_id, source_file ORDER BY last_updated DESC';

  const sources = db.prepare(query).all(...params);

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
    DELETE FROM kb_chunks WHERE kb_id = ? AND user_id = ?
  `).run(kbId, user.id);

  return c.json({ success: true });
});

// Get context for agent (RAG injection)
kbRoutes.post('/context', async (c) => {
  const user = c.get('user');
  const { query, agentId, projectId, maxTokens = 2000 } = await c.req.json();

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
    totalTokens: Math.ceil(context.length / 4),
  });
});

// ─── Agent-KB Permission Endpoints ───

// List all KB permissions for an agent
kbRoutes.get('/agent-permissions/:agentId', async (c) => {
  const user = c.get('user');
  const agentId = c.req.param('agentId');
  const db = getDb();

  const permissions = db.prepare(`
    SELECT akp.id, akp.agent_id, akp.kb_id, akp.permission, akp.created_at,
      kbs.source_file as kb_name
    FROM agent_kb_permissions akp
    LEFT JOIN (
      SELECT DISTINCT kb_id, source_file FROM kb_chunks WHERE user_id = ?
    ) kbs ON akp.kb_id = kbs.kb_id
    WHERE akp.agent_id = ? AND akp.user_id = ?
  `).all(user.id, agentId, user.id);

  return c.json({ permissions });
});

// Set permission (agent_id, kb_id, permission: allow/ask/deny)
kbRoutes.put('/agent-permissions', async (c) => {
  const user = c.get('user');
  const { agentId, kbId, permission } = await c.req.json();

  if (!agentId || !kbId) {
    return c.json({ error: 'agentId and kbId are required' }, 400);
  }

  if (!permission || !['allow', 'ask', 'deny'].includes(permission)) {
    return c.json({ error: 'permission must be allow, ask, or deny' }, 400);
  }

  const db = getDb();

  // Verify agent exists
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, user.id);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const id = crypto.randomUUID();

  // Upsert permission
  const existing = db.prepare(`
    SELECT id FROM agent_kb_permissions WHERE agent_id = ? AND kb_id = ?
  `).get(agentId, kbId) as any;

  if (existing) {
    db.prepare(`
      UPDATE agent_kb_permissions SET permission = ? WHERE agent_id = ? AND kb_id = ?
    `).run(permission, agentId, kbId);
  } else {
    db.prepare(`
      INSERT INTO agent_kb_permissions (id, agent_id, kb_id, permission, user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, agentId, kbId, permission, user.id);
  }

  return c.json({ success: true, permission });
});
