import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { glob } from 'glob';
import type { ToolDefinition, ToolContext, ToolResult } from '../agent/types.js';
import { sandboxToolDefinitions, installPackageTool, type SandboxToolContext } from './sandbox-tools.js';

// Re-export SandboxToolContext for use elsewhere
export type { SandboxToolContext } from './sandbox-tools.js';

// Global tool registry
const registeredTools = new Map<string, ToolDefinition>();

export function registerTool(definition: ToolDefinition): void {
  registeredTools.set(definition.name, definition);
}

export function getRegisteredTool(name: string): ToolDefinition | undefined {
  return registeredTools.get(name);
}

export function getAllRegisteredTools(): ToolDefinition[] {
  return Array.from(registeredTools.values());
}

export function getToolsByCategory(category: string): ToolDefinition[] {
  return getAllRegisteredTools().filter(t => t.category === category);
}

// Execute a registered tool directly (used by orchestrator)
export async function executeRegisteredTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const def = registeredTools.get(name);
  if (!def) return { error: `Unknown tool: ${name}` };
  try {
    return await def.execute(args, context);
  } catch (error: any) {
    return { error: error.message };
  }
}

// Convert registered tools to AI SDK tools with context injection
export function buildAITools(
  toolNames: string[],
  context: ToolContext
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  const sandboxCtx = context as SandboxToolContext;
  const hasSandbox = !!sandboxCtx.sandboxId;

  // If sandbox is available, map sandbox-aware tools
  if (hasSandbox) {
    const sandboxToolMap = new Map(sandboxToolDefinitions.map(t => [t.name, t]));
    // Also add install_package
    sandboxToolMap.set(installPackageTool.name, installPackageTool);

    for (const name of toolNames) {
      const sandboxDef = sandboxToolMap.get(name);
      if (sandboxDef) {
        tools[name] = tool({
          description: sandboxDef.description,
          parameters: sandboxDef.parameters,
          execute: async (args) => {
            return sandboxDef.execute(args as Record<string, unknown>, context);
          },
        });
        continue;
      }

      // Fall back to registered tools for non-sandbox tools (memory, artifacts, etc.)
      const def = registeredTools.get(name);
      if (def) {
        tools[name] = tool({
          description: def.description,
          parameters: def.parameters,
          execute: async (args) => {
            return def.execute(args as Record<string, unknown>, context);
          },
        });
      }
    }
  } else {
    // No sandbox - use built-in tools (original behavior)
    for (const name of toolNames) {
      const def = registeredTools.get(name);
      if (!def) continue;

      tools[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: async (args) => {
          return def.execute(args as Record<string, unknown>, context);
        },
      });
    }
  }

  return tools;
}

// Get default tool list for an agent type
export function getDefaultTools(agentType: 'primary' | 'sub' | 'both' = 'primary', hasSandbox: boolean = false): string[] {
  if (hasSandbox) {
    // Sandbox tools - these are routed to E2B when sandbox is available
    const sandboxTools = [
      'execute_command', 'read_file', 'write_file', 'edit_file', 'patch_files',
      'search_files', 'search_content', 'list_files', 'http_request',
      'search_code', 'lint_code', 'install_package',
    ];
    const extraTools = agentType === 'sub'
      ? []
      : ['search_knowledge', 'browse_web', 'search_web', 'create_artifact'];
    return [...sandboxTools, ...extraTools];
  }

  // Non-sandbox tools (original behavior)
  const coreTools = ['read_file', 'write_file', 'list_files', 'search_files', 'run_code', 'search_knowledge'];

  if (agentType === 'primary' || agentType === 'both') {
    return [...coreTools, 'browse_web', 'search_web', 'create_artifact', 'delegate_to_agent'];
  }

  return coreTools;
}

// Helper to get workspace path
function getWorkspace(ctx: ToolContext): string {
  return process.env.WORKSPACE_PATH || `/tmp/workspace-${ctx.userId || 'default'}`;
}

