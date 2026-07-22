/**
 * Docker sandbox provider.
 *
 * Executes code in disposable Docker containers with resource limits.
 * Falls back gracefully when the Docker socket is unavailable.
 *
 * @module services/sandbox/docker
 */

import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LANGUAGE_RUNNERS } from './types.js';
import type { CodeExecutionOptions, CodeExecutionResult, SandboxInfo, SandboxProvider } from './types.js';

// ── Configuration ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30; // seconds
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1 MB

// Language → Docker image mapping
const IMAGES: Record<string, string> = {
  python: 'python:3.12-slim',
  javascript: 'node:22-alpine',
  typescript: 'node:22-alpine',
  bash: 'alpine:latest',
  go: 'golang:1.23-alpine',
  rust: 'rust:1.78-slim',
  java: 'openjdk:21-slim',
  ruby: 'ruby:3.3-alpine',
  php: 'php:8.3-cli-alpine',
  r: 'rocker/r-ver:4.4',
  julia: 'julia:1.10-alpine',
};

// ── Docker availability check (one-time) ─────────────────────────────────

let _available: boolean | null = null;

function checkDocker(): boolean {
  if (_available !== null) return _available;
  try {
    execSync('docker info --format "{{.ServerVersion}}" 2>/dev/null', {
      stdio: 'ignore',
      timeout: 5000,
    });
    _available = true;
    return true;
  } catch {
    _available = false;
    return false;
  }
}

// ── Implementation ───────────────────────────────────────────────────────

async function executeCode(
  code: string,
  language: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
  };

  const startTime = Date.now();
  const lang = language === 'node' ? 'javascript' : language;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  const runner = LANGUAGE_RUNNERS[lang];
  if (!runner) {
    log(`Unsupported language: ${lang}`);
    return {
      stdout: '',
      stderr: `Unsupported language: ${lang}`,
      exitCode: 1,
      executionTime: Date.now() - startTime,
      error: `Unsupported language: ${lang}`,
      logs,
    };
  }

  const image = IMAGES[lang] || 'alpine:latest';

  // Create temp dir with code file
  const tmpDir = mkdtempSync(join(tmpdir(), 'docker-sandbox-'));
  const filePath = join(tmpDir, `code${runner.ext}`);

  try {
    writeFileSync(filePath, code, 'utf-8');
    log(`Code written to ${filePath}`);

    // Build the command to run inside the container
    const cmdParts = runner.run.map((part) => (part === '{file}' ? `/code/code${runner.ext}` : part));
    // If no {file} placeholder, append the path
    if (!runner.run.some((a) => a.includes('{file}'))) {
      cmdParts.push(`/code/code${runner.ext}`);
    }

    const innerCmd = cmdParts.join(' ');

    // Build docker run command
    const containerName = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const memoryLimit = options?.memoryMb ?? 512;
    const envFlags = options?.envVars
      ? Object.entries(options.envVars).map(([k, v]) => `-e ${k}=${v}`).join(' ')
      : '';

    const dockerCmd = [
      'docker run',
      '--rm',
      '--name', containerName,
      '-m', `${memoryLimit}m`,
      '--cpus', '1',
      '--network', 'none',
      '--pids-limit', '100',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '-v', `${tmpDir}:/code:ro`,
      envFlags,
      '-w', '/code',
      image,
      '/bin/sh', '-c',
      `timeout ${timeout} ${innerCmd}`,
    ].filter(Boolean).join(' ');

    log(`Running Docker container: ${image}`);
    log(`Memory limit: ${memoryLimit}MB, CPU: 1, Timeout: ${timeout}s`);

    const stdout = execSync(dockerCmd, {
      timeout: (timeout + 10) * 1000, // extra time for docker overhead
      maxBuffer: MAX_OUTPUT_SIZE,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const executionTime = Date.now() - startTime;
    log(`Completed in ${executionTime}ms`);

    return {
      stdout: stdout || '',
      stderr: '',
      exitCode: 0,
      executionTime,
      logs,
    };
  } catch (err: any) {
    const executionTime = Date.now() - startTime;

    if (err.status !== undefined) {
      log(`Exit code: ${err.status}`);
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        exitCode: err.status,
        executionTime,
        logs,
      };
    }

    if (err.killed || err.signal === 'SIGTERM') {
      log(`Timed out after ${timeout}s`);
      return {
        stdout: err.stdout || '',
        stderr: (err.stderr || '') + `\n[Error] Execution timed out after ${timeout} seconds`,
        exitCode: 124,
        executionTime,
        error: `Execution timed out after ${timeout} seconds`,
        logs,
      };
    }

    log(`Failed: ${err.message}`);
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: 1,
      executionTime,
      error: err.message,
      logs,
    };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function executeCommand(
  command: string,
  options?: CodeExecutionOptions,
): Promise<CodeExecutionResult> {
  return executeCode(command, 'bash', options);
}

function isAvailable(): boolean {
  return checkDocker();
}

async function getInfo(): Promise<SandboxInfo> {
  return {
    id: 'docker-provider',
    provider: 'docker',
    language: 'multi',
    uptime: 0,
    cpuUsage: undefined,
    memoryMb: undefined,
    memoryLimitMb: 512,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

export const dockerSandbox: SandboxProvider = {
  name: 'docker',
  executeCode,
  executeCommand,
  getInfo,
  kill: async () => {
    // Cleanup running containers
    try {
      execSync('docker rm -f $(docker ps -q --filter "name=sandbox_") 2>/dev/null', { stdio: 'ignore' });
    } catch { /* ignore */ }
  },
  keepAlive: async () => { /* no-op for docker */ },
  isAvailable,
};
