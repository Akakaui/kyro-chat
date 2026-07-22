/**
 * Shared type definitions for sandbox execution providers.
 *
 * @module services/sandbox/types
 */

// ── Runtime interfaces ───────────────────────────────────────────────────

/** Options for code execution inside a sandbox. */
export interface CodeExecutionOptions {
  /** Execution timeout in seconds (default: 60). */
  timeout?: number;
  /** Memory limit in MB (default: 512). */
  memoryMb?: number;
  /** Stream stdout in real-time (default: false). */
  streamStdout?: boolean;
  /** Custom environment variables. */
  envVars?: Record<string, string>;
  /** Working directory inside the sandbox. */
  workingDir?: string;
  /** Auto-install dependencies before execution (default: false). */
  installDeps?: boolean;
}

/** Result returned from a code execution. */
export interface CodeExecutionResult {
  /** Standard output text. */
  stdout: string;
  /** Standard error text. */
  stderr: string;
  /** Process exit code (0 = success). */
  exitCode: number;
  /** Execution wall-clock time in milliseconds. */
  executionTime: number;
  /** Error message if the execution failed unexpectedly. */
  error?: string;
  /** Files created/modified during execution (provider-specific). */
  files?: { path: string; content: string }[];
  /** Timestamped log entries from the sandbox runtime. */
  logs?: string[];
}

/** Metadata about a running sandbox. */
export interface SandboxInfo {
  /** Sandbox identifier. */
  id: string;
  /** Provider identifier (e2b, docker, local). */
  provider: string;
  /** Language configured for this sandbox. */
  language: string;
  /** Uptime in seconds. */
  uptime: number;
  /** CPU usage (0-100 or undefined). */
  cpuUsage?: number;
  /** Memory usage in MB. */
  memoryMb?: number;
  /** Memory limit in MB. */
  memoryLimitMb?: number;
  /** Creation timestamp. */
  createdAt: number;
  /** Last activity timestamp. */
  lastUsed: number;
}

// ── Pool interfaces ──────────────────────────────────────────────────────

/** A sandbox tracked by the pool. */
export interface PoolSandbox {
  /** Unique sandbox ID. */
  id: string;
  /** User who owns/acquired this sandbox. */
  userId: string;
  /** Language configured for this sandbox. */
  language: string;
  /** Provider identifier. */
  provider: string;
  /** Opaque handle to the underlying sandbox (provider-specific). */
  handle: any;
  /** Timestamp when the sandbox was created. */
  createdAt: number;
  /** Timestamp of last known activity. */
  lastUsed: number;
  /** Whether the sandbox is currently in use. */
  busy: boolean;
}

/** Pool utilisation statistics. */
export interface PoolStats {
  /** Total sandbox slots configured. */
  maxSize: number;
  /** Currently active sandbox count. */
  activeCount: number;
  /** Sandboxes currently executing code. */
  busyCount: number;
  /** Sandboxes idle and available. */
  idleCount: number;
  /** Sandboxes per user (map of userId → count). */
  perUser: Record<string, number>;
}

// ── Provider contract ────────────────────────────────────────────────────

/**
 * Every sandbox provider must implement this interface.
 */
export interface SandboxProvider {
  /** Human-readable provider name (e.g. "e2b", "docker", "local"). */
  readonly name: string;

  /** Execute arbitrary code in the sandbox. */
  executeCode(code: string, language: string, options?: CodeExecutionOptions): Promise<CodeExecutionResult>;

  /** Create a file at the given path. */
  createFile?(path: string, content: string): Promise<void>;

  /** Read a file from the given path. */
  readFile?(path: string): Promise<string>;

  /** List files in a directory. */
  listFiles?(path: string): Promise<{ name: string; type: 'file' | 'directory'; path: string; size?: number }[]>;

  /** Execute an arbitrary shell command. */
  executeCommand?(command: string, options?: CodeExecutionOptions): Promise<CodeExecutionResult>;

  /** Get sandbox metadata. */
  getInfo?(): Promise<SandboxInfo>;

  /** Kill / terminate the sandbox. */
  kill?(): Promise<void>;

  /** Extend the sandbox lifetime. */
  keepAlive?(seconds: number): Promise<void>;

  /** Optional availability check (e.g. Docker daemon reachable). */
  isAvailable?(): boolean;
}

// ── Supported languages ──────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'bash',
  'go',
  'rust',
  'java',
  'ruby',
  'php',
  'r',
  'julia',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Map each language to its file extension and common runner. */
export const LANGUAGE_RUNNERS: Record<string, { ext: string; run: string[]; template?: string }> = {
  python:      { ext: '.py', run: ['python3'], template: 'python' },
  javascript:  { ext: '.js', run: ['node'], template: 'node' },
  typescript:  { ext: '.ts', run: ['npx', 'tsx'], template: 'node' },
  bash:        { ext: '.sh', run: ['bash'], template: 'base' },
  go:          { ext: '.go', run: ['go', 'run'], template: 'go' },
  rust:        { ext: '.rs', run: ['rustc', '-o', '/tmp/out', '{file}', '&&', '/tmp/out'], template: 'base' },
  java:        { ext: '.java', run: ['java'], template: 'base' },
  ruby:        { ext: '.rb', run: ['ruby'], template: 'base' },
  php:         { ext: '.php', run: ['php'], template: 'base' },
  r:           { ext: '.R', run: ['Rscript'], template: 'base' },
  julia:       { ext: '.jl', run: ['julia'], template: 'base' },
};
