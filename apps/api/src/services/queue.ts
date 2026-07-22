// ---------------------------------------------------------------------------
// Job Queue
//
// Simple Redis-backed job queue using lists.
// Supports delayed jobs, job removal, and queue inspection.
// Falls back to in-memory queue when Redis is unavailable.
// ---------------------------------------------------------------------------

import { getRedis } from './redis.js';
import type { Job, JobType, JobOptions, JobHandler } from './queue-types.js';
import { generateJobId } from './queue-types.js';

// ── Queue Service ─────────────────────────────────────────────────────────

export class QueueService {
  private handlers = new Map<JobType, JobHandler>();
  private inMemoryQueues = new Map<string, Job[]>();
  private processing = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Enqueue a job for processing.
   *
   * @param queueName - Logical queue name (e.g. "email-send", "token-refresh")
   * @param job - Job data (will be wrapped with metadata)
   * @param options - Optional job options (delay, maxAttempts)
   * @returns The created job with its assigned ID
   */
  async enqueue<T>(
    queueName: JobType | string,
    jobData: T,
    options?: JobOptions,
  ): Promise<Job<T>> {
    const fullJob: Job<T> = {
      id: generateJobId(),
      type: queueName as JobType,
      data: jobData,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
    };

    const serialized = JSON.stringify(fullJob);
    const redis = getRedis();

    if (options?.delay && options.delay > 0) {
      const delayedKey = `queue:${queueName}:delayed`;
      const executeAt = Date.now() + options.delay * 1000;
      await redis.hset(delayedKey, fullJob.id, serialized);
      await redis.hset(`queue:${queueName}:delayed:times`, fullJob.id, String(executeAt));
    } else {
      await redis.lpush(`queue:${queueName}:pending`, serialized);
      if (!redis.isConnected()) {
        this.pushInMemory(queueName, fullJob);
      }
    }

    return fullJob;
  }

  /**
   * Register a handler for a specific job type.
   */
  process<T>(jobType: JobType, handler: JobHandler<T>): void {
    if (this.handlers.has(jobType)) {
      console.warn(`[Queue] Overwriting handler for job type: ${jobType}`);
    }
    this.handlers.set(jobType, handler as JobHandler);
    if (!this.processing) this.startProcessing();
  }

  /**
   * Get the current length of a queue.
   */
  async getQueueLength(queueName: string): Promise<number> {
    const redis = getRedis();
    if (redis.isConnected()) {
      return redis.llen(`queue:${queueName}:pending`);
    }
    return this.inMemoryQueues.get(queueName)?.length ?? 0;
  }

  /**
   * Remove a specific job from a queue by ID.
   */
  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const redis = getRedis();

    if (redis.isConnected()) {
      const jobs = await redis.lrange(`queue:${queueName}:pending`, 0, -1);
      for (const raw of jobs) {
        try {
          const job = JSON.parse(raw) as Job;
          if (job.id === jobId) {
            const client = redis.getClient();
            if (client) {
              await client.lrem(`queue:${queueName}:pending`, 1, raw);
            }
            return true;
          }
        } catch { /* skip malformed */ }
      }
      return false;
    }

    const queue = this.inMemoryQueues.get(queueName);
    if (!queue) return false;
    const idx = queue.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
  }

  /**
   * List all pending jobs in a queue.
   */
  async getPendingJobs(queueName: string): Promise<Job[]> {
    const redis = getRedis();
    if (redis.isConnected()) {
      const raw = await redis.lrange(`queue:${queueName}:pending`, 0, -1);
      return raw
        .map((r) => {
          try { return JSON.parse(r) as Job; } catch { return null; }
        })
        .filter(Boolean) as Job[];
    }
    return this.inMemoryQueues.get(queueName) ?? [];
  }

  /**
   * Start the processing loop.
   */
  startProcessing(): void {
    if (this.processing) return;
    this.processing = true;

    this.pollTimer = setInterval(() => {
      this.pollQueues().catch((err) => {
        console.error('[Queue] Error polling queues:', err);
      });
    }, 500);

    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  /**
   * Stop the processing loop.
   */
  stopProcessing(): void {
    this.processing = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Poll all registered queues for new jobs.
   */
  private async pollQueues(): Promise<void> {
    for (const [jobType, handler] of this.handlers.entries()) {
      await this.processNext(jobType, handler);
    }
    for (const jobType of this.handlers.keys()) {
      await this.processDelayed(jobType);
    }
  }

  /**
   * Process the next job from a specific queue.
   */
  private async processNext(
    queueName: string,
    handler: JobHandler,
  ): Promise<void> {
    const redis = getRedis();
    let raw: string | null;

    if (redis.isConnected()) {
      raw = await redis.rpop(`queue:${queueName}:pending`);
      if (!raw) return;
    } else {
      const queue = this.inMemoryQueues.get(queueName);
      if (!queue || queue.length === 0) return;
      raw = JSON.stringify(queue.shift()!);
    }

    let job: Job;
    try {
      job = JSON.parse(raw);
    } catch {
      console.error(`[Queue] Malformed job in ${queueName}:`, raw);
      return;
    }

    await this.executeJob(queueName, job, handler);
  }

  /**
   * Check delayed jobs whose time has come.
   */
  private async processDelayed(queueName: string): Promise<void> {
    const redis = getRedis();
    const delayedKey = `queue:${queueName}:delayed`;
    const timesKey = `queue:${queueName}:delayed:times`;

    if (!redis.isConnected()) return;

    const times = await redis.hgetall(timesKey);
    const now = Date.now();

    for (const [jobId, timeStr] of Object.entries(times)) {
      const executeAt = parseInt(timeStr, 10);
      if (now >= executeAt) {
        const raw = await redis.hget(delayedKey, jobId);
        if (raw) {
          await redis.lpush(`queue:${queueName}:pending`, raw);
          await redis.hdel(delayedKey, jobId);
          await redis.hdel(timesKey, jobId);
        }
      }
    }
  }

  /**
   * Execute a single job with error handling and retry logic.
   */
  private async executeJob(
    queueName: string,
    job: Job,
    handler: JobHandler,
  ): Promise<void> {
    job.attempts++;

    try {
      await handler(job);
      console.log(`[Queue] ✅ Job ${job.id} (${job.type}) completed`);
    } catch (err) {
      console.error(`[Queue] ❌ Job ${job.id} (${job.type}) failed:`, (err as Error).message);

      if (job.attempts < job.maxAttempts) {
        const backoff = Math.min(job.attempts * 5, 60);
        console.log(`[Queue] Retrying job ${job.id} in ${backoff}s (attempt ${job.attempts}/${job.maxAttempts})`);
        await this.enqueue(queueName, job.data, {
          delay: backoff,
          maxAttempts: job.maxAttempts,
        });
      } else {
        console.error(`[Queue] 💀 Job ${job.id} (${job.type}) exhausted all ${job.maxAttempts} attempts`);
        const redis = getRedis();
        await redis.lpush(`queue:${queueName}:dead`, JSON.stringify(job));
      }
    }
  }

  private pushInMemory(queueName: string, job: Job): void {
    let queue = this.inMemoryQueues.get(queueName);
    if (!queue) {
      queue = [];
      this.inMemoryQueues.set(queueName, queue);
    }
    queue.push(job);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let instance: QueueService | null = null;

export function getQueue(): QueueService {
  if (!instance) {
    instance = new QueueService();
  }
  return instance;
}

export function _resetQueueSingleton(): void {
  if (instance) {
    instance.stopProcessing();
    instance = null;
  }
}
