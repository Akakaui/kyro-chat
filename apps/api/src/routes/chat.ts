import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { getDb } from '../db/init.js';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { getModel, PROVIDER_MODELS } from '../agent/providers.js';
import { streamText } from 'ai';

export const chatRoutes = new Hono();

// Create new conversation
chatRoutes.post('/conversations', async (c) => {
  const user = c.get('user');
  const { title, model } = await c.req.json();
  const id = crypto.randomUUID();

  const db = getDb();
  db.prepare(`
    INSERT INTO conversations (id, user_id, title, model)
    VALUES (?, ?, ?, ?)
  `).run(id, user.id, title || 'New conversation', model || 'claude-sonnet-4-20250514');

  return c.json({ id, title, model });
});

// List conversations
chatRoutes.get('/conversations', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const conversations = db.prepare(`
    SELECT id, title, model, created_at, updated_at
    FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(user.id);

  return c.json({ conversations });
});

// Get conversation with messages
chatRoutes.get('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const db = getDb();

  const conversation = db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(conversationId, user.id);

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);

  return c.json({ conversation, messages });
});

// Send message and get streaming response with agent orchestration
chatRoutes.post('/conversations/:id/messages', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const { content, agentId, provider = 'anthropic', apiKey, model } = await c.req.json();

  const db = getDb();

  // Verify conversation exists
  const conversation = db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(conversationId, user.id) as any;

  if (!conversation) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  // Save user message
  const userMsgId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, agent_id)
    VALUES (?, ?, 'user', ?, ?)
  `).run(userMsgId, conversationId, content, agentId || null);

  // Get conversation history for context
  const history = db.prepare(`
    SELECT role, content FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId) as Array<{ role: string; content: string }>;

  // Get agent details if agentId provided
  let agent = null;
  let systemPrompt = 'You are a helpful AI assistant.';
  if (agentId) {
    agent = db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, user.id) as any;
    if (agent?.system_prompt) {
      systemPrompt = agent.system_prompt;
    }
  }

  // Use provided API key or fallback to env
  const resolvedApiKey = apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  const resolvedProvider = provider || 'anthropic';
  const resolvedModel = model || conversation.model || 'claude-sonnet-4-20250514';

  if (!resolvedApiKey) {
    return c.json({ error: 'No API key configured. Please add your API key in Settings.' }, 400);
  }

  // Stream response using agent orchestrator
  return stream(c, async (streamWriter) => {
    let fullResponse = '';

    try {
      if (agent) {
        // Use agent orchestrator for agentic responses
        const orchestrator = new AgentOrchestrator(
          agent,
          resolvedApiKey,
          resolvedProvider,
          resolvedModel
        );

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
      } else {
        // Direct streaming without agent (simpler path)
        const aiModel = getModel(resolvedProvider, resolvedApiKey, resolvedModel);

        const result = streamText({
          model: aiModel,
          system: systemPrompt,
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

      // Save assistant message
      const assistantMsgId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, agent_id)
        VALUES (?, ?, 'assistant', ?, ?)
      `).run(assistantMsgId, conversationId, fullResponse, agentId || null);

      // Update conversation timestamp
      db.prepare(`
        UPDATE conversations SET updated_at = unixepoch() WHERE id = ?
      `).run(conversationId);
    } catch (err: any) {
      const errorMsg = `Error: ${err.message || 'Failed to get AI response'}`;
      await streamWriter.write(errorMsg);
      fullResponse = errorMsg;
    }
  });
});

// Delete conversation
chatRoutes.delete('/conversations/:id', async (c) => {
  const user = c.get('user');
  const conversationId = c.req.param('id');
  const db = getDb();

  db.prepare(`
    DELETE FROM conversations WHERE id = ? AND user_id = ?
  `).run(conversationId, user.id);

  return c.json({ success: true });
});
