import { z } from 'zod';
import { sandboxService } from '../sandbox/service.js';
import type { ToolDefinition, ToolContext, ToolResult } from '../agent/types.js';

// Sandbox-aware tool context extends base context
export interface SandboxToolContext extends ToolContext {
  sandboxId?: string;
}

function requireSandbox(ctx: ToolContext): string {
  const sandboxId = (ctx as SandboxToolContext).sandboxId;
  if (!sandboxId) {
    throw new Error('No sandbox available. Sandbox must be created before using tools.');
  }
  return sandboxId;
}

function sanitizePath(path: string): string {
  // Prevent path traversal
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

// ──────────────────────────────────────────────
// Sandbox Tools (all 12 routed to E2B)
// ──────────────────────────────────────────────

export const sandboxToolDefinitions: ToolDefinition[] = [
  // 1. execute_command
  {
    name: 'execute_command',
    description: 'Execute a bash command in the sandbox environment',
    category: 'code',
    parameters: z.object({
      command: z.string().describe('Shell command to execute'),
      workdir: z.string().optional().describe('Working directory (absolute path)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const command = args.command as string;
      const workdir = args.workdir as string | undefined;

      try {
        const fullCmd = workdir ? `cd ${sanitizePath(workdir)} && ${command}` : command;
        const result = await sandboxService.executeCommand(sandboxId, fullCmd);
        return {
          output: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTime: result.executionTime,
        };
      } catch (error: any) {
        return { error: error.message, exitCode: 1 };
      }
    },
  },

  // 2. read_file
  {
    name: 'read_file',
    description: 'Read the contents of a file from the sandbox',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('Absolute file path in sandbox'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const path = sanitizePath(args.path as string);

      try {
        const content = await sandboxService.readFile(sandboxId, path);
        return { content, path, size: content.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 3. write_file
  {
    name: 'write_file',
    description: 'Write content to a file in the sandbox. Creates parent directories automatically.',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('Absolute file path in sandbox'),
      content: z.string().describe('Content to write to the file'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const path = sanitizePath(args.path as string);
      const content = args.content as string;

      try {
        await sandboxService.writeFile(sandboxId, path, content);
        return { success: true, path, bytes: content.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 4. edit_file
  {
    name: 'edit_file',
    description: 'Edit a file by replacing an exact string match. Fails if string not found or found multiple times.',
    category: 'file',
    parameters: z.object({
      path: z.string().describe('Absolute file path in sandbox'),
      old_string: z.string().describe('Exact string to find and replace'),
      new_string: z.string().describe('Replacement string'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const path = sanitizePath(args.path as string);
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;

      try {
        await sandboxService.editFile(sandboxId, path, oldStr, newStr);
        return { success: true, path, edited: true };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 5. patch_files
  {
    name: 'patch_files',
    description: 'Apply multiple edits to one or more files in a single operation',
    category: 'file',
    parameters: z.object({
      patches: z.array(z.object({
        path: z.string().describe('File path'),
        old_string: z.string().describe('String to find'),
        new_string: z.string().describe('Replacement string'),
      })).describe('Array of patch operations'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const patches = args.patches as Array<{ path: string; old_string: string; new_string: string }>;

      const results: Array<{ path: string; success: boolean; error?: string }> = [];
      for (const patch of patches) {
        try {
          await sandboxService.editFile(
            sandboxId,
            sanitizePath(patch.path),
            patch.old_string,
            patch.new_string
          );
          results.push({ path: patch.path, success: true });
        } catch (error: any) {
          results.push({ path: patch.path, success: false, error: error.message });
        }
      }

      const allSuccess = results.every(r => r.success);
      return { results, allSuccess, patched: results.filter(r => r.success).length };
    },
  },

  // 6. search_files
  {
    name: 'search_files',
    description: 'Search for files matching a glob pattern in the sandbox',
    category: 'file',
    parameters: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")'),
      path: z.string().optional().describe('Directory to search in (default: /)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const pattern = args.pattern as string;
      const searchPath = (args.path as string) || '/';

      try {
        const files = await sandboxService.searchFiles(sandboxId, pattern, sanitizePath(searchPath));
        return { files: files.slice(0, 100), count: files.length };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 7. search_content
  {
    name: 'search_content',
    description: 'Search file contents using regex pattern (grep-like)',
    category: 'search',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory to search in (default: /)'),
      include: z.string().optional().describe('File pattern to include (e.g. "*.ts")'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const pattern = args.pattern as string;
      const searchPath = sanitizePath((args.path as string) || '/');
      const include = args.include as string | undefined;

      try {
        const result = await sandboxService.executeCommand(
          sandboxId,
          `grep -rn '${pattern.replace(/'/g, "'\\''")}' ${searchPath}${include ? ` --include="${include}"` : ''} | head -100`
        );
        const matches = result.stdout.split('\n').filter(Boolean).map(line => {
          const [file, ...rest] = line.split(':');
          return { file, match: rest.join(':') };
        });
        return { matches, count: matches.length };
      } catch (error: any) {
        // grep exits with code 1 when no matches found
        if (error.message?.includes('exit code 1')) {
          return { matches: [], count: 0 };
        }
        return { error: error.message };
      }
    },
  },

  // 8. list_files
  {
    name: 'list_files',
    description: 'List files and directories at a given path in the sandbox',
    category: 'file',
    parameters: z.object({
      path: z.string().optional().describe('Directory path (defaults to /)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const path = sanitizePath((args.path as string) || '/');

      try {
        const items = await sandboxService.listFiles(sandboxId, path);
        return { items, count: items.length, path };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 9. http_request
  {
    name: 'http_request',
    description: 'Make an HTTP request from the sandbox (useful for testing APIs, fetching data)',
    category: 'web',
    parameters: z.object({
      url: z.string().describe('URL to request'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method (default: GET)'),
      headers: z.record(z.string()).optional().describe('Request headers'),
      body: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const url = args.url as string;
      const method = (args.method as string) || 'GET';
      const headers = args.headers as Record<string, string> | undefined;
      const body = args.body as string | undefined;

      try {
        // Build curl command
        let cmd = `curl -s -w '\\n%{http_code}' -X ${method}`;
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            cmd += ` -H '${key}: ${value}'`;
          }
        }
        if (body) {
          cmd += ` -d '${body.replace(/'/g, "'\\''")}'`;
        }
        cmd += ` '${url}'`;

        const result = await sandboxService.executeCommand(sandboxId, cmd);
        const lines = result.stdout.split('\n');
        const statusCode = parseInt(lines[lines.length - 1]) || 0;
        const responseBody = lines.slice(0, -1).join('\n');

        return {
          status: statusCode,
          body: responseBody,
          size: responseBody.length,
        };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 10. search_code
  {
    name: 'search_code',
    description: 'Search for code patterns using grep/find with context',
    category: 'search',
    parameters: z.object({
      query: z.string().describe('Search query or code pattern'),
      path: z.string().optional().describe('Directory to search in (default: /)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const query = args.query as string;
      const searchPath = sanitizePath((args.path as string) || '/');

      try {
        // Use ripgrep if available, fallback to grep
        let cmd = `if command -v rg &> /dev/null; then rg -n '${query.replace(/'/g, "'\\''")}' ${searchPath} --max-count 50 2>/dev/null; else grep -rn '${query.replace(/'/g, "'\\''")}' ${searchPath} --include="*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,css,html}" 2>/dev/null | head -50; fi`;
        const result = await sandboxService.executeCommand(sandboxId, cmd);
        const matches = result.stdout.split('\n').filter(Boolean);
        return { matches, count: matches.length };
      } catch (error: any) {
        return { matches: [], count: 0, error: error.message };
      }
    },
  },

  // 11. lint_code
  {
    name: 'lint_code',
    description: 'Run linter on code files in the sandbox',
    category: 'code',
    parameters: z.object({
      path: z.string().optional().describe('File or directory to lint (default: all)'),
      linter: z.enum(['eslint', 'prettier', 'ruff', 'golangci-lint']).optional().describe('Linter to use (auto-detect if omitted)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const sandboxId = requireSandbox(ctx);
      const targetPath = sanitizePath((args.path as string) || '.');
      const linter = args.linter as string | undefined;

      try {
        let cmd: string;
        if (linter) {
          switch (linter) {
            case 'eslint':
              cmd = `npx eslint ${targetPath} --format json 2>/dev/null || true`;
              break;
            case 'prettier':
              cmd = `npx prettier --check ${targetPath} 2>/dev/null || true`;
              break;
            case 'ruff':
              cmd = `ruff check ${targetPath} 2>/dev/null || true`;
              break;
            case 'golangci-lint':
              cmd = `golangci-lint run ${targetPath} 2>/dev/null || true`;
              break;
            default:
              cmd = `echo "Unknown linter: ${linter}"`;
          }
        } else {
          // Auto-detect: check for config files
          cmd = `if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then npx eslint ${targetPath} --format json 2>/dev/null || true; elif [ -f "ruff.toml" ] || [ -f "pyproject.toml" ]; then ruff check ${targetPath} 2>/dev/null || true; elif [ -f "go.mod" ]; then golangci-lint run ${targetPath} 2>/dev/null || true; else echo "No linter config found. Install and configure a linter first."; fi`;
        }

        const result = await sandboxService.executeCommand(sandboxId, cmd);
        return {
          output: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },

  // 12. delegate_to_agent
  {
    name: 'delegate_to_agent',
    description: 'Delegate a task to a sub-agent (sub-agents cannot create artifacts or use file tools)',
    category: 'agent',
    parameters: z.object({
      task: z.string().describe('Task description for the sub-agent'),
      agent_id: z.string().optional().describe('Sub-agent ID (uses default if omitted)'),
    }),
    execute: async (args, ctx): Promise<ToolResult> => {
      const task = args.task as string;
      const agentId = args.agent_id as string | undefined;

      try {
        const { subAgentManager } = await import('../agent/subagent.js');
        const db = (await import('../db/init.js')).getDb();

        let targetAgentId: string | undefined = agentId;
        if (!targetAgentId) {
          // Use first available sub-agent
          const agent = db.prepare(
            "SELECT id FROM agents WHERE type = 'sub' AND user_id = ? LIMIT 1"
          ).get(ctx.userId || '') as any;
          if (!agent) return { error: 'No sub-agent available' };
          targetAgentId = agent.id as string;
        }

        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(targetAgentId) as any;
        if (!agent) return { error: `Sub-agent not found: ${targetAgentId}` };

        const result = await subAgentManager.delegate(
          ctx.agentId || '',
          targetAgentId,
          task,
          ctx.userId || '',
          '',
          ''
        );
        return { result, agentId: targetAgentId };
      } catch (error: any) {
        return { error: error.message };
      }
    },
  },
];

// 13. install_package (bonus tool for sandbox)
export const installPackageTool: ToolDefinition = {
  name: 'install_package',
  description: 'Install a package in the sandbox (npm/pip based on detected language)',
  category: 'code',
  parameters: z.object({
    package: z.string().describe('Package name (e.g. "lodash", "pandas", "express")'),
    manager: z.enum(['npm', 'pip', 'yarn', 'pnpm']).optional().describe('Package manager (auto-detect if omitted)'),
  }),
  execute: async (args, ctx): Promise<ToolResult> => {
    const sandboxId = requireSandbox(ctx);
    const packageName = args.package as string;
    const manager = args.manager as string | undefined;

    try {
      const output = await sandboxService.installPackage(sandboxId, packageName, manager);
      return { output, package: packageName };
    } catch (error: any) {
      return { error: error.message };
    }
  },
};
