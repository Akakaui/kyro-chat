import type { CoreMessage } from 'ai';

export interface Agent {
  id: string;
  name: string;
  type?: 'primary' | 'sub' | 'both';
  systemPrompt?: string;
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  skills?: string[];
  enabledTools?: string[];
  disabledTools?: string[];
  subAgents?: string[];
  status: 'active' | 'inactive';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ToolResult {
  [key: string]: unknown;
  error?: string;
}

export interface ToolContext {
  userId?: string;
  agentId: string;
  sessionId?: string;
  abortSignal?: AbortSignal;
  apiKey?: string;
  provider?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any; // Zod schema
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  /** Tools this tool depends on (auto-included when this tool is enabled) */
  dependencies?: string[];
  /** Required permissions for this tool */
  permissions?: string[];
  /** Category for grouping in UI */
  category?: 'file' | 'code' | 'search' | 'web' | 'agent' | 'artifacts' | 'media';
}

export interface LifecycleHooks {
  /** Called when agent starts processing */
  onStart?: (data: { userId?: string; agentId: string; message: string }) => Promise<void> | void;
  /** Called before tool execution — can block by returning { block: true, reason: string } */
  onBeforeTool?: (data: { toolName: string; args: Record<string, unknown>; context: ToolContext }) => Promise<{ block?: boolean; reason?: string } | void> | void;
  /** Called after tool execution — can modify result */
  onAfterTool?: (data: { toolName: string; args: Record<string, unknown>; result: ToolResult; context: ToolContext }) => Promise<ToolResult | void> | void;
  /** Called when message is added to conversation */
  onMessage?: (data: { role: string; content: string }) => Promise<void> | void;
  /** Called when error occurs */
  onError?: (data: { error: Error; toolName?: string; context: ToolContext }) => Promise<void> | void;
  /** Called when agent finishes */
  onEnd?: (data: { status: string; iterations: number; toolsUsed: string[] }) => Promise<void> | void;
  /** Called for streaming tokens */
  onToken?: (data: { token: string; context: ToolContext }) => Promise<void> | void;
  /** Called when tool is blocked by permission system */
  onToolBlocked?: (data: { toolName: string; args: Record<string, unknown>; reason: string; context: ToolContext }) => Promise<void> | void;
}

export interface ToolUsage {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface AgentState {
  messages: CoreMessage[];
  toolsUsed: ToolUsage[];
  iterations: number;
  status: 'idle' | 'running' | 'completed' | 'error';
  startTime?: number;
  endTime?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface SubAgentTask {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  task: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AgentConfig {
  agent: Agent;
  apiKey: string;
  provider: string;
  model: string;
  userId?: string;
  sessionId?: string;
  sandboxId?: string;
  hooks?: LifecycleHooks;
  tools?: ToolDefinition[];
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
}
