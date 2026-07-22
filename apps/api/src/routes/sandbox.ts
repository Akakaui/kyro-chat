/**
 * Sandbox API routes.
 *
 * Endpoints for executing code, installing packages, and managing sandbox
 * sessions. All routes are protected by enhanced authentication.
 *
 * @module routes/sandbox
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { executeCode, executeCommand, installPackages, sandboxPool } from '../services/sandbox/index.js';
import { SUPPORTED_LANGUAGES } from '../services/sandbox/types.js';
import { checkRateLimit } from '../middleware/rate-limit.js';

export const sandboxRoutes = new Hono();

// ── Rate limit: 100 executions per hour per user ─────────────────────────

const EXECUTION_LIMIT = 100;
const EXECUTION_WINDOW_MS = 3600_000; // 1 hour

function checkExecutionLimit(userId: string): boolean {
  const result = checkRateLimit(`sandbox:${userId}`, EXECUTION_LIMIT, EXECUTION_WINDOW_MS, 'sandbox');
  return result.allowed;
}

// ── Validation schemas ──────────────────────────────────────────────────

const executeSchema = z.object({
  code: z.string().min(1, 'Code is required').max(
    parseInt(process.env.E2B_MAX_CODE_LENGTH || '10000', 10),
    `Code exceeds maximum length`,
  ),
  language: z.enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]]).default('python'),
  timeout: z.number().int().min(1).max(300).optional(),
  memoryMb: z.number().int().min(64).max(2048).optional(),
  streamStdout: z.boolean().optional(),
  envVars: z.record(z.string()).optional(),
  workingDir: z.string().optional(),
  installDeps: z.boolean().optional(),
});

const installSchema = z.object({
  packages: z.array(z.string().min(1)).min(1, 'At least one package required'),
  language: z.enum(SUPPORTED_LANGUAGES as unknown as [string, ...string[]]).default('python'),
});

// ── POST /api/sandbox/execute ────────────────────────────────────────────
// Execute code in a sandbox

sandboxRoutes.post('/execute', async (c) => {
  const user = c.get('user');

  // Rate limit
  if (!checkExecutionLimit(user.id)) {
    return c.json({
      error: 'Sandbox execution rate limit exceeded. Maximum 100 executions per hour.',
    }, 429);
  }

  const body = await c.req.json();
  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    }, 400);
  }

  const { code, language, timeout, memoryMb, streamStdout, envVars, workingDir, installDeps } = parsed.data;

  console.log(`[Sandbox] User ${user.id} executing ${language} code (${code.length} chars)`);

  try {
    const result = await executeCode(code, language, {
      timeout,
      memoryMb,
      streamStdout,
      envVars,
      workingDir,
      installDeps,
    });

    return c.json(result);
  } catch (error: any) {
    console.error('[Sandbox] Execution error:', error);
    return c.json({
      stdout: '',
      stderr: error.message || 'Internal error',
      exitCode: 1,
      executionTime: 0,
      error: error.message || 'Internal error',
    }, 500);
  }
});

// ── POST /api/sandbox/install ────────────────────────────────────────────
// Install packages in a sandbox

sandboxRoutes.post('/install', async (c) => {
  const user = c.get('user');

  if (!checkExecutionLimit(user.id)) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  const body = await c.req.json();
  const parsed = installSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    }, 400);
  }

  const { packages, language } = parsed.data;

  try {
    const result = await installPackages(packages, language);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ── GET /api/sandbox/status ──────────────────────────────────────────────
// Get sandbox status and pool info

sandboxRoutes.get('/status', async (c) => {
  const user = c.get('user');

  const poolStats = sandboxPool.getPoolStats();

  return c.json({
    provider: process.env.E2B_API_KEY ? 'e2b' : 'local',
    userSandboxCount: poolStats.perUser[user.id] || 0,
    pool: poolStats,
    limits: {
      maxExecutionsPerHour: EXECUTION_LIMIT,
      maxPoolSize: poolStats.maxSize,
      maxPerUser: 3,
    },
  });
});

// ── POST /api/sandbox/kill ───────────────────────────────────────────────
// Kill all sandboxes for the current user

sandboxRoutes.post('/kill', async (c) => {
  const user = c.get('user');

  // In the pool, "release" is the closest analog to kill
  // For comprehensive cleanup, we drain all
  await sandboxPool.drainAll();

  console.log(`[Sandbox] User ${user.id} killed all sandboxes`);

  return c.json({
    success: true,
    message: 'All sandboxes terminated',
  });
});

// ── POST /api/sandbox/command ────────────────────────────────────────────
// Execute arbitrary command (use with caution)

sandboxRoutes.post('/command', async (c) => {
  const user = c.get('user');

  if (!checkExecutionLimit(user.id)) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  const body = await c.req.json();
  const { command } = body;

  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return c.json({ error: 'Command is required' }, 400);
  }

  const MAX_CMD_LENGTH = 5000;
  if (command.length > MAX_CMD_LENGTH) {
    return c.json({
      error: `Command exceeds maximum length of ${MAX_CMD_LENGTH} characters`,
    }, 400);
  }

  try {
    const result = await executeCommand(command);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
