/**
 * Sandbox execution interface.
 *
 * Auto-selects between E2B (cloud), Docker (local), and raw local execution
 * depending on the available environment capabilities.
 *
 * @module services/sandbox
 */

import { e2bSandbox } from './e2b.js';
import { dockerSandbox } from './docker.js';
import { sandboxPool } from './pool.js';
import type { CodeExecutionOptions, CodeExecutionResult, SandboxProvider } from './types.js';

export type { CodeExecutionOptions, CodeExecutionResult, SandboxInfo, SandboxProvider, PoolStats, PoolSandbox } from './types.js';

let provider: SandboxProvider | null = null;

function selectProvider(): SandboxProvider {
  if (process.env.E2B_API_KEY) {
    console.log('[Sandbox] Using E2B cloud sandbox provider');
    return e2bSandbox;
  }

  if (dockerSandbox.isAvailable?.()) {
    console.log('[Sandbox] Using Docker sandbox provider');
    return dockerSandbox;
  }

  throw new Error(
    'No sandbox provider available. Set E2B_API_KEY for cloud sandbox, or ensure Docker is running.',
  );
}

function getProvider(): SandboxProvider {
  if (!provider) {
    provider = selectProvider();
  }
  return provider;
}

export function resetProvider(): void {
  provider = null;
}

export async function initSandbox(): Promise<void> {
  console.log('[Sandbox] Initializing sandbox subsystem...');

  try {
    const p = getProvider();
    if (typeof (p as any).init === 'function') {
      await (p as any).init();
    }
    sandboxPool.startCleanup();
    console.log(`[Sandbox] ✅ ${provider === dockerSandbox ? 'Docker' : 'E2B'} provider ready`);
  } catch (err) {
    console.error('[Sandbox] Failed to initialize sandbox:', err);
    throw err;
  }
}

/**
 * Execute code in a sandbox (auto-selects provider from pool or creates new).
 */
export async function executeCode(
  code: string,
  language: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  const maxLen = parseInt(process.env.E2B_MAX_CODE_LENGTH || '10000', 10);
  if (code.length > maxLen) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 1,
      executionTime: 0,
      error: `Code exceeds maximum length of ${maxLen} characters (${code.length} given)`,
    };
  }

  const provider = getProvider();
  const logs: string[] = [];
  const ts = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
    console.log(`[Sandbox] ${msg}`);
  };

  ts(`Executing ${language} code (${code.length} chars)`);

  const startTime = Date.now();
  try {
    const result = await provider.executeCode(code, language, options);
    result.executionTime = Date.now() - startTime;
    result.logs = logs;
    return result;
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    ts(`Execution failed after ${elapsed}ms: ${err.message}`);
    return {
      stdout: '',
      stderr: err.message || 'Unknown error',
      exitCode: 1,
      executionTime: elapsed,
      error: err.message,
      logs,
    };
  }
}

/**
 * Execute an arbitrary command in the sandbox.
 */
export async function executeCommand(
  command: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  const p = getProvider();
  if (typeof (p as any).executeCommand !== 'function') {
    // Fallback: execute as bash code
    return p.executeCode(command, 'bash', options);
  }
  return (p as any).executeCommand(command, options);
}

/**
 * Install packages in the sandbox.
 */
export async function installPackages(
  packages: string[],
  language: string,
): Promise<CodeExecutionResult> {
  const p = getProvider();
  const pkgStr = packages.join(' ');
  const installCmds: Record<string, string> = {
    python: `pip install ${pkgStr}`,
    javascript: `npm install ${pkgStr}`,
    typescript: `npm install ${pkgStr}`,
    node: `npm install ${pkgStr}`,
    bash: `apt-get update -qq && apt-get install -y -qq ${pkgStr} 2>&1`,
    go: `go get ${pkgStr}`,
    rust: `cargo add ${pkgStr}`,
    ruby: `gem install ${pkgStr}`,
    php: `composer require ${pkgStr}`,
  };

  const cmd = installCmds[language] || `echo "No package manager for ${language}"`;
  console.log(`[Sandbox] Installing packages: ${pkgStr} (${language})`);

  return p.executeCode(cmd, 'bash', { timeout: 120 });
}

/**
 * Create a file in the sandbox.
 */
export async function createFile(path: string, content: string): Promise<void> {
  const p = getProvider();
  if (typeof (p as any).createFile === 'function') {
    return (p as any).createFile(path, content);
  }
  // Fallback: use bash to write the file
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  await p.executeCode(`mkdir -p "$(dirname '${path}')" && cat > '${path}' << 'ENDOFFILE'\n${content}\nENDOFFILE`, 'bash');
}

/**
 * Read a file from the sandbox.
 */
export async function readFile(path: string): Promise<string> {
  const p = getProvider();
  if (typeof (p as any).readFile === 'function') {
    return (p as any).readFile(path);
  }
  const result = await p.executeCode(`cat '${path}'`, 'bash');
  return result.stdout;
}

export { sandboxPool } from './pool.js';
export { e2bSandbox } from './e2b.js';
export { dockerSandbox } from './docker.js';

/**
 * Graceful shutdown – kill all tracked sandboxes.
 */
export async function shutdownSandbox(): Promise<void> {
  console.log('[Sandbox] Shutting down sandbox subsystem...');
  sandboxPool.stopCleanup();
  await sandboxPool.drainAll();
  console.log('[Sandbox] All sandboxes terminated');
}
