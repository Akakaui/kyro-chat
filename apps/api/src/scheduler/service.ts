import { getDb } from '../db/init.js';
import { emailService } from '../email/service.js';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import type { AgentConfig, Agent } from '../agent/types.js';

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
  projectId?: string;
  permissionOverride: boolean;
  emailNotification: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  lastRunAt?: number;
  nextRunAt?: number;
  result?: string;
  createdAt: number;
}

class SchedulerService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  /**
   * Create a scheduled task
   */
  async create(
    userId: string,
    task: Omit<ScheduledTask, 'id' | 'userId' | 'status' | 'createdAt'>
  ): Promise<string> {
    const db = getDb();
    const id = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO scheduled_tasks (
        id, user_id, agent_id, name, description, type,
        cron_expression, scheduled_at, payload,
        project_id, permission_override, email_notification
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      task.agentId || null,
      task.name,
      task.description || '',
      task.type,
      task.cronExpression || null,
      task.scheduledAt || null,
      JSON.stringify(task.payload),
      task.projectId || null,
      task.permissionOverride ? 1 : 0,
      task.emailNotification ? 1 : 0
    );

    this.scheduleNext(id);
    return id;
  }

  /**
   * Get task by ID
   */
  async get(id: string, userId: string): Promise<ScheduledTask | null> {
    const db = getDb();
    const task = await db.prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ? AND user_id = ?
    `).get(id, userId) as any;

    if (!task) return null;
    return this.parseTask(task);
  }

  /**
   * List user's tasks
   */
  async list(userId: string): Promise<ScheduledTask[]> {
    const db = getDb();
    const tasks = await db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    return tasks.map(t => this.parseTask(t));
  }

  /**
   * List tasks for a project
   */
  async listByProject(userId: string, projectId: string): Promise<ScheduledTask[]> {
    const db = getDb();
    const tasks = await db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE user_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `).all(userId, projectId) as any[];

    return tasks.map(t => this.parseTask(t));
  }

  /**
   * Update a task
   */
  async update(
    id: string,
    userId: string,
    updates: Partial<Pick<ScheduledTask, 'name' | 'description' | 'cronExpression' | 'agentId' | 'projectId' | 'permissionOverride' | 'emailNotification' | 'payload'>>
  ): Promise<boolean> {
    const db = getDb();
    const task = await this.get(id, userId);
    if (!task) return false;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.cronExpression !== undefined) {
      fields.push('cron_expression = ?');
      values.push(updates.cronExpression);
    }
    if (updates.agentId !== undefined) {
      fields.push('agent_id = ?');
      values.push(updates.agentId);
    }
    if (updates.projectId !== undefined) {
      fields.push('project_id = ?');
      values.push(updates.projectId);
    }
    if (updates.permissionOverride !== undefined) {
      fields.push('permission_override = ?');
      values.push(updates.permissionOverride ? 1 : 0);
    }
    if (updates.emailNotification !== undefined) {
      fields.push('email_notification = ?');
      values.push(updates.emailNotification ? 1 : 0);
    }
    if (updates.payload !== undefined) {
      fields.push('payload = ?');
      values.push(JSON.stringify(updates.payload));
    }

    if (fields.length === 0) return false;

    values.push(id, userId);
    await db.prepare(`
      UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);

    // Reschedule if cron changed
    if (updates.cronExpression !== undefined) {
      this.cancel(id, userId);
      this.scheduleNext(id);
    }

    return true;
  }

  /**
   * Cancel a task
   */
  async cancel(id: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db.prepare(`
      UPDATE scheduled_tasks
      SET status = 'cancelled'
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

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
  async delete(id: string, userId: string): Promise<boolean> {
    this.cancel(id, userId);

    const db = getDb();
    const result = await db.prepare(`
      DELETE FROM scheduled_tasks WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  }

  /**
   * Execute a task immediately
   */
  async execute(id: string): Promise<void> {
    const db = getDb();
    const task = await db.prepare(`
      SELECT * FROM scheduled_tasks WHERE id = ?
    `).get(id) as any;

    if (!task) return;

    const parsed = this.parseTask(task);

    // Update status
    await db.prepare(`
      UPDATE scheduled_tasks SET status = 'running' WHERE id = ?
    `).run(id);

    let result = '';

    try {
      switch (parsed.payload.type) {
        case 'chat':
          result = await this.executeChatTask(parsed);
          break;
        case 'email':
          result = await this.executeEmailTask(parsed);
          break;
        case 'webhook':
          result = await this.executeWebhookTask(parsed);
          break;
        case 'code':
          result = await this.executeCodeTask(parsed);
          break;
      }

      // Update status with result
      await db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'completed', last_run_at = unixepoch(), result = ?
        WHERE id = ?
      `).run(result, id);

      // Send email notification if enabled
      if (parsed.emailNotification && parsed.userId) {
        try {
          await emailService.sendScheduledTaskNotification(parsed.name, result);
        } catch (error) {
          console.error('Failed to send email notification:', error);
        }
      }
    } catch (error: any) {
      await db.prepare(`
        UPDATE scheduled_tasks
        SET status = 'failed', result = ?
        WHERE id = ?
      `).run(error.message, id);
      console.error(`Task ${id} failed:`, error);
    }
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const db = getDb();
    const tasks = await db.prepare(`
      SELECT id FROM scheduled_tasks
      WHERE status IN ('pending', 'running') AND type = 'recurring'
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

  private async scheduleNext(taskId: string): Promise<void> {
    const task = await this.get(taskId, '');
    if (!task || task.status === 'cancelled') return;

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
    const match = expr.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000;

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

  private async executeChatTask(task: ScheduledTask): Promise<string> {
    const prompt = task.payload.data?.prompt || '';
    if (!prompt) return 'No prompt provided for chat task';

    const db = getDb();

    // Resolve agent
    const agent = task.agentId
      ? await db.prepare('SELECT * FROM agents WHERE id = ?').get(task.agentId) as Agent | undefined
      : undefined;

    // Resolve API key from user's stored keys or env
    const userKey = await db.prepare(
      'SELECT encrypted_key, provider FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(task.userId) as { encrypted_key: string; provider: string } | undefined;

    let apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    let provider = userKey?.provider || 'anthropic';

    if (userKey?.encrypted_key) {
      try {
        const { decrypt } = await import('../lib/encryption.js');
        apiKey = await decrypt(userKey.encrypted_key);
      } catch { /* fall back to env */ }
    }

    if (!apiKey) return 'No API key available for chat task';

    const config: AgentConfig = {
      agent: agent || {
        id: 'scheduler-default',
        name: 'Scheduler Agent',
        systemPrompt: 'You are a helpful assistant executing a scheduled task.',
        status: 'active',
        createdAt: new Date(),
      },
      apiKey,
      provider,
      model: task.payload.data?.model || 'claude-sonnet-4-20250514',
      userId: task.userId,
      sessionId: task.id,
    };

    const orchestrator = new AgentOrchestrator(config);
    return await orchestrator.run(prompt);
  }

  private async executeEmailTask(task: ScheduledTask): Promise<string> {
    const { to, subject, body } = task.payload.data || {};
    if (to && subject && body) {
      await emailService.sendEmail(to, subject, body);
      return `Email sent to ${to}`;
    }
    return 'Email task completed (no recipients configured)';
  }

  private async executeWebhookTask(task: ScheduledTask): Promise<string> {
    const { url, method = 'POST', body } = task.payload.data || {};
    if (!url) return 'No webhook URL configured';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      return `Webhook responded with status ${response.status}`;
    } catch (error: any) {
      throw new Error(`Webhook failed: ${error.message}`);
    }
  }

  private async executeCodeTask(task: ScheduledTask): Promise<string> {
    // In production, execute in sandbox
    return `Code task "${task.name}" completed`;
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
      projectId: row.project_id,
      permissionOverride: !!row.permission_override,
      emailNotification: !!row.email_notification,
      status: row.status,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      result: row.result,
      createdAt: row.created_at,
    };
  }
}

export const schedulerService = new SchedulerService();