// ──────────────────────────────────────────────
// Built-in tools
// ──────────────────────────────────────────────

export function registerBuiltinTools(): void {
  // File operations
  registerTool({
    name: 'read_file',
    description: 'Read the contents of a file from the workspace',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('File path relative to workspace root'),
    }),
    execute: async (args, ctx) => {
      const filePath = args.path as string;
      try {
        const workspace = getWorkspace(ctx);
        const resolved = resolve(workspace, filePath);
        if (!resolved.startsWith(workspace)) {
          return { error: 'Path traversal not allowed' };
        }
        if (!existsSync(resolved)) {
          return { error: `File not found: ${filePath}` };
        }
        const content = readFileSync(resolved, 'utf-8');
        return { content, path: filePath, size: content.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'write_file',
    description: 'Write content to a file in the workspace. Creates parent directories if needed.',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('File path relative to workspace root'),
      content: z.string().describe('Content to write'),
    }),
    execute: async (args, ctx) => {
      const filePath = args.path as string;
      const content = args.content as string;
      try {
        const workspace = getWorkspace(ctx);
        const resolved = resolve(workspace, filePath);
        if (!resolved.startsWith(workspace)) {
          return { error: 'Path traversal not allowed' };
        }
        mkdirSync(dirname(resolved), { recursive: true });
        writeFileSync(resolved, content, 'utf-8');
        return { success: true, path: filePath, bytes: content.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'edit_file',
    description: 'Edit a file by replacing a specific string. Useful for targeted edits.',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('File path relative to workspace root'),
      old_string: z.string().describe('Exact string to find and replace'),
      new_string: z.string().describe('Replacement string'),
    }),
    execute: async (args, ctx) => {
      const filePath = args.path as string;
      const oldString = args.old_string as string;
      const newString = args.new_string as string;
      try {
        const workspace = getWorkspace(ctx);
        const resolved = resolve(workspace, filePath);
        if (!resolved.startsWith(workspace)) {
          return { error: 'Path traversal not allowed' };
        }
        if (!existsSync(resolved)) {
          return { error: `File not found: ${filePath}` };
        }
        let content = readFileSync(resolved, 'utf-8');
        const count = content.split(oldString).length - 1;
        if (count === 0) {
          return { error: 'String not found in file' };
        }
        if (count > 1) {
          return { error: `Found ${count} occurrences. Provide more context to match uniquely.` };
        }
        content = content.replace(oldString, newString);
        writeFileSync(resolved, content, 'utf-8');
        return { success: true, path: filePath, edited: true };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'list_files',
    description: 'List files and directories at a given path',
    category: 'file',
    parameters: z.object({
      path: z.string().optional().describe('Directory path (defaults to workspace root)'),
      pattern: z.string().optional().describe('Glob pattern to filter results'),
    }),
    execute: async (args, ctx) => {
      const dirPath = args.path as string | undefined;
      const pattern = args.pattern as string | undefined;
      try {
        const workspace = getWorkspace(ctx);
        const resolved = dirPath ? resolve(workspace, dirPath) : workspace;
        if (!resolved.startsWith(workspace)) {
          return { error: 'Path traversal not allowed' };
        }
        if (!existsSync(resolved)) {
          return { error: `Directory not found: ${dirPath || '.'}` };
        }
        const entries = readdirSync(resolved, { withFileTypes: true });
        let items = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' as const : 'file' as const,
          path: join(dirPath || '.', e.name),
        }));
        if (pattern) {
          const matched = glob.sync(pattern, { cwd: resolved });
          items = items.filter(i => matched.includes(i.name));
        }
        return { items, count: items.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'search_files',
    description: 'Search for files matching a glob pattern in the workspace',
    category: 'file',
    parameters: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")'),
    }),
    execute: async (args, ctx) => {
      const pattern = args.pattern as string;
      try {
        const workspace = getWorkspace(ctx);
        const matches = glob.sync(pattern, { cwd: workspace, absolute: false });
        return { files: matches.slice(0, 100), count: matches.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  // Code execution (secure version - only use sandbox)
  registerTool({
    name: 'run_code',
    description: 'Execute code in a sandboxed environment. Supports JavaScript, TypeScript, and Python.',
    category: 'code',
    parameters: z.object({
      code: z.string().describe('Code to execute'),
      language: z.enum(['javascript', 'typescript', 'python', 'bash']).optional().describe('Language (default: javascript)'),
    }),
    execute: async (args) => {
      const code = args.code as string;
      const language = (args.language as string) || 'javascript';
      // For security, we only support sandbox execution, not direct host execution
      return { output: `Code submitted for execution. Language: ${language}`, code, needsSandbox: true };
    },
  });

  registerTool({
    name: 'run_bash',
    description: 'Execute a shell command. Use for system operations, git, npm, etc.',
    category: 'code',
    parameters: z.object({
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Working directory (relative to workspace)'),
      timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
    }),
    execute: async (args, ctx) => {
      // For security, we only support sandbox execution, not direct host execution
      // All bash commands must go through the sandbox tools
      return { 
        error: "Direct host bash execution disabled for security. Use sandbox tools instead.",
        help: "Use 'execute_command' tool in sandbox for shell operations"
      };
    },
  });

  // Search
  // ─── Image Generation Tool ───
  registerTool({
    name: 'generate_image',
    description: 'Generate an image from a text prompt using the user\'s API key (OpenAI DALL-E or Replicate Flux). Returns a URL to the generated image.',
    category: 'media',
    parameters: z.object({
      prompt: z.string().describe('Detailed description of the image to generate'),
      size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional().describe('Image size (default: 1024x1024)'),
      style: z.enum(['vivid', 'natural']).optional().describe('Image style for DALL-E (default: vivid)'),
      count: z.number().min(1).max(4).optional().describe('Number of images (default: 1, max: 4)'),
    }),
    execute: async (args, ctx) => {
      const prompt = args.prompt as string;
      const size = (args.size as string) || '1024x1024';
      const style = (args.style as string) || 'vivid';
      const count = (args.count as number) || 1;

      if (!prompt || prompt.trim().length === 0) {
        return { error: 'Prompt is required' };
      }

      try {
        const { generateImage } = await import('../services/image-gen.js');
        const result = await generateImage(ctx.userId || '', {
          prompt,
          size,
          style,
          count,
          conversationId: undefined,
          messageId: undefined,
        });

        return {
          imageUrl: result.url,
          id: result.id,
          provider: result.provider,
          revisedPrompt: result.revisedPrompt,
          size: result.size,
        };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'search_knowledge',
    description: 'Search the knowledge base for relevant information',
    category: 'search',
    parameters: z.object({
      query: z.string().describe('Search query'),
      kbId: z.string().optional().describe('Knowledge base ID (searches all if omitted)'),
      limit: z.number().optional().describe('Max results (default: 5)'),
    }),
    execute: async (args, ctx) => {
      const query = args.query as string;
      const limit = (args.limit as number) || 5;
      try {
        const { searchChunks } = await import('../kb/vector.js');
        const results = await searchChunks(ctx.userId || '', query, limit);
        return {
          results: results.map((r: any) => ({
            content: r.content,
            score: r.score,
            source: r.metadata?.sourceId,
          })),
        };
      } catch {
        return { results: [], error: 'Knowledge base not available' };
      }
    },
  });

  registerTool({
    name: 'search_web',
    description: 'Search the web using a search engine',
    category: 'search',
    parameters: z.object({
      query: z.string().describe('Search query'),
      num_results: z.number().optional().describe('Number of results (default: 5)'),
    }),
    execute: async (args) => {
      const query = args.query as string;
      const numResults = (args.num_results as number) || 5;
      try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KyroBot/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        // Parse simple results from DuckDuckGo Lite HTML
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
        const links: string[][] = [];
        const snippets: string[] = [];
        let m;
        while ((m = linkRegex.exec(html)) !== null) links.push([m[1], m[2]]);
        while ((m = snippetRegex.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
        for (let i = 0; i < Math.min(links.length, numResults); i++) {
          results.push({
            title: links[i][1],
            url: links[i][0],
            snippet: snippets[i] || '',
          });
        }
        return { results, query };
      } catch (error: any) {
        return { results: [], query, error: error.message };
      }
    },
  });

  registerTool({
    name: 'browse_web',
    description: 'Fetch and read the content of a web page',
    category: 'web',
    parameters: z.object({
      url: z.string().describe('URL to fetch'),
    }),
    execute: async (args) => {
      const url = args.url as string;
      try {
        const { validateUrl } = await import('../lib/validate-url.js');
        const validation = await validateUrl(url);
        if (!validation.valid) {
          return { error: `URL blocked: ${validation.reason}` };
        }
        const response = await fetch(validation.url.toString(), {
          headers: { 'User-Agent': 'KyroBot/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const text = await response.text();
        const content = text.length > 50000 ? text.slice(0, 50000) + '\n...[truncated]' : text;
        return { content, url: validation.url.toString(), status: response.status, size: text.length };
      } catch (error: any) {
        const { sanitizeError } = await import('../lib/sanitize-error.js');
        return { error: sanitizeError(error) };
      }
    },
  });

  // Agent delegation
  registerTool({
    name: 'delegate_to_agent',
    description: 'Delegate a task to a specialized sub-agent',
    category: 'agent',
    parameters: z.object({
      agentId: z.string().describe('Sub-agent ID to delegate to'),
      task: z.string().describe('Task description for the sub-agent'),
      context: z.string().optional().describe('Additional context for the sub-agent'),
    }),
    execute: async (args, ctx) => {
      const agentId = args.agentId as string;
      const task = args.task as string;
      try {
        const { subAgentManager } = await import('../agent/subagent.js');
        // Sub-agent delegation requires API key - pass from context
        const db = (await import('../db/init.js')).getDb();
        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
        if (!agent) return { error: `Sub-agent not found: ${agentId}` };
        const result = await subAgentManager.delegate(
          ctx.agentId, agentId, task,
          ctx.userId || '', ctx.apiKey || '', ctx.provider || 'anthropic'
        );
        return { result, agentId };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  // Artifacts
  registerTool({
    name: 'create_artifact',
    description: 'Create an artifact (HTML page, PDF, markdown, code snippet)',
    category: 'artifacts',
    parameters: z.object({
      type: z.enum(['html', 'pdf', 'markdown', 'code']).describe('Artifact type'),
      title: z.string().optional().describe('Artifact title'),
      content: z.string().describe('Artifact content'),
      language: z.string().optional().describe('Language for code artifacts'),
    }),
    execute: async (args, ctx) => {
      const type = args.type as 'html' | 'pdf' | 'markdown' | 'code';
      const title = (args.title as string) || `Untitled ${type}`;
      const content = args.content as string;
      try {
        const { artifactService } = await import('../artifacts/service.js');
        const artifact = await artifactService.create(
          ctx.userId || 'current', type, title, content
        );
        return { success: true, artifactId: artifact.id };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'list_artifacts',
    description: 'List all artifacts for the current user',
    category: 'artifacts',
    parameters: z.object({
      type: z.enum(['html', 'pdf', 'markdown', 'code']).optional().describe('Filter by type'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    }),
    execute: async (args, ctx) => {
      const limit = (args.limit as number) || 20;
      try {
        const { artifactService } = await import('../artifacts/service.js');
        const artifacts = artifactService.list(ctx.userId || '', limit);
        return { artifacts: artifacts.map((a: any) => ({ id: a.id, title: a.title, type: a.type, createdAt: a.createdAt })) };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  // Memory
  registerTool({
    name: 'search_memory',
    description: 'Search conversation memory and facts',
    category: 'search',
    parameters: z.object({
      query: z.string().describe('Search query'),
      type: z.enum(['conversation', 'fact', 'preference']).optional().describe('Memory type filter'),
      limit: z.number().optional().describe('Max results (default: 10)'),
    }),
    execute: async (args, ctx) => {
      const query = args.query as string;
      const type = args.type as string | undefined;
      const limit = (args.limit as number) || 10;
      try {
        const { memoryService } = await import('../memory/service.js');
        const results = memoryService.search(ctx.userId || '', query, { type: type as any, limit });
        return { memories: results };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  registerTool({
    name: 'save_memory',
    description: 'Save a fact or preference to long-term memory',
    category: 'search',
    parameters: z.object({
      content: z.string().describe('Memory content'),
      type: z.enum(['fact', 'preference']).describe('Memory type'),
      importance: z.number().optional().describe('Importance 1-10 (default: 5)'),
    }),
    execute: async (args, ctx) => {
      const content = args.content as string;
      const type = args.type as 'fact' | 'preference';
      const importance = (args.importance as number) || 5;
      try {
        const { memoryService } = await import('../memory/service.js');
        const id = memoryService.store(ctx.userId || '', content, type, { importance });
        return { success: true, id };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });

  // ─── Knowledge Base Tool ───
  registerTool({
    name: 'knowledge_base',
    description: 'Read, write, upload, or delete files from the knowledge base. Supports searching, listing files, and managing KB content.',
    category: 'search',
    parameters: z.object({
      action: z.enum(['read', 'write', 'upload', 'delete', 'list', 'search']).describe('Action to perform on the knowledge base'),
      kb_id: z.string().optional().describe('Knowledge base ID (required for read/delete)'),
      query: z.string().optional().describe('Search query (required for search action)'),
      file_path: z.string().optional().describe('File path or name'),
      content: z.string().optional().describe('Content to write'),
      file_content: z.string().optional().describe('File content for upload'),
      limit: z.number().optional().describe('Max results for search (default: 5)'),
    }),
    execute: async (args, ctx) => {
      const action = args.action as string;
      const kbId = args.kb_id as string | undefined;
      const query = args.query as string | undefined;
      const limit = (args.limit as number) || 5;

      try {
        const { getDb } = await import('../db/init.js');
        const db = getDb();

        // Check permissions if agent_id is available
        if (ctx.agentId && kbId) {
          const perm = db.prepare(`
            SELECT permission FROM agent_kb_permissions
            WHERE agent_id = ? AND kb_id = ?
          `).get(ctx.agentId, kbId) as any;

          if (perm?.permission === 'deny') {
            return { error: 'Access denied: you do not have permission to access this knowledge base.' };
          }
          // 'ask' permission would require user interaction - return info for now
          if (perm?.permission === 'ask') {
            return {
              requiresApproval: true,
              message: `Access to this knowledge base requires user approval. Please ask the user to grant access.`,
              kb_id: kbId,
            };
          }
        }

        switch (action) {
          case 'search': {
            if (!query) return { error: 'Query required for search action' };
            const { searchChunks } = await import('../kb/vector.js');
            const targetId = kbId || ctx.userId || '';
            const results = await searchChunks(targetId, query, limit);
            return {
              results: results.map((r: any) => ({
                content: r.content,
                score: r.score,
                source: r.metadata?.sourceId,
              })),
            };
          }

          case 'list': {
            const sources = db.prepare(`
              SELECT DISTINCT kb_id, source_file, COUNT(*) as chunk_count, MAX(created_at) as last_updated
              FROM kb_chunks
              WHERE user_id = ?
              GROUP BY kb_id, source_file
              ORDER BY last_updated DESC
            `).all(ctx.userId || '');
            return { sources };
          }

          case 'read': {
            if (!kbId) return { error: 'kb_id required for read action' };
            const chunks = db.prepare(`
              SELECT content, source_file, metadata FROM kb_chunks
              WHERE kb_id = ? AND user_id = ?
              ORDER BY chunk_index ASC
            `).all(kbId, ctx.userId || '') as Array<{ content: string; source_file: string; metadata: string }>;
            if (chunks.length === 0) return { error: 'Knowledge base not found or empty' };
            return {
              content: chunks.map(c => c.content).join('\n\n'),
              source: chunks[0].source_file,
              chunks: chunks.length,
            };
          }

          case 'write':
          case 'upload': {
            // Write/upload requires content
            const content = args.content as string || args.file_content as string;
            const filePath = args.file_path as string;
            if (!content) return { error: 'Content required for write/upload action' };

            const { chunkDocument } = await import('../kb/parser.js');
            const { storeChunk } = await import('../kb/vector.js');
            const chunks = chunkDocument(content);
            const finalKbId = kbId || crypto.randomUUID();

            for (let i = 0; i < chunks.length; i++) {
              await storeChunk(finalKbId, i, chunks[i], {
                sourceFile: filePath || 'agent-upload',
                mimeType: 'text/plain',
                chunkTotal: chunks.length,
              });
            }

            return { success: true, kb_id: finalKbId, chunks: chunks.length };
          }

          case 'delete': {
            if (!kbId) return { error: 'kb_id required for delete action' };
            const { deleteChunks } = await import('../kb/vector.js');
            deleteChunks(kbId);
            db.prepare('DELETE FROM kb_chunks WHERE kb_id = ? AND user_id = ?').run(kbId, ctx.userId || '');
            return { success: true, deleted: kbId };
          }

          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (error: any) {
        return { error: error.message };
      }
    },
  });
}

// Initialize built-in tools on import
registerBuiltinTools();

// ──────────────────────────────────────────────
// Custom API tools
// ──────────────────────────────────────────────

export function registerCustomApiTools(
  connectorId: string,
  connectorName: string,
  baseUrl: string | null,
  apiKey: string | null,
  endpoints: Array<{ method: string; path: string; description: string }>
): void {
  for (const ep of endpoints) {
    const toolName = `${connectorName.toLowerCase().replace(/\s+/g, '_')}_${ep.method.toLowerCase()}_${ep.path.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;

    registerTool({
      name: toolName,
      description: ep.description,
      category: 'web',
      parameters: z.object({
        params: z.record(z.string()).optional().describe('URL path parameters'),
        body: z.record(z.unknown()).optional().describe('Request body for POST/PUT/PATCH'),
        query: z.record(z.string()).optional().describe('Query string parameters'),
      }),
      execute: async (args, ctx) => {
        const params = (args.params || {}) as Record<string, string>;
        const body = args.body as Record<string, unknown> | undefined;
        const query = (args.query || {}) as Record<string, string>;

        // Build URL with path parameters
        let path = ep.path;
        for (const [key, value] of Object.entries(params)) {
          path = path.replace(`:${key}`, encodeURIComponent(value));
        }

        // Build query string
        const queryString = Object.entries(query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');

        const fullUrl = `${baseUrl?.replace(/\/+$/, '') || ''}${path}${queryString ? `?${queryString}` : ''}`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'KyroConnect/1.0',
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
          headers['X-API-Key'] = apiKey;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(fullUrl, {
            method: ep.method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const contentType = response.headers.get('content-type') || '';
          let responseData: unknown;
          if (contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }

          return {
            status: response.status,
            data: responseData,
            url: fullUrl,
          };
        } catch (error: any) {
          return { error: error.message, url: fullUrl };
        }
      },
    });
  }
}

export function unregisterCustomApiTools(connectorId: string): void {
  const prefix = `${connectorId}_`;
  for (const [name] of registeredTools) {
    if (name.startsWith(prefix)) {
      registeredTools.delete(name);
    }
  }
}
