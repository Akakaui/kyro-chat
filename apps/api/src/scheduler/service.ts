import { getDb } from '../db/init.js';

interface ScheduledTask {
  id: string;
  userId: string;
  agentId?: string;
  name: string;
  description?: string;
  type: 'once' | 'recurring';
  cronExpression?: string;
  scheduledAt?: number;
  payload: {
    type: 'chat' | 'email' | 'webhook' | 'code';
    data: Record<string, any>;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
}

class SchedulerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  /**
   * Create a scheduled task
   */
  create(
    userId: string,
    task: Omit<ScheduledTask, 'id' | 'userId' | 'status' | 'createdAt'>
  ): string {
    const db = getDb();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO scheduled_tasks (id, user_id, agent_id, name, description, type, cron_expression, scheduled_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      task.agentId || null,
      task.name,
      task.description || '',
      task.type,
      task.cronExpression || null,
      task.scheduledAt || null,
      JSON.stringify(task.payload)
    );

    // Schedule the task
    this.scheduleNext(id);

    return id;
  }

  /**
   * Get task by ID
   */
  get(id: string, userId: string): ScheduledTask | null {
    const db = getDb();
    const task = db.prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ? AND user_id = ?
    `).get(id, userId) as any;

    if (!task) return null;

    return this.parseTask(task);
  }

  /**
   * List user's tasks
   */
  list(userId: string): ScheduledTask[] {
    const db = getDb();
    const tasks = db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    return tasks.map(t => this.parseTask(t));
  }

  /**
   * Cancel a task
   */
  cancel(id: string, userId: string): boolean {
    const db = getDb();
    const result = db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'cancelled'
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    // Clear timer
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    return result.changes > 0;
  }

  /**
   * Delete a task
   */
  delete(id: string, userId: string): boolean {
    this.cancel(id, userId);

    const db = getDb();
    const result = db.prepare(`
      DELETE FROM scheduled_tasks WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }

  /**
   * Execute a task immediately
   */
  async execute(id: string): Promise<void> {
    const db = getDb();
    const task = db.prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ?
    `).get(id) as any;

    if (!task) return;

    const parsed = this.parseTask(task);

    // Update status
    db.prepare(`
      UPDATE scheduled_tasks SET status = 'running' WHERE id = ?
    `).run(id);

    try {
      // Execute based on task type
      switch (parsed.payload.type) {
        case 'chat':
          await this.executeChatTask(parsed);
          break;
        case 'email':
          await this.executeEmailTask(parsed);
          break;
        case 'webhook':
          await this.executeWebhookTask(parsed);
          break;
        case 'code':
          await this.executeCodeTask(parsed);
          break;
      }

      // Update status
      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'completed', last_run_at = unixepoch()
        WHERE id = ?
      `).run(id);
    } catch (error: any) {
      db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'failed'
        WHERE id = ?
      `).run(id);
      console.error(`Task ${id} failed:`, error);
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load and schedule all pending tasks
    const db = getDb();
    const tasks = db.prepare(`
      SELECT id FROM scheduled_tasks
      WHERE status = 'pending' AND type = 'recurring'
    `).all() as { id: string }[];

    for (const task of tasks) {
      this.scheduleNext(task.id);
    }

    console.log(`Scheduler started with ${tasks.length} recurring tasks`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;

    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    console.log('Scheduler stopped');
  }

  private scheduleNext(taskId: string): void {
    const task = this.get(taskId, '');
    if (!task || task.status === 'cancelled') return;

    // Simple interval-based scheduling (not full cron)
    // For production, use a proper cron library
    const interval = this.parseInterval(task.cronExpression || '1h');

    const timer = setTimeout(async () => {
      await this.execute(taskId);

      // Reschedule if recurring
      if (task.type === 'recurring') {
        this.scheduleNext(taskId);
      }
    }, interval);

    this.timers.set(taskId, timer);
  }

  private parseInterval(expr: string): number {
    // Simple interval parsing: "5m" = 5 minutes, "1h" = 1 hour, etc.
    const match = expr.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000; // Default 1 hour

    const [, num, unit] = match;
    const value = parseInt(num);

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  private async executeChatTask(task: ScheduledTask): Promise<void> {
    // TODO: Execute chat task with agent
    console.log('Executing chat task:', task.name);
  }

  private async executeEmailTask(task: ScheduledTask): Promise<void> {
    // TODO: Execute email task
    console.log('Executing email task:', task.name);
  }

  private async executeWebhookTask(task: ScheduledTask): Promise<void> {
    // TODO: Execute webhook task
    console.log('Executing webhook task:', task.name);
  }

  private async executeCodeTask(task: ScheduledTask): Promise<void> {
    // TODO: Execute code task in sandbox
    console.log('Executing code task:', task.name);
  }

  private parseTask(row: any): ScheduledTask {
    return {
      id: row.id,
      userId: row.user_id,
      agentId: row.agent_id,
      name: row.name,
      description: row.description,
      type: row.type,
      cronExpression: row.cron_expression,
      scheduledAt: row.scheduled_at,
      payload: JSON.parse(row.payload || '{}'),
      status: row.status,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      createdAt: row.created_at,
    };
  }
}

export const schedulerService = new SchedulerService();
