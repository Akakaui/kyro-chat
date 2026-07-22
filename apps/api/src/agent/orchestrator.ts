import { generateText, streamText, type CoreMessage, type CoreTool } from 'ai';
import { getModel } from './providers.js';
import { buildAITools, getAllRegisteredTools, getDefaultTools, executeRegisteredTool } from '../tools/registry.js';
import type { AgentConfig, AgentState, LifecycleHooks, ToolContext, ToolResult } from './types.js';
import type { SandboxToolContext } from '../tools/registry.js';

// Global pending permission map: permissionId → resolver callback
const pendingPermissions = new Map<string, { resolve: (allowed: boolean) => void }>();

export function resolvePermission(permissionId: string, allowed: boolean): boolean {
  const entry = pendingPermissions.get(permissionId);
  if (entry) {
    entry.resolve(allowed);
    pendingPermissions.delete(permissionId);
    return true;
  }
  return false;
}

// Global pending question map: questionId → resolver callback
const pendingQuestions = new Map<string, { resolve: (answer: string | string[]) => void }>();

export function resolveQuestion(questionId: string, answer: string | string[]): boolean {
  const entry = pendingQuestions.get(questionId);
  if (entry) {
    entry.resolve(answer);
    pendingQuestions.delete(questionId);
    return true;
  }
  return false;
}

/**
 * Ask a question to the user via the HITL question system.
 * Pushes a __QUESTION_REQUIRED__ marker into the queued events array,
 * then blocks until the user responds.
 */
export function askQuestion(
  queuedEvents: string[],
  question: string,
  type: 'single_choice' | 'multiple_choice' | 'free_text' | 'confirm',
  options?: Array<{ label: string; value: string }>,
  required: boolean = true,
): Promise<string | string[]> {
  const questionId = crypto.randomUUID();
  const payload = JSON.stringify({ id: questionId, question, type, options, required });

  return new Promise<string | string[]>((resolve) => {
    pendingQuestions.set(questionId, { resolve });
    queuedEvents.push(`\n__QUESTION_REQUIRED__:${payload}\n`);
  });
}

