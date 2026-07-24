import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { getDb } from '../db/init.js';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { getModel, PROVIDER_MODELS } from '../agent/providers.js';
import type { AgentConfig } from '../agent/types.js';
import { streamText } from 'ai';
import { sandboxService } from '../sandbox/service.js';
import { dockerSandbox } from '../services/sandbox/docker.js';
import { chatLimit } from '../middleware/rateLimit.js';

export const chatRoutes = new Hono();

// Create new conversation
chatRoutes.post('/conversations', async (c) => {
  const user = c.get('user');
  const { title, model, projectId } = await c.req.json();
  const id = crypto.randomUUID();

  // Validate project if provided
  if (projectId) {
    const db = getDb();
    const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, user.id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
  }

  const db = getDb();
  await db.prepare(`
    INSERT INTO conversations (id, user_id, title, model, project_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, user.id, title || 'New conversation', model || 'claude-sonnet-4-20250514', projectId || null);

  return c.json({ id, title, model, projectId });
});

// List conversations
chatRoutes.get('/conversations', async (c) => {
  const user = c.get('user');
  const projectId = c.req.query('projectId');
  const db = getDb();

  let query = `
    SELECT id, title, model, project_id, created_at, updated_at
    FROM conversations
    WHERE user_id = ?
  `;
  const params: any[] = [user.id];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY updated_at DESC';

  const conversations = await db.prepare(query).all(...params);

  return c.json({ conversations });
});

// Get conversation with messages
chatRoutes.get('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const db = getDb();

  const conversation = await db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(conversationId, user.id);

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const messages = await db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);

  return c.json({ conversation, messages });
});

// Send message and get streaming response with agent orchestration
chatRoutes.post('/conversations/:id/messages', chatLimit, async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const { content, agentId, provider = 'anthropic', apiKey, model, incognito, chatMode } = await c.req.json();

  // Body size limit
  if (content?.length > 100000) {
    return c.json({ error: 'Message too large' }, 413);
  }

  const db = getDb();

  // Verify conversation exists
  const conversation = await db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(conversationId, user.id) as any;

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  // Save user message (skip if incognito)
  let userMsgId: string | undefined;
  if (!incognito) {
    userMsgId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, agent_id)
      VALUES (?, ?, 'user', ?, ?)
    `).run(userMsgId, conversationId, content, agentId || null);
  }

  // Get conversation history for context
  const history = await db.prepare(`
    SELECT role, content FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId) as Array<{ role: string; content: string }>;

  // Get agent details if agentId provided
  let agent = null;
  let systemPrompt = 'You are a helpful AI assistant.';
  let allowedKBContext = '';
  let pendingAskKBs: Array<{ kb_id: string; source_file: string }> = [];

  // Check global KB setting
  const kbGlobalSetting = await db.prepare(`
    SELECT value FROM user_settings WHERE user_id = ? AND key = 'kb_global_enabled'
  `).get(user.id) as any;
  const kbGlobalEnabled = kbGlobalSetting ? kbGlobalSetting.value === 'true' : true;

  if (agentId) {
    agent = await db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, user.id) as any;
    if (agent?.system_prompt) {
      systemPrompt = agent.system_prompt;
    }

    // Auto-inject project custom instructions into system prompt
    if (conversation.project_id) {
      const project = await db.prepare(`
        SELECT custom_instructions FROM projects WHERE id = ? AND user_id = ?
      `).get(conversation.project_id, user.id) as any;
      if (project?.custom_instructions) {
        systemPrompt = `${project.custom_instructions}\n\n${systemPrompt}`;
      }
    }

    // Gather KB permissions and auto-inject "allow" KB content
    // Only if global KB toggle is enabled
    if (kbGlobalEnabled) {
      const kbPerms = await db.prepare(`
        SELECT akp.kb_id, akp.permission, kbs.source_file
        FROM agent_kb_permissions akp
        LEFT JOIN (
          SELECT DISTINCT kb_id, source_file FROM kb_chunks WHERE user_id = ?
        ) kbs ON akp.kb_id = kbs.kb_id
        WHERE akp.agent_id = ?
      `).all(user.id, agentId) as Array<{ kb_id: string; permission: string; source_file: string }>;

      const { searchChunks } = await import('../kb/vector.js');
      const kbContextParts: string[] = [];

      for (const kb of kbPerms) {
        if (kb.permission === 'allow') {
          // Auto-inject allowed KBs
          try {
            const results = await searchChunks(kb.kb_id, content, 3, user.id);
            if (results.length > 0) {
              const kbContent = results.map((r: any) => r.content).join('\n');
              kbContextParts.push(`[KB: ${kb.source_file}]\n${kbContent}`);
            }
          } catch (err) {
            console.error(`Failed to fetch KB ${kb.kb_id}:`, err);
          }
        } else if (kb.permission === 'ask') {
          // Track "ask" KBs for permission request
          pendingAskKBs.push({ kb_id: kb.kb_id, source_file: kb.source_file });
        }
        // "deny" KBs are silently skipped
      }

      if (kbContextParts.length > 0) {
        allowedKBContext = `\n\nKnowledge Base Context:\n${kbContextParts.join('\n\n---\n\n')}`;
      }
    }
  }

  // ── Resolve provider, API key, and base URL ──────────────────────────────
  // If the frontend sends a BYOK model (format: "provider/model"), split it
  const resolvedModel = model || conversation.model || 'claude-sonnet-4-20250514';
  let resolvedProvider = provider || 'anthropic';
  let resolvedApiKey = apiKey;
  let resolvedBaseURL: string | undefined;

  // Try to resolve from user's stored API keys
  const userKeys = await db.prepare(`
    SELECT provider, encrypted_key, base_url, custom_model FROM api_keys WHERE user_id = ?
  `).all(user.id) as Array<{ provider: string; encrypted_key: string; base_url: string | null; custom_model: string | null }>;

  if (resolvedApiKey) {
    // Frontend sent a key directly (legacy flow) — still resolve baseURL
    const match = userKeys.find(k => k.provider === resolvedProvider);
    if (match?.base_url) resolvedBaseURL = match.base_url;
  } else {
    // No key sent — find from stored keys
    // First try: exact provider match
    let found = userKeys.find(k => k.provider === resolvedProvider);

    // Second try: match BYOK model format (provider/modelId)
    if (!found) {
      const [byokProvider] = resolvedModel.split('/');
      if (byokProvider) {
        found = userKeys.find(k => k.provider === byokProvider);
        if (found) resolvedProvider = byokProvider;
      }
    }

    // Third try: any available key
    if (!found && userKeys.length > 0) {
      found = userKeys[0];
      resolvedProvider = found.provider;
    }

    if (found) {
      const { decryptApiKey } = await import('../lib/encryption.js');
      resolvedApiKey = await decryptApiKey(found.encrypted_key);
      if (found.base_url) resolvedBaseURL = found.base_url;
    }
  }

  // Final fallback to env keys
  if (!resolvedApiKey) {
    if (process.env.ANTHROPIC_API_KEY) {
      resolvedApiKey = process.env.ANTHROPIC_API_KEY;
      resolvedProvider = resolvedProvider || 'anthropic';
    } else if (process.env.OPENAI_API_KEY) {
      resolvedApiKey = process.env.OPENAI_API_KEY;
      resolvedProvider = resolvedProvider || 'openai';
    } else if (process.env.GOOGLE_AI_API_KEY) {
      resolvedApiKey = process.env.GOOGLE_AI_API_KEY;
      resolvedProvider = resolvedProvider || 'google';
    }
  }

  if (!resolvedApiKey) {
    return c.json({ error: 'No API key configured. Please add your API key in Settings.' }, 400);
  }

  // Auto-create sandbox for tool execution (invisible to user)
  // Try E2B first, fall back to Docker
  let sandboxId: string | undefined;
  let sandboxProvider: 'e2b' | 'docker' = 'e2b';
  try {
    const session = await sandboxService.createSession(user.id, 'node');
    sandboxId = session.id;
    sandboxProvider = 'e2b';
  } catch (error) {
    // E2B unavailable — try Docker
    if (dockerSandbox.isAvailable?.()) {
      try {
        sandboxId = `docker_${user.id}_${Date.now()}`;
        sandboxProvider = 'docker';
        console.log(`[Chat] Using Docker sandbox for user ${user.id}`);
      } catch (dockerError) {
        console.error('Docker sandbox also failed:', dockerError);
        return c.json({ error: 'No sandbox available. Configure E2B_API_KEY or ensure Docker is running.' }, 503);
      }
    } else {
      console.error('Failed to create sandbox for conversation:', error);
      return c.json({ error: 'Sandbox is required but failed to initialize. Please check E2B_API_KEY is configured or Docker is available.' }, 503);
    }
  }

  // Track files before agent execution for artifact capture
  const filesBefore = sandboxId ? await sandboxService.getTemporaryFiles(sandboxId).catch(() => []) : [];

  // Stream response using agent orchestrator
  return stream(c, async (streamWriter) => {
    let fullResponse = '';

    // Send pending KB permission requests to frontend before streaming
    if (pendingAskKBs.length > 0) {
      const metaEvent = `__META__:${JSON.stringify({ pendingAskKBs })}\n`;
      await streamWriter.write(metaEvent);
    }

    // Inject KB context into system prompt
    const enrichedSystemPrompt = systemPrompt + allowedKBContext;

    try {
      if (agent) {
        // Use agent orchestrator for agentic responses
        // Set up tool permission checking from agent's tool_permissions
        let toolPermissions: Record<string, 'allow' | 'deny' | 'ask'> = {};
        if (agent.id) {
          const agentRow = await db.prepare(`SELECT tool_permissions FROM agents WHERE id = ? AND user_id = ?`).get(agent.id, user.id) as { tool_permissions: string } | undefined;
          if (agentRow?.tool_permissions) {
            try { toolPermissions = JSON.parse(agentRow.tool_permissions); } catch {}
          }
        }

        const config: AgentConfig = {
          agent: { ...agent, systemPrompt: enrichedSystemPrompt, toolPermissions },
          apiKey: resolvedApiKey,
          provider: resolvedProvider,
          model: resolvedModel,
          baseURL: resolvedBaseURL,
          userId: user.id,
          sessionId: conversationId,
          sandboxId,
          sandboxProvider,
        };

        const orchestrator = new AgentOrchestrator(config);

        // Override onBeforeTool to check per-agent tool permissions
        const origOnBeforeTool = orchestrator['hooks'].onBeforeTool;
        orchestrator['hooks'].onBeforeTool = async (ctx: any) => {
          const perm = toolPermissions[ctx.toolName];
          if (perm === 'deny') {
            return { block: true, reason: `Tool "${ctx.toolName}" is denied by agent permissions` };
          }
          // 'ask' or undefined → allow (permission system handled elsewhere)
          return origOnBeforeTool?.(ctx);
        };

        // Add history to orchestrator
        for (const msg of history.slice(0, -1)) {
          orchestrator.getState().messages.push({
            role: msg.role as any,
            content: msg.content,
          });
        }

        for await (const chunk of orchestrator.runStream(content)) {
          fullResponse += chunk;
          await streamWriter.write(chunk);
        }

        // After stream completes, send tool usage summary
        const state = orchestrator.getState();
        if (state.toolsUsed.length > 0) {
          const toolSummary = `\n\n__TOOLS_USED__:${JSON.stringify(state.toolsUsed.map((t, i) => ({
            id: `tool-${i}`,
            name: t.tool,
            input: t.args,
            output: typeof t.result === 'string' ? t.result : JSON.stringify(t.result).slice(0, 1000),
          })))}`;
          await streamWriter.write(toolSummary);
        }
      } else {
        // Direct streaming without agent (simpler path)
        const aiModel = getModel(resolvedProvider, resolvedApiKey, resolvedModel, resolvedBaseURL);

        const result = streamText({
          model: aiModel,
          system: enrichedSystemPrompt,
          messages: history.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
        });

        for await (const chunk of result.textStream) {
          fullResponse += chunk;
          await streamWriter.write(chunk);
        }
      }

      // Capture any new files from sandbox as artifacts
      if (sandboxId) {
        const filesAfter = await sandboxService.getTemporaryFiles(sandboxId).catch(() => []);
        const newFiles = filesAfter.filter(f =>
          !filesBefore.some(bf => bf.path === f.path)
        );

        if (newFiles.length > 0) {
          const { artifactService } = await import('../artifacts/service.js');
          const artifacts = [];
          for (const file of newFiles) {
            try {
              const fileContent = await sandboxService.readFile(sandboxId, file.path);
              const artifact = await artifactService.create(
                user.id,
                detectArtifactType(file.path),
                file.name,
                fileContent,
                { sandboxId, sandboxPath: file.path }
              );
              artifacts.push(artifact);
            } catch {
              // Skip files that can't be read
            }
          }

          if (artifacts.length > 0) {
            const artifactRef = `\n\n__ARTIFACTS__:${JSON.stringify(artifacts.map(a => ({
              id: a.id,
              title: a.title,
              type: a.type,
              size: a.content?.length || 0,
            })))}`;
            await streamWriter.write(artifactRef);
          }
        }

        // Send sandbox reference for file browsing
        const sandboxRef = `\n\n__SANDBOX_ID__:${sandboxId}`;
        await streamWriter.write(sandboxRef);
      }

      // Save assistant message (skip if incognito)
      if (!incognito) {
        const assistantMsgId = crypto.randomUUID();
        let savedResponse = fullResponse;
        const markers = ['__TOOLS_USED__:', '__ARTIFACTS__:', '__SANDBOX_ID__:', '__PERMISSION_REQUIRED__:', '__QUESTION_REQUIRED__:'];
        for (const marker of markers) {
          const idx = savedResponse.indexOf(marker);
          if (idx !== -1) {
            savedResponse = savedResponse.slice(0, idx);
          }
        }
        await db.prepare(`
          INSERT INTO messages (id, conversation_id, role, content, agent_id)
          VALUES (?, ?, 'assistant', ?, ?)
        `).run(assistantMsgId, conversationId, savedResponse, agentId || null);

        // Update conversation timestamp
        await db.prepare(`
          UPDATE conversations SET updated_at = strftime('%s', 'now') WHERE id = ?
        `).run(conversationId);
      }
    } catch (err: any) {
      const { sanitizeError } = await import('../lib/sanitize-error.js');
      const errorMsg = `Error: ${sanitizeError(err)}`;
      await streamWriter.write(errorMsg);
      fullResponse = errorMsg;
    } finally {
      // Keep sandbox alive for user to browse files
      // Cleanup happens on timeout or manual destroy
    }
  });
});

// Helper function to detect artifact type from file extension
function detectArtifactType(path: string): 'html' | 'pdf' | 'markdown' | 'code' {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html';
    case 'pdf':
      return 'pdf';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'code';
  }
}

// Update conversation (star, archive, rename)
chatRoutes.patch('/conversations/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { title, starred, archived } = await c.req.json();
  const db = getDb();

  const conv = await db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!conv) return c.json({ error: 'Not found' }, 404);

  const sets: string[] = [];
  const vals: any[] = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
  if (starred !== undefined) { sets.push('starred = ?'); vals.push(starred ? 1 : 0); }
  if (archived !== undefined) { sets.push('archived = ?'); vals.push(archived ? 1 : 0); }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push("updated_at = strftime('%s', 'now')");
  vals.push(id, user.id);
  await db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  return c.json({ success: true });
});

// Permission response from user (allow/deny/always)
chatRoutes.post('/permission-response', async (c) => {
  const user = c.get('user');
  const { permissionId, decision, remember, toolName, path } = await c.req.json();

  if (!permissionId || !['allow', 'deny'].includes(decision)) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const db = getDb();

  if (remember) {
    const source = 'builtin';
    const perm = decision === 'allow' ? 'allow' : 'deny';
    await db.prepare(`
      INSERT INTO tool_permissions (id, tool_name, source, permission, user_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tool_name, source, user_id) DO UPDATE SET permission = ?
    `).run(crypto.randomUUID(), toolName, source, perm, user.id, perm);
  }

  // Resolve pending permission in orchestrator
  const { resolvePermission } = await import('../agent/orchestrator.js');
  resolvePermission(permissionId, decision === 'allow');

  return c.json({ success: true });
});

// Question response from user (HITL)
chatRoutes.post('/question-response', async (c) => {
  const { questionId, answer } = await c.req.json();

  if (!questionId || answer === undefined) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const { resolveQuestion } = await import('../agent/orchestrator.js');
  const resolved = resolveQuestion(questionId, answer);

  if (!resolved) {
    return c.json({ error: 'Question not found or already answered' }, 404);
  }

  return c.json({ success: true });
});

// Delete conversation
chatRoutes.delete('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const db = getDb();

  await db.prepare(`
    DELETE FROM conversations WHERE id = ? AND user_id = ?
  `).run(conversationId, user.id);

  return c.json({ success: true });
});
