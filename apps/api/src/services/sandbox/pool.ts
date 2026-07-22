/**
 * Sandbox pool manager.
 *
 * Manages a pool of reusable sandbox sessions, enforcing per-user limits,
 * idle cleanup, and overall pool capacity.
 *
 * @module services/sandbox/pool
 */

import { e2bSandbox } from './e2b.js';
import { dockerSandbox } from './docker.js';
import type { PoolSandbox, PoolStats } from './types.js';

// ── Configuration ────────────────────────────────────────────────────────

const DEFAULT_MAX_POOL_SIZE = 10;
const MAX_SANDBOXES_PER_USER = 3;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60_000; // 60 seconds

// ── Select provider ──────────────────────────────────────────────────────

function getProvider(name: string) {
  switch (name) {
    case 'e2b': return e2bSandbox;
    case 'docker': return dockerSandbox;
    default: return e2bSandbox;
  }
}

// ── Pool implementation ──────────────────────────────────────────────────

class SandboxPool {
  private pool: Map<string, PoolSandbox> = new Map();
  private maxPoolSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxSize: number = DEFAULT_MAX_POOL_SIZE) {
    this.maxPoolSize = maxSize;
  }

  /**
   * Acquire a sandbox from the pool. Creates one if none available.
   */
  async acquireSandbox(
    userId: string,
    language: string = 'python',
  ): Promise<PoolSandbox> {
    // Check per-user limit
    const userCount = this.getUserCount(userId);
    if (userCount >= MAX_SANDBOXES_PER_USER) {
      // Try to reuse the oldest idle one
      const oldestIdle = this.findOldestIdle(userId);
      if (oldestIdle) {
        await this.releaseSandbox(oldestIdle.id);
        // Fall through to create
      } else {
        throw new Error(
          `User ${userId} already has ${MAX_SANDBOXES_PER_USER} active sandboxes. Release one first.`,
        );
      }
    }

    // Check pool capacity
    if (this.pool.size >= this.maxPoolSize) {
      // Try to evict the oldest idle sandbox overall
      const oldestIdle = this.findOldestIdle();
      if (oldestIdle) {
        console.log(`[Sandbox-Pool] Evicting idle sandbox ${oldestIdle.id} to make room`);
        await this.releaseSandbox(oldestIdle.id);
      } else {
        throw new Error(
          `Pool is full (${this.maxPoolSize}/${this.maxPoolSize}). Try again later.`,
        );
      }
    }

    // Determine the best provider
    const providerName = process.env.E2B_API_KEY
      ? 'e2b'
      : 'docker';

    const id = `pool_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`[Sandbox-Pool] Creating sandbox ${id} for user ${userId} (${language}, ${providerName})`);

    const sandbox: PoolSandbox = {
      id,
      userId,
      language,
      provider: providerName,
      handle: { provider: providerName, language },
      createdAt: Date.now(),
      lastUsed: Date.now(),
      busy: false,
    };

    this.pool.set(id, sandbox);
    return sandbox;
  }

  /**
   * Release a sandbox back to the pool.
   */
  async releaseSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.pool.get(sandboxId);
    if (!sandbox) return;

    sandbox.busy = false;
    sandbox.lastUsed = Date.now();

    // If it's been idle too long, remove it
    if (Date.now() - sandbox.lastUsed > IDLE_TIMEOUT_MS) {
      this.pool.delete(sandboxId);
      console.log(`[Sandbox-Pool] Released and removed idle sandbox ${sandboxId}`);
    }
  }

  /**
   * Get pool utilisation statistics.
   */
  getPoolStats(): PoolStats {
    const now = Date.now();
    let activeCount = 0;
    let busyCount = 0;
    let idleCount = 0;
    const perUser: Record<string, number> = {};

    for (const sandbox of this.pool.values()) {
      activeCount++;
      if (sandbox.busy) busyCount++;
      else idleCount++;

      perUser[sandbox.userId] = (perUser[sandbox.userId] || 0) + 1;
    }

    return {
      maxSize: this.maxPoolSize,
      activeCount,
      busyCount,
      idleCount,
      perUser,
    };
  }

  /**
   * Remove sandboxes that have been idle too long.
   */
  cleanupIdleSandboxes(maxIdleMs: number = IDLE_TIMEOUT_MS): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, sandbox] of this.pool) {
      if (!sandbox.busy && now - sandbox.lastUsed >= maxIdleMs) {
        this.pool.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Sandbox-Pool] Cleaned up ${cleaned} idle sandboxes`);
    }

    return cleaned;
  }

  /**
   * Start periodic cleanup of idle sandboxes.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;

    console.log(`[Sandbox-Pool] Starting cleanup timer (every ${CLEANUP_INTERVAL_MS / 1000}s)`);
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleSandboxes();
    }, CLEANUP_INTERVAL_MS);

    if (this.cleanupTimer?.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop periodic cleanup.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Drain (remove) all sandboxes from the pool.
   */
  async drainAll(): Promise<void> {
    const ids = Array.from(this.pool.keys());
    for (const id of ids) {
      await this.releaseSandbox(id);
    }
    this.pool.clear();
    console.log(`[Sandbox-Pool] Drained ${ids.length} sandboxes`);
  }

  /**
   * Update pool size limit at runtime.
   */
  setMaxPoolSize(size: number): void {
    this.maxPoolSize = Math.max(1, size);
    console.log(`[Sandbox-Pool] Max pool size set to ${this.maxPoolSize}`);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private getUserCount(userId: string): number {
    let count = 0;
    for (const sandbox of this.pool.values()) {
      if (sandbox.userId === userId) count++;
    }
    return count;
  }

  private findOldestIdle(userId?: string): PoolSandbox | undefined {
    let oldest: PoolSandbox | undefined;
    for (const sandbox of this.pool.values()) {
      if (sandbox.busy) continue;
      if (userId && sandbox.userId !== userId) continue;
      if (!oldest || sandbox.lastUsed < oldest.lastUsed) {
        oldest = sandbox;
      }
    }
    return oldest;
  }
}

export const sandboxPool = new SandboxPool();
