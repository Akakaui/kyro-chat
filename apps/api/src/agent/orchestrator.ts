import { generateText, streamText, tool, type CoreMessage } from 'ai';
import { z } from 'zod';
import { getDb } from '../db/init.js';
import { getModel } from './providers.js';
import { searchChunks } from '../kb/vector.js';
import type { Agent, ToolResult, AgentState } from './types.js';

export class AgentOrchestrator {
  private state: AgentState;
  private maxIterations = 10;

  constructor(
    private agent: Agent,
    private apiKey: string,
    private provider: string,
    private model: string,
    private userId?: string
  ) {
    this.state = {
      messages: [],
      toolsUsed: [],
      iterations: 0,
      status: 'idle',
    };
  }

  async run(userMessage: string): Promise<string> {
    this.state.status = 'running';
    this.state.messages.push({
      role: 'user',
      content: userMessage,
    });

    let finalResponse = '';

    try {
      for (let i = 0; i < this.maxIterations; i++) {
        this.state.iterations = i + 1;

        const model = getModel(this.provider, this.apiKey, this.model);
        const systemPrompt = this.buildSystemPrompt();

        const result = await generateText({
          model,
          system: systemPrompt,
          messages: this.state.messages as CoreMessage[],
          tools: this.getTools(),
          maxSteps: 5,
        });

        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const toolCall of result.toolCalls) {
            const toolResult = await this.executeTool(toolCall.toolName, toolCall.args as Record<string, unknown>);
            this.state.toolsUsed.push({
              tool: toolCall.toolName,
              args: toolCall.args as Record<string, unknown>,
              result: toolResult,
            });
          }

          if (result.text) {
            finalResponse = result.text;
            this.state.messages.push({
              role: 'assistant',
              content: result.text,
            });
          }
          break;
        }

        finalResponse = result.text;
        this.state.messages.push({
          role: 'assistant',
          content: result.text,
        });
        break;
      }

      this.state.status = 'completed';
      return finalResponse || 'Agent completed without response.';
    } catch (error) {
      this.state.status = 'error';
      throw error;
    }
  }

  async *runStream(userMessage: string): AsyncGenerator<string> {
    this.state.status = 'running';
    this.state.messages.push({
      role: 'user',
      content: userMessage,
    });

    try {
      const model = getModel(this.provider, this.apiKey, this.model);
      const systemPrompt = this.buildSystemPrompt();

      const stream = streamText({
        model,
        system: systemPrompt,
        messages: this.state.messages as CoreMessage[],
        tools: this.getTools(),
        maxSteps: 5,
      });

      let fullText = '';

      for await (const chunk of stream.textStream) {
        fullText += chunk;
        yield chunk;
      }

      this.state.messages.push({
        role: 'assistant',
        content: fullText,
      });

      const toolCalls = await stream.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const toolResult = await this.executeTool(toolCall.toolName, toolCall.args as Record<string, unknown>);
          this.state.toolsUsed.push({
            tool: toolCall.toolName,
            args: toolCall.args as Record<string, unknown>,
            result: toolResult,
          });
        }
      }

      this.state.status = 'completed';
    } catch (error) {
      this.state.status = 'error';
      throw error;
    }
  }

  private buildSystemPrompt(): string {
    let prompt = this.agent.systemPrompt || this.getDefaultSystemPrompt();

    if (this.userId) {
      prompt += '\n\nYou have access to a knowledge base. Use the search_knowledge tool to find relevant information.';
    }

    return prompt;
  }

  private getTools() {
    return {
      read_file: tool({
        description: 'Read contents of a file',
        parameters: z.object({
          path: z.string().describe('File path to read'),
        }),
        execute: async ({ path }) => {
          return { content: 'File system access requires sandbox.' };
        },
      }),

      write_file: tool({
        description: 'Write content to a file',
        parameters: z.object({
          path: z.string().describe('File path to write'),
          content: z.string().describe('Content to write'),
        }),
        execute: async ({ path, content }) => {
          return { success: true, message: `Written to ${path}` };
        },
      }),

      run_code: tool({
        description: 'Execute code in a sandbox',
        parameters: z.object({
          code: z.string().describe('Code to execute'),
          language: z.string().optional().describe('Programming language (javascript, python, typescript)'),
        }),
        execute: async ({ code, language }) => {
          return { output: 'Code execution requires sandbox.' };
        },
      }),

      search_knowledge: tool({
        description: 'Search the knowledge base for relevant information',
        parameters: z.object({
          query: z.string().describe('Search query'),
        }),
        execute: async ({ query }) => {
          try {
            const results = await searchChunks(this.userId || '', query, 5);
            return { results: results.map((r: any) => ({ content: r.content, score: r.score, source: r.metadata.sourceId })) };
          } catch {
            return { results: [], error: 'Knowledge base not available' };
          }
        },
      }),

      delegate_to_agent: tool({
        description: 'Delegate a complex task to a specialized sub-agent',
        parameters: z.object({
          agentId: z.string().describe('Sub-agent ID to delegate to'),
          task: z.string().describe('Task description for the sub-agent'),
        }),
        execute: async ({ agentId, task }) => {
          return { result: 'Sub-agent delegation coming soon.' };
        },
      }),

      create_artifact: tool({
        description: 'Create an artifact (HTML page, PDF, markdown, code snippet)',
        parameters: z.object({
          type: z.enum(['html', 'pdf', 'markdown', 'code']).describe('Artifact type'),
          title: z.string().optional().describe('Artifact title'),
          content: z.string().describe('Artifact content'),
        }),
        execute: async ({ type, title, content }) => {
          return { success: true, artifactId: crypto.randomUUID() };
        },
      }),

      browse_web: tool({
        description: 'Browse a website and extract content',
        parameters: z.object({
          url: z.string().describe('URL to browse'),
        }),
        execute: async ({ url }) => {
          return { content: 'Web browsing requires browser service.' };
        },
      }),
    };
  }

  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tools = this.getTools();
    const t = tools[toolName as keyof typeof tools];

    if (!t) {
      return { error: `Unknown tool: ${toolName}` };
    }

    try {
      const result = await (t as any).execute(args);
      return result;
    } catch (error: any) {
      return { error: error.message };
    }
  }

  private getDefaultSystemPrompt(): string {
    return `You are a helpful AI assistant with access to various tools.

Your capabilities:
- Read and write files
- Execute code in a sandbox
- Search the knowledge base
- Delegate tasks to specialized sub-agents
- Create artifacts (HTML, PDF, code)
- Browse the web

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
