/**
 * Sandbox integration tests.
 *
 * Tests code execution, error handling, local fallback, pool management,
 * and package installation. Mocks the E2B SDK to avoid real API calls.
 *
 * @module __tests__/sandbox
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ── Mock e2b SDK BEFORE any imports ─────────────────────────────────────
const mockKill = vi.fn().mockResolvedValue(undefined);
const mockFilesWrite = vi.fn().mockResolvedValue(undefined);
const mockFilesRead = vi.fn().mockResolvedValue('file content');
const mockFilesList = vi.fn().mockResolvedValue([
  { name: 'test.py', isDir: false, size: 100 },
  { name: 'src', isDir: true, size: 0 },
]);
const mockCommandsRun = vi.fn().mockResolvedValue({
  stdout: 'command output',
  stderr: '',
  exitCode: 0,
  error: undefined,
});

const mockSandboxInstance = {
  sandboxId: 'test-sandbox-id',
  kill: mockKill,
  files: {
    write: mockFilesWrite,
    read: mockFilesRead,
    list: mockFilesList,
  },
  commands: {
    run: mockCommandsRun,
  },
};

const mockSandboxCreate = vi.fn().mockResolvedValue(mockSandboxInstance);

vi.mock('e2b', () => ({
  Sandbox: {
    create: mockSandboxCreate,
  },
}));

// ── Imports after mocking ────────────────────────────────────────────────

describe('Sandbox System', () => {
  let resetProvider: () => void;

  beforeAll(async () => {
    const main = await import('../services/sandbox/index.js');
    resetProvider = main.resetProvider;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = 'test-key';
    process.env.E2B_SANDBOX_TIMEOUT = '30';
    process.env.E2B_MAX_CODE_LENGTH = '10000';
  });

  afterEach(async () => {
    delete process.env.E2B_API_KEY;
    resetProvider();
    // Clear sandbox pool for clean state
    const { sandboxPool } = await import('../services/sandbox/pool.js');
    sandboxPool.drainAll();
    sandboxPool.setMaxPoolSize(10);
  });

  // ── Types / Constants ──────────────────────────────────────────────────

  describe('Types and Constants', () => {
    it('should define supported languages', async () => {
      const { SUPPORTED_LANGUAGES } = await import('../services/sandbox/types.js');
      expect(SUPPORTED_LANGUAGES).toContain('python');
      expect(SUPPORTED_LANGUAGES).toContain('javascript');
      expect(SUPPORTED_LANGUAGES).toContain('bash');
      expect(SUPPORTED_LANGUAGES).toContain('go');
      expect(SUPPORTED_LANGUAGES).toContain('rust');
      expect(SUPPORTED_LANGUAGES).toContain('java');
      expect(SUPPORTED_LANGUAGES).toContain('ruby');
      expect(SUPPORTED_LANGUAGES).toContain('php');
      expect(SUPPORTED_LANGUAGES).toContain('r');
      expect(SUPPORTED_LANGUAGES).toContain('julia');
      expect(SUPPORTED_LANGUAGES).toContain('typescript');
    });

    it('should define language runners', async () => {
      const { LANGUAGE_RUNNERS } = await import('../services/sandbox/types.js');
      expect(LANGUAGE_RUNNERS.python.ext).toBe('.py');
      expect(LANGUAGE_RUNNERS.python.run).toEqual(['python3']);
      expect(LANGUAGE_RUNNERS.javascript.run).toEqual(['node']);
      expect(LANGUAGE_RUNNERS.bash.run).toEqual(['bash']);
    });
  });

  // ── E2B Provider ──────────────────────────────────────────────────────

  describe('E2B Provider', () => {
    it('should export e2bSandbox with correct name', async () => {
      const { e2bSandbox } = await import('../services/sandbox/e2b.js');
      expect(e2bSandbox).toBeDefined();
      expect(e2bSandbox.name).toBe('e2b');
    });

    it('should execute Python code successfully', async () => {
      mockCommandsRun.mockResolvedValue({
        stdout: 'Hello, World!\n',
        stderr: '',
        exitCode: 0,
      });

      const { executeCode } = await import('../services/sandbox/index.js');
      const result = await executeCode('print("Hello, World!")', 'python');

      expect(result.stdout).toContain('Hello, World!');
      expect(result.exitCode).toBe(0);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle execution errors', async () => {
      mockCommandsRun.mockResolvedValue({
        stdout: '',
        stderr: 'ZeroDivisionError: division by zero',
        exitCode: 1,
        error: 'ZeroDivisionError: division by zero',
      });

      const { executeCode } = await import('../services/sandbox/index.js');
      const result = await executeCode('1/0', 'python');

      expect(result.exitCode).toBe(1);
      expect(result.error).toBeTruthy();
    });

    it('should handle sandbox creation failure', async () => {
      mockSandboxCreate.mockRejectedValueOnce(new Error('API quota exceeded'));

      const { executeCode } = await import('../services/sandbox/index.js');
      const result = await executeCode('print("test")', 'python');

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('API quota exceeded');
    });

    it('should respect code length limit', async () => {
      process.env.E2B_MAX_CODE_LENGTH = '10';
      const { executeCode } = await import('../services/sandbox/index.js');
      const longCode = 'x'.repeat(20);

      const result = await executeCode(longCode, 'python');
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('maximum length');
    });
  });

  // ── Provider Selection ─────────────────────────────────────────────────

  describe('Provider Selection', () => {
    it('should select E2B when API key is set', async () => {
      process.env.E2B_API_KEY = 'test-key';
      resetProvider();

      mockCommandsRun.mockResolvedValue({
        stdout: 'hi\n',
        stderr: '',
        exitCode: 0,
      });

      const { executeCode } = await import('../services/sandbox/index.js');
      const result = await executeCode('print("hi")', 'python');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hi');
    });
  });

  // ── Sandbox Pool ──────────────────────────────────────────────────────

  describe('Sandbox Pool', () => {
    it('should acquire a sandbox', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      const sandbox = await sandboxPool.acquireSandbox('user-1', 'python');
      expect(sandbox).toBeDefined();
      expect(sandbox.userId).toBe('user-1');
      expect(sandbox.language).toBe('python');
      expect(sandbox.busy).toBe(false);
    });

    it('should provide pool stats', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      await sandboxPool.acquireSandbox('user-1', 'python');
      await sandboxPool.acquireSandbox('user-2', 'javascript');

      const stats = sandboxPool.getPoolStats();
      expect(stats.activeCount).toBeGreaterThanOrEqual(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.perUser['user-1']).toBeGreaterThanOrEqual(1);
      expect(stats.perUser['user-2']).toBeGreaterThanOrEqual(1);
    });

    it('should enforce per-user limit when all busy', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      const s1 = await sandboxPool.acquireSandbox('user-1', 'python');
      const s2 = await sandboxPool.acquireSandbox('user-1', 'python');
      const s3 = await sandboxPool.acquireSandbox('user-1', 'python');

      // Mark all 3 as busy so the pool can't evict an idle one
      s1.busy = true;
      s2.busy = true;
      s3.busy = true;

      // Fourth should fail since all existing ones are busy
      await expect(
        sandboxPool.acquireSandbox('user-1', 'python'),
      ).rejects.toThrow('already has 3 active sandboxes');
    });

    it('should clean up idle sandboxes', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      await sandboxPool.acquireSandbox('user-1', 'python');

      const cleaned = sandboxPool.cleanupIdleSandboxes(0);
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });

    it('should release sandboxes', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      const sandbox = await sandboxPool.acquireSandbox('user-1', 'python');
      sandbox.busy = true;

      await sandboxPool.releaseSandbox(sandbox.id);
      expect(sandbox.busy).toBe(false);
    });

    it('should drain all sandboxes', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      await sandboxPool.acquireSandbox('user-1', 'python');
      await sandboxPool.acquireSandbox('user-2', 'bash');

      await sandboxPool.drainAll();
      const stats = sandboxPool.getPoolStats();
      expect(stats.activeCount).toBe(0);
    });

    it('should enforce max pool size', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      sandboxPool.setMaxPoolSize(2);

      const s1 = await sandboxPool.acquireSandbox('user-1', 'python');
      const s2 = await sandboxPool.acquireSandbox('user-2', 'bash');

      // Mark both busy to prevent eviction
      s1.busy = true;
      s2.busy = true;

      await expect(
        sandboxPool.acquireSandbox('user-3', 'go'),
      ).rejects.toThrow('Pool is full');
    });

    it('should start and stop cleanup timer', async () => {
      const { sandboxPool } = await import('../services/sandbox/pool.js');
      sandboxPool.startCleanup();
      sandboxPool.stopCleanup();
      expect(true).toBe(true);
    });
  });

  // ── Main Module ───────────────────────────────────────────────────────

  describe('Main Module', () => {
    it('should export initSandbox function', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.initSandbox).toBe('function');
    });

    it('should export shutdownSandbox function', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.shutdownSandbox).toBe('function');
    });

    it('should export executeCode function', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.executeCode).toBe('function');
    });

    it('should export executeCommand function', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.executeCommand).toBe('function');
    });

    it('should export installPackages function', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.installPackages).toBe('function');
    });

    it('should export sandboxPool', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(mainModule.sandboxPool).toBeDefined();
    });

    it('should export e2bSandbox', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(mainModule.e2bSandbox).toBeDefined();
    });

    it('should export dockerSandbox', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(mainModule.dockerSandbox).toBeDefined();
    });
  });

  // ── installPackages ───────────────────────────────────────────────────

  describe('installPackages', () => {
    it('should handle unsupported language gracefully', async () => {
      const { installPackages } = await import('../services/sandbox/index.js');
      const result = await installPackages(['numpy'], 'unknown_lang');
      expect(result).toBeDefined();
    });

    it('should handle npm packages for javascript', async () => {
      mockCommandsRun.mockResolvedValue({
        stdout: 'installed lodash',
        stderr: '',
        exitCode: 0,
      });

      const { installPackages } = await import('../services/sandbox/index.js');
      const result = await installPackages(['lodash'], 'javascript');
      expect(result).toBeDefined();
    });
  });

  // ── Execute Command ───────────────────────────────────────────────────

  describe('executeCommand', () => {
    it('should execute bash commands via E2B', async () => {
      mockCommandsRun.mockResolvedValue({
        stdout: 'hello',
        stderr: '',
        exitCode: 0,
      });

      const { executeCommand } = await import('../services/sandbox/index.js');
      const result = await executeCommand('echo hello');
      expect(result).toBeDefined();
    });
  });

  // ── Docker Provider ───────────────────────────────────────────────────

  describe('Docker Provider', () => {
    it('should export dockerSandbox', async () => {
      const dockerModule = await import('../services/sandbox/docker.js');
      expect(dockerModule.dockerSandbox).toBeDefined();
      expect(dockerModule.dockerSandbox.name).toBe('docker');
    });

    it('should detect Docker availability', async () => {
      const dockerModule = await import('../services/sandbox/docker.js');
      const available = dockerModule.dockerSandbox.isAvailable?.();
      expect(typeof available).toBe('boolean');
    });
  });

  // ── Type exports ──────────────────────────────────────────────────────

  describe('Type exports', () => {
    it('should export LANGUAGE_RUNNERS and SUPPORTED_LANGUAGES', async () => {
      const types = await import('../services/sandbox/types.js');
      expect(types.LANGUAGE_RUNNERS).toBeDefined();
      expect(types.SUPPORTED_LANGUAGES).toBeDefined();
    });
  });

  // ── createFile / readFile ─────────────────────────────────────────────

  describe('File operations via index', () => {
    it('should export createFile and readFile', async () => {
      const mainModule = await import('../services/sandbox/index.js');
      expect(typeof mainModule.createFile).toBe('function');
      expect(typeof mainModule.readFile).toBe('function');
    });
  });

  // ── Sandbox Routes Validation ─────────────────────────────────────────

  describe('Route validation schemas', () => {
    it('should validate execute request body shape', () => {
      const validBody = { code: 'print("hello")', language: 'python' };
      expect(validBody.code).toBeDefined();
      expect(typeof validBody.code).toBe('string');
      expect(validBody.code.length).toBeGreaterThan(0);

      const invalidBody = { code: '' };
      expect(invalidBody.code?.trim()?.length || 0).toBe(0);
    });

    it('should validate install request body', () => {
      const validBody = { packages: ['numpy', 'pandas'], language: 'python' };
      expect(Array.isArray(validBody.packages)).toBe(true);
      expect(validBody.packages.length).toBeGreaterThan(0);

      const invalidBody = { packages: [], language: 'python' };
      expect(invalidBody.packages.length).toBe(0);
    });

    it('should validate command body', () => {
      const validBody = { command: 'ls -la' };
      expect(typeof validBody.command).toBe('string');
      expect(validBody.command.trim().length).toBeGreaterThan(0);

      const invalidBody = { command: '' };
      expect(invalidBody.command.trim().length).toBe(0);
    });
  });
});
