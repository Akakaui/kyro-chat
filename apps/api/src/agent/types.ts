export interface Agent {
  id: string;
  name: string;
  type: 'primary' | 'sub' | 'both';
  description?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  skills?: string[];
  permissions?: AgentPermissions;
}

export interface AgentPermissions {
  tools: Record<string, 'allow' | 'ask' | 'deny'>;
  global: {
    fileSystem: 'allow' | 'ask' | 'deny';
    codeExecution: 'allow' | 'ask' | 'deny';
    webBrowsing: 'allow' | 'ask' | 'deny';
    email: 'allow' | 'ask' | 'deny';
    github: 'allow' | 'ask' | 'deny';
  };
}

export interface ToolResult {
  content?: string;
  error?: string;
  [key: string]: any;
}

export interface AgentState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
  toolsUsed: Array<{
    tool: string;
    args: any;
    result: ToolResult;
  }>;
  iterations: number;
  status: 'idle' | 'running' | 'completed' | 'error';
}

export interface SubAgentTask {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: number;
}
