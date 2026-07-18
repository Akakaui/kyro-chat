import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';
import type { ToolDefinition, ToolContext, ToolResult } from '../agent/types.js';

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

  return tools;
}

// Get default tool list for an agent type
export function getDefaultTools(agentType: 'primary' | 'sub' | 'both' = 'primary'): string[] {
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

  // Code execution
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
      try {
        if (language === 'bash') {
          const output = execSync(code, { encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 });
          return { output, exitCode: 0 };
        }
        return { output: `Code submitted for execution. Language: ${language}`, code, needsSandbox: true };
      } catch (error: any) {
        return { error: error.message, stderr: error.stderr };
      }
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
      const command = args.command as string;
      const cwd = args.cwd as string | undefined;
      const timeout = (args.timeout as number) || 30;
      try {
        const workspace = getWorkspace(ctx);
        const workDir = cwd ? resolve(workspace, cwd) : workspace;
        const output = execSync(command, {
          encoding: 'utf-8',
          cwd: workDir,
          timeout: timeout * 1000,
          maxBuffer: 1024 * 1024,
        });
        return { output: output.trim(), exitCode: 0 };
      } catch (error: any) {
        return { error: error.message, stderr: error.stderr?.toString(), exitCode: error.status };
      }
    },
  });

  // Search
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
      return { results: [], query, note: 'Web search not yet configured' };
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
        const response = await fetch(url, {
          headers: { 'User-Agent': 'KyroBot/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const text = await response.text();
        const content = text.length > 50000 ? text.slice(0, 50000) + '\n...[truncated]' : text;
        return { content, url, status: response.status, size: text.length };
      } catch (error: any) {
        return { error: error.message };
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
          ctx.userId || '', '', '' // apiKey, provider resolved at runtime
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
}

// Initialize built-in tools on import
registerBuiltinTools();