export class AgentOrchestrator {
  private state: AgentState;
  private config: AgentConfig;
  private hooks: LifecycleHooks;
  private sandboxId?: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.hooks = config.hooks || {};
    this.sandboxId = config.sandboxId;
    this.state = {
      messages: [],
      toolsUsed: [],
      iterations: 0,
      status: 'idle',
    };
  }

  /**
   * Set the sandbox ID for this orchestrator session.
   * When set, file/code tools will route to the E2B sandbox.
   */
  setSandboxId(sandboxId: string | undefined): void {
    this.sandboxId = sandboxId;
  }

  getSandboxId(): string | undefined {
    return this.sandboxId;
  }

  async run(userMessage: string): Promise<string> {
    this.state.status = 'running';
    this.state.startTime = Date.now();

    const context: SandboxToolContext = {
      userId: this.config.userId,
      agentId: this.config.agent.id,
      sessionId: this.config.sessionId,
      sandboxId: this.sandboxId,
      apiKey: this.config.apiKey,
      provider: this.config.provider,
    };

    // Hook: onStart
    await this.hooks.onStart?.({
      userId: this.config.userId,
      agentId: this.config.agent.id,
      message: userMessage,
    });

    this.state.messages.push({ role: 'user', content: userMessage });
    await this.hooks.onMessage?.({ role: 'user', content: userMessage });

    try {
      const model = getModel(
        this.config.provider,
        this.config.apiKey,
        this.config.model
      );
      const systemPrompt = this.buildSystemPrompt();
      const tools = this.buildTools(context);

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: this.state.messages as CoreMessage[],
        tools,
        maxSteps: 10,
        temperature: this.config.temperature ?? this.config.agent.temperature,
        onStepFinish: async ({ toolCalls, toolResults }) => {
          if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
              const toolArgs = (toolCall.args || {}) as Record<string, unknown>;
              const beforeResult = await this.hooks.onBeforeTool?.({
                toolName: toolCall.toolName,
                args: toolArgs,
                context,
              });
              if (beforeResult?.block) {
                await this.hooks.onToolBlocked?.({
                  toolName: toolCall.toolName,
                  args: toolArgs,
                  reason: beforeResult.reason || 'Blocked by permission system',
                  context,
                });
                this.state.toolsUsed.push({
                  tool: toolCall.toolName,
                  args: toolArgs,
                  result: { error: beforeResult.reason || 'Blocked by permission system' },
                });
                continue;
              }
              let toolResult = await executeRegisteredTool(toolCall.toolName, toolArgs, context);
              const afterResult = await this.hooks.onAfterTool?.({
                toolName: toolCall.toolName,
                args: toolArgs,
                result: toolResult,
                context,
              });
              if (afterResult) toolResult = afterResult;
              this.state.toolsUsed.push({
                tool: toolCall.toolName,
                args: toolArgs,
                result: toolResult,
              });
            }
          }
        },
      });

      // Update token usage
      if (result.usage) {
        this.state.tokenUsage = {
          prompt: result.usage.promptTokens,
          completion: result.usage.completionTokens,
          total: result.usage.promptTokens + result.usage.completionTokens,
        };
      }

      const finalResponse = result.text;
      this.state.messages.push({ role: 'assistant', content: result.text });
      await this.hooks.onMessage?.({ role: 'assistant', content: result.text });

      this.state.status = 'completed';
      this.state.endTime = Date.now();

      await this.hooks.onEnd?.({
        status: 'completed',
        iterations: this.state.iterations,
        toolsUsed: this.state.toolsUsed.map(t => t.tool),
      });

      return finalResponse || 'Agent completed without response.';
    } catch (error) {
      this.state.status = 'error';
      this.state.endTime = Date.now();

      await this.hooks.onError?.({
        error: error as Error,
        context,
      });

      await this.hooks.onEnd?.({
        status: 'error',
        iterations: this.state.iterations,
        toolsUsed: this.state.toolsUsed.map(t => t.tool),
      });

      throw error;
    }
  }

  async *runStream(userMessage: string): AsyncGenerator<string> {
    this.state.status = 'running';
    this.state.startTime = Date.now();

    const context: SandboxToolContext = {
      userId: this.config.userId,
      agentId: this.config.agent.id,
      sessionId: this.config.sessionId,
      sandboxId: this.sandboxId,
      apiKey: this.config.apiKey,
      provider: this.config.provider,
      // HITL: inject askQuestion so tools can pause and ask the user
      askQuestion: (question, type, options, required) =>
        askQuestion(queuedQuestionEvents, question, type, options, required),
    };

    // Hook: onStart
    await this.hooks.onStart?.({
      userId: this.config.userId,
      agentId: this.config.agent.id,
      message: userMessage,
    });

    this.state.messages.push({ role: 'user', content: userMessage });
    await this.hooks.onMessage?.({ role: 'user', content: userMessage });

    // Permission events to emit during streaming (set by onStepFinish, yielded by generator)
    const queuedPermissionEvents: string[] = [];
    // Question events to emit during streaming (set by askQuestion in context, yielded by generator)
    const queuedQuestionEvents: string[] = [];
    // Tool status events to emit during streaming (set by onStepFinish, yielded by generator)
    const queuedToolEvents: string[] = [];

    try {
      const model = getModel(
        this.config.provider,
        this.config.apiKey,
        this.config.model
      );
      const systemPrompt = this.buildSystemPrompt();
      const tools = this.buildTools(context);

      const stream = streamText({
        model,
        system: systemPrompt,
        messages: this.state.messages as CoreMessage[],
        tools,
        maxSteps: 10,
        temperature: this.config.temperature ?? this.config.agent.temperature,
        onStepFinish: async ({ toolCalls, toolResults, text, finishReason, isContinued }) => {
          if (toolCalls && toolCalls.length > 0) {
            for (let i = 0; i < toolCalls.length; i++) {
              const toolCall = toolCalls[i];
              const toolArgs = (toolCall.args || {}) as Record<string, unknown>;

              const beforeResult = await this.hooks.onBeforeTool?.({
                toolName: toolCall.toolName,
                args: toolArgs,
                context,
              });

              if (beforeResult?.block) {
                await this.hooks.onToolBlocked?.({
                  toolName: toolCall.toolName,
                  args: toolArgs,
                  reason: beforeResult.reason || 'Blocked by permission system',
                  context,
                });

                // Emit __TOOL_DONE__ with error status for blocked tool
                const toolDonePayload = JSON.stringify({
                  id: `tool-${Date.now()}`,
                  name: toolCall.toolName,
                  status: 'error',
                  error: beforeResult.reason || 'Blocked by permission system',
                });
                queuedToolEvents.push(`\n__TOOL_DONE__:${toolDonePayload}\n`);

                // Emit __PERMISSION_REQUIRED__ marker for the frontend
                const permissionId = crypto.randomUUID();
                const payload = JSON.stringify({
                  id: permissionId,
                  toolName: toolCall.toolName,
                  args: toolArgs,
                  reason: beforeResult.reason || 'Blocked by permission system',
                });
                queuedPermissionEvents.push(`\n__PERMISSION_REQUIRED__:${payload}\n`);

                // Wait for user response
                await new Promise<void>((resolve) => {
                  pendingPermissions.set(permissionId, { resolve: (allowed: boolean) => {
                    if (allowed) {
                      // Emit __TOOL_START__ for the retried tool
                      const toolStartPayload = JSON.stringify({
                        id: `tool-${Date.now()}`,
                        name: toolCall.toolName,
                        args: toolArgs,
                      });
                      queuedToolEvents.push(`\n__TOOL_START__:${toolStartPayload}\n`);

                      const resultPromise = executeRegisteredTool(toolCall.toolName, toolArgs, context);
                      resultPromise.then((result) => {
                        this.state.toolsUsed.push({
                          tool: toolCall.toolName,
                          args: toolArgs,
                          result,
                        });
                        // Emit __TOOL_DONE__ for completed tool
                        const toolDonePayload = JSON.stringify({
                          id: `tool-${Date.now()}`,
                          name: toolCall.toolName,
                          status: 'done',
                        });
                        queuedToolEvents.push(`\n__TOOL_DONE__:${toolDonePayload}\n`);
                      });
                    } else {
                      this.state.toolsUsed.push({
                        tool: toolCall.toolName,
                        args: toolArgs,
                        result: { error: 'User denied permission' },
                      });
                      // Emit __TOOL_DONE__ with error for denied tool
                      const toolDonePayload = JSON.stringify({
                        id: `tool-${Date.now()}`,
                        name: toolCall.toolName,
                        status: 'error',
                        error: 'User denied permission',
                      });
                      queuedToolEvents.push(`\n__TOOL_DONE__:${toolDonePayload}\n`);
                    }
                    resolve();
                  }});
                });

                continue;
              }

              // Emit __TOOL_START__ marker before tool execution
              const toolStartPayload = JSON.stringify({
                id: `tool-${Date.now()}`,
                name: toolCall.toolName,
                args: toolArgs,
              });
              queuedToolEvents.push(`\n__TOOL_START__:${toolStartPayload}\n`);

              let toolResult = await executeRegisteredTool(toolCall.toolName, toolArgs, context);

              const afterResult = await this.hooks.onAfterTool?.({
                toolName: toolCall.toolName,
                args: toolArgs,
                result: toolResult,
                context,
              });
              if (afterResult) {
                toolResult = afterResult;
              }

              this.state.toolsUsed.push({
                tool: toolCall.toolName,
                args: toolArgs,
                result: toolResult,
              });

              // Emit __TOOL_DONE__ marker after tool execution
              const toolDonePayload = JSON.stringify({
                id: `tool-${Date.now()}`,
                name: toolCall.toolName,
                status: 'done',
              });
              queuedToolEvents.push(`\n__TOOL_DONE__:${toolDonePayload}\n`);
            }
          }
        },
      });

      let fullText = '';

      for await (const chunk of stream.textStream) {
        fullText += chunk;
        yield chunk;

        // Yield any queued permission, question, and tool events
        while (queuedPermissionEvents.length > 0) {
          const event = queuedPermissionEvents.shift()!;
          yield event;
        }
        while (queuedQuestionEvents.length > 0) {
          const event = queuedQuestionEvents.shift()!;
          yield event;
        }
        while (queuedToolEvents.length > 0) {
          const event = queuedToolEvents.shift()!;
          yield event;
        }
      }

      this.state.messages.push({ role: 'assistant', content: fullText });
      await this.hooks.onMessage?.({ role: 'assistant', content: fullText });

      this.state.status = 'completed';
      this.state.endTime = Date.now();

      await this.hooks.onEnd?.({
        status: 'completed',
        iterations: this.state.iterations,
        toolsUsed: this.state.toolsUsed.map(t => t.tool),
      });
    } catch (error) {
      this.state.status = 'error';
      this.state.endTime = Date.now();

      await this.hooks.onError?.({
        error: error as Error,
        context,
      });

      await this.hooks.onEnd?.({
        status: 'error',
        iterations: this.state.iterations,
        toolsUsed: this.state.toolsUsed.map(t => t.tool),
      });

      throw error;
    }
  }

  private buildSystemPrompt(): string {
    let prompt = this.config.agent.systemPrompt || this.getDefaultSystemPrompt();

    if (this.config.userId) {
      prompt += '\n\nYou have access to a knowledge base. Use the knowledge_base tool to read, search, upload, or manage files in the knowledge base.';
    }

    return prompt;
  }

  private buildTools(context: SandboxToolContext): Record<string, CoreTool> {
    const allTools = getAllRegisteredTools();
    const hasSandbox = !!context.sandboxId;
    let enabledNames = this.config.agent.enabledTools || getDefaultTools(undefined, hasSandbox);

    // Filter out disabled tools
    const disabled = this.config.agent.disabledTools || [];
    enabledNames = enabledNames.filter(n => !disabled.includes(n));

    // Sub-agents cannot create artifacts or delegate further
    if (this.config.agent.type === 'sub') {
      enabledNames = enabledNames.filter(n => n !== 'create_artifact' && n !== 'delegate_to_agent');
    }

    // Filter to only tools that exist in registry (or sandbox tools if sandbox is available)
    const sandboxToolNames = hasSandbox ? [
      'execute_command', 'read_file', 'write_file', 'edit_file', 'patch_files',
      'search_files', 'search_content', 'list_files', 'http_request',
      'search_code', 'lint_code', 'install_package',
    ] : [];
    enabledNames = enabledNames.filter(n =>
      allTools.some(t => t.name === n) || sandboxToolNames.includes(n)
    );

    return buildAITools(enabledNames, context);
  }

  private getDefaultSystemPrompt(): string {
    return `You are a helpful AI assistant with access to various tools.

Your capabilities:
- Read, write, edit, and search files
- Execute code and shell commands
- Search the knowledge base
- Delegate tasks to specialized sub-agents
- Create artifacts (HTML, PDF, code)
- Browse and search the web
- Save and recall memories

When the user asks you to do something:
1. Think about what tools you need
2. Use the appropriate tools
3. Provide a clear, helpful response

Always explain what you're doing and why. If you need to use tools, describe what you're doing before and after.`;
  }

  getState(): AgentState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      messages: [],
      toolsUsed: [],
      iterations: 0,
      status: 'idle',
    };
  }
}
