import { getDb } from '../db/init.js';
import { AgentOrchestrator } from './orchestrator.js';
import type { Agent, SubAgentTask } from './types.js';

export class SubAgentManager {
  private activeTasks: Map<string, SubAgentTask> = new Map();

  async delegate(
    parentAgentId: string,
    childAgentId: string,
    task: string,
    apiKey: string,
    provider: string
  ): Promise<string> {
    const db = getDb();

    // Get child agent details
    const childAgent = db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(childAgentId) as Agent | undefined;

    if (!childAgent) {
      throw new Error(`Sub-agent not found: ${childAgentId}`);
    }

    // Create task record
    const taskId = crypto.randomUUID();
    const subTask: SubAgentTask = {
      id: taskId,
      parentAgentId,
      childAgentId,
      task,
      status: 'running',
      createdAt: Date.now(),
    };

    this.activeTasks.set(taskId, subTask);

    try {
      // Create orchestrator for child agent
      const orchestrator = new AgentOrchestrator(
        childAgent,
        apiKey,
        provider,
        childAgent.model || 'claude-sonnet-4-20250514'
      );

      // Run the task
      const result = await orchestrator.run(task);

      subTask.status = 'completed';
      subTask.result = result;

      return result;
    } catch (error: any) {
      subTask.status = 'failed';
      subTask.result = error.message;
      throw error;
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  async delegateStream(
    parentAgentId: string,
    childAgentId: string,
    task: string,
    apiKey: string,
    provider: string
  ): Promise<AsyncGenerator<string>> {
    const db = getDb();

    const childAgent = db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(childAgentId) as Agent | undefined;

    if (!childAgent) {
      throw new Error(`Sub-agent not found: ${childAgentId}`);
    }

    const orchestrator = new AgentOrchestrator(
      childAgent,
      apiKey,
      provider,
      childAgent.model || 'claude-sonnet-4-20250514'
    );

    return orchestrator.runStream(task);
  }

  getActiveTasks(): SubAgentTask[] {
    return Array.from(this.activeTasks.values());
  }

  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.result = 'Cancelled by user';
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }
}

export const subAgentManager = new SubAgentManager();
