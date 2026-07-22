/**
 * E2B (End-to-End) cloud sandbox provider.
 *
 * Executes untrusted code in a secure remote sandbox managed by E2B.
 * Requires the `E2B_API_KEY` environment variable to be set.
 *
 * @module services/sandbox/e2b
 */

import { Sandbox } from 'e2b';
import { LANGUAGE_RUNNERS } from './types.js';
import type { CodeExecutionOptions, CodeExecutionResult, SandboxInfo, SandboxProvider } from './types.js';

// ── Configuration ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = parseInt(process.env.E2B_SANDBOX_TIMEOUT || '60', 10);
const TEMPLATE_ID = () => process.env.E2B_TEMPLATE_ID || undefined;

// ── Helpers ──────────────────────────────────────────────────────────────

function getTemplate(language: string): string {
  const template = LANGUAGE_RUNNERS[language]?.template;
  return TEMPLATE_ID() || template || 'base';
}

/**
 * Build a bash command snippet that writes `code` to a temp file and runs it
 * with the appropriate interpreter for `language`.
 */
function buildRunCommand(code: string, language: string): string {
  const runner = LANGUAGE_RUNNERS[language];
  if (!runner) {
    // Fallback: pipe to language binary
    return `cat << 'SCRIPT' | ${language}\n${code}\nSCRIPT`;
  }

  const ext = runner.ext || '.txt';
  const tmpFile = `/tmp/e2b_code_${Date.now()}${ext}`;
  const escaped = code.replace(/'/g, "'\\''");
  const runCmd = runner.run.map(s => s.replace('{file}', tmpFile)).join(' ');

  return `cat > ${tmpFile} << 'ENDOFFILE'\n${escaped}\nENDOFFILE\n${runCmd}`;
}

function getApiKey(): string {
  const key = process.env.E2B_API_KEY || '';
  if (!key) {
    throw new Error('[Sandbox] E2B_API_KEY is not configured');
  }
  return key;
}

// ── Provider implementation ───────────────────────────────────────────────

async function executeCode(
  code: string,
  language: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
  };

  const timeoutMs = (options?.timeout ?? DEFAULT_TIMEOUT) * 1000;
  const template = getTemplate(language);

  log(`Creating E2B sandbox (template: ${template}, language: ${language})`);

  const startTime = Date.now();
  let sbx: Sandbox;

  try {
    sbx = await Sandbox.create({
      template,
      apiKey: getApiKey(),
      metadata: {
        language,
        'created-by': 'kyro-chat',
      },
      timeoutMs,
    });
  } catch (err: any) {
    log(`Failed to create sandbox: ${err.message}`);
    return {
      stdout: '',
      stderr: '',
      exitCode: 1,
      executionTime: Date.now() - startTime,
      error: `Sandbox creation failed: ${err.message}`,
      logs,
    };
  }

  try {
    log(`Executing ${language} code (${code.length} chars)`);

    // Build and run the command
    const cmd = buildRunCommand(code, language);
    const result = await sbx.commands.run(cmd, { timeoutMs });

    const executionTime = Date.now() - startTime;
    log(`Execution completed in ${executionTime}ms (exit code: ${result.exitCode})`);

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode,
      executionTime,
      error: result.error || undefined,
      logs,
    };
  } catch (err: any) {
    const executionTime = Date.now() - startTime;
    log(`Execution error: ${err.message}`);

    return {
      stdout: '',
      stderr: err.message || 'Unknown execution error',
      exitCode: 1,
      executionTime,
      error: err.message,
      logs,
    };
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function executeCommand(
  command: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
  };

  const timeoutMs = (options?.timeout ?? DEFAULT_TIMEOUT) * 1000;

  log(`Creating sandbox for command execution`);

  const startTime = Date.now();
  let sbx: Sandbox;

  try {
    sbx = await Sandbox.create({
      template: 'base',
      apiKey: getApiKey(),
      timeoutMs,
    });
  } catch (err: any) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 1,
      executionTime: Date.now() - startTime,
      error: `Sandbox creation failed: ${err.message}`,
      logs,
    };
  }

  try {
    log(`Running command: ${command.substring(0, 200)}`);
    const result = await sbx.commands.run(command, { timeoutMs });

    const executionTime = Date.now() - startTime;
    log(`Command completed in ${executionTime}ms (exit code: ${result.exitCode})`);

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode,
      executionTime,
      error: result.error || undefined,
      logs,
    };
  } catch (err: any) {
    const executionTime = Date.now() - startTime;
    log(`Command error: ${err.message}`);

    return {
      stdout: '',
      stderr: err.message,
      exitCode: err.status || 1,
      executionTime,
      error: err.message,
      logs,
    };
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function createFile(path: string, content: string): Promise<void> {
  let sbx: Sandbox;
  try {
    sbx = await Sandbox.create({
      template: 'base',
      apiKey: getApiKey(),
      timeoutMs: 30_000,
    });
  } catch {
    return;
  }

  try {
    const dir = path.lastIndexOf('/') > 0 ? path.substring(0, path.lastIndexOf('/')) : '';
    if (dir) {
      await sbx.commands.run(`mkdir -p '${dir}'`);
    }
    await sbx.files.write(path, content);
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function readFile(path: string): Promise<string> {
  let sbx: Sandbox;
  try {
    sbx = await Sandbox.create({
      template: 'base',
      apiKey: getApiKey(),
      timeoutMs: 30_000,
    });
  } catch {
    throw new Error('Failed to create E2B sandbox for file read');
  }

  try {
    return await sbx.files.read(path);
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function listFiles(path: string): Promise<{ name: string; type: 'file' | 'directory'; path: string; size?: number }[]> {
  let sbx: Sandbox;
  try {
    sbx = await Sandbox.create({
      template: 'base',
      apiKey: getApiKey(),
      timeoutMs: 30_000,
    });
  } catch {
    throw new Error('Failed to create E2B sandbox for file list');
  }

  try {
    const items = await sbx.files.list(path);
    return items.map((item) => ({
      name: item.name,
      type: item.isDir ? 'directory' as const : 'file' as const,
      path: path === '/' ? `/${item.name}` : `${path}/${item.name}`,
      size: item.size,
    }));
  } catch {
    // Fallback to ls command
    const result = await executeCommand(`ls -la '${path}'`);
    return result.stdout.split('\n').filter(Boolean).map((line) => {
      const parts = line.split(/\s+/);
      const name = parts[parts.length - 1];
      const isDir = line.startsWith('d');
      return {
        name,
        type: isDir ? 'directory' as const : 'file' as const,
        path: path === '/' ? `/${name}` : `${path}/${name}`,
      };
    });
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function getInfo(): Promise<SandboxInfo> {
  let sbx: Sandbox;
  try {
    sbx = await Sandbox.create({
      template: 'base',
      apiKey: getApiKey(),
      timeoutMs: 15_000,
    });
  } catch {
    return {
      id: 'unknown',
      provider: 'e2b',
      language: 'bash',
      uptime: 0,
      memoryLimitMb: 512,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
  }

  try {
    return {
      id: sbx.sandboxId || 'unknown',
      provider: 'e2b',
      language: 'bash',
      uptime: 0,
      memoryLimitMb: 512,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
  } finally {
    try { await sbx.kill(); } catch { /* ignore */ }
  }
}

async function kill(): Promise<void> {
  // No-op: E2B sandboxes are created and killed per-execution
}

async function keepAlive(_seconds: number): Promise<void> {
  // No-op: E2B SDK handles keep-alive via timeoutMs on creation
}

// ── Exports ───────────────────────────────────────────────────────────────

export const e2bSandbox: SandboxProvider = {
  name: 'e2b',
  executeCode,
  executeCommand,
  createFile,
  readFile,
  listFiles,
  getInfo,
  kill,
  keepAlive,
};
