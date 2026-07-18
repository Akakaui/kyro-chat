import { generateText, streamText, type CoreMessage, type CoreTool } from 'ai';
import { getModel } from './providers.js';
import { buildAITools, getAllRegisteredTools, getDefaultTools, executeRegisteredTool } from '../tools/registry.js';
import type { AgentConfig, AgentState, LifecycleHooks, ToolContext, ToolResult } from './types.js';

export class AgentOrchestrator {
  private state: AgentState;
  private config: AgentConfig;
  private hooks: LifecycleHooks;

  constructor(config: AgentConfig) {
    this.config = config;
    this.hooks = config.hooks || {};
    this.state = {
      messages: [],
      toolsUsed: [],
      iterations: 0,
      status: 'idle',
    };
  }

  async run(userMessage: string): Promise<string> {
    this.state.status = 'running';
    this.state.startTime = Date.now();

    const context: ToolContext = {
      userId: this.config.userId,
      agentId: this.config.agent.id,
      sessionId: this.config.sessionId,
    };

    // Hook: onStart
    await this.hooks.onStart?.({
      userId: this.config.userId,
      agentId: this.config.agent.id,
      message: userMessage,
    });

    this.state.messages.push({ role: 'user', content: userMessage });
    await this.hooks.onMessage?.({ role: 'user', content: userMessage });

    let finalResponse = '';
    const maxIter = this.config.maxIterations || this.config.agent.maxIterations || 10;

    try {
      for (let i = 0; i < maxIter; i++) {
        this.state.iterations = i + 1;

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
          maxSteps: 5,
          temperature: this.config.temperature ?? this.config.agent.temperature,
        });

        // Update token usage
        if (result.usage) {
          this.state.tokenUsage = {
            prompt: result.usage.promptTokens,
            completion: result.usage.completionTokens,
            total: result.usage.promptTokens + result.usage.completionTokens,
          };
        }

        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const toolCall of result.toolCalls) {
            const toolArgs = (toolCall.args || {}) as Record<string, unknown>;

            // Hook: onBeforeTool (can block)
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

            // Execute tool
            let toolResult = await executeRegisteredTool(toolCall.toolName, toolArgs, context);

            // Hook: onAfterTool (can modify result)
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
          }

          if (result.text) {
            finalResponse = result.text;
            this.state.messages.push({ role: 'assistant', content: result.text });
            await this.hooks.onMessage?.({ role: 'assistant', content: result.text });
          }
          break;
        }

        finalResponse = result.text;
        this.state.messages.push({ role: 'assistant', content: result.text });
        await this.hooks.onMessage?.({ role: 'assistant', content: result.text });
        break;
      }

      this.state.status = 'completed';
      this.state.endTime = Date.now();

      // Hook: onEnd
      await this.hooks.onEnd?.({
        status: 'completed',
        iterations: this.state.iterations,
        toolsUsed: this.state.toolsUsed.map(t => t.tool),
      });

      return finalResponse || 'Agent completed without response.';
    } catch (error) {
      this.state.status = 'error';
      this.state.endTime = Date.now();

      // Hook: onError
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

    const context: ToolContext = {
      userId: this.config.userId,
      agentId: this.config.agent.id,
      sessionId: this.config.sessionId,
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

      const stream = streamText({
        model,
        system: systemPrompt,
        messages: this.state.messages as CoreMessage[],
        tools,
        maxSteps: 5,
        temperature: this.config.temperature ?? this.config.agent.temperature,
      });

      let fullText = '';

      for await (const chunk of stream.textStream) {
        fullText += chunk;
        // Hook: onToken
        await this.hooks.onToken?.({ token: chunk, context });
        yield chunk;
      }

      this.state.messages.push({ role: 'assistant', content: fullText });
      await this.hooks.onMessage?.({ role: 'assistant', content: fullText });

      // Process tool calls after stream completes
      const toolCalls = await stream.toolCalls;
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
              reason: beforeResult.reason || 'Blocked',
              context,
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
      prompt += '\n\nYou have access to a knowledge base. Use the search_knowledge tool to find relevant information.';
    }

    return prompt;
  }

  private buildTools(context: ToolContext): Record<string, CoreTool> {
    const allTools = getAllRegisteredTools();
    let enabledNames = this.config.agent.enabledTools || getDefaultTools();

    // Filter out disabled tools
    const disabled = this.config.agent.disabledTools || [];
    enabledNames = enabledNames.filter(n => !disabled.includes(n));

    // Filter to only tools that exist in registry
    enabledNames = enabledNames.filter(n => allTools.some(t => t.name === n));

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
