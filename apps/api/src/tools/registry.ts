export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (args: any) => Promise<any>;
  permission?: 'allow' | 'ask' | 'deny';
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getForAgent(agentPermissions?: Record<string, 'allow' | 'ask' | 'deny'>): Record<string, ToolDefinition> {
    const result: Record<string, ToolDefinition> = {};

    for (const [name, tool] of this.tools) {
      const permission = agentPermissions?.[name] || tool.permission || 'allow';
      if (permission !== 'deny') {
        result[name] = tool;
      }
    }

    return result;
  }
}

export const toolRegistry = new ToolRegistry();

// Register built-in tools
toolRegistry.register({
  name: 'read_file',
  description: 'Read the contents of a file from the filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or relative file path' },
    },
    required: ['path'],
  },
  execute: async (args: { path: string }) => {
    // Will be implemented with sandbox
    return { content: 'File system access requires sandbox environment.' };
  },
});

toolRegistry.register({
  name: 'write_file',
  description: 'Write content to a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  execute: async (args: { path: string; content: string }) => {
    return { success: true, bytesWritten: args.content.length };
  },
});

toolRegistry.register({
  name: 'run_code',
  description: 'Execute code in an isolated sandbox environment',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Code to execute' },
      language: { type: 'string', description: 'Language (python, javascript, bash)' },
    },
    required: ['code'],
  },
  execute: async (args: { code: string; language?: string }) => {
    return { output: 'Code execution requires sandbox environment.' };
  },
});

toolRegistry.register({
  name: 'search_knowledge',
  description: 'Search the knowledge base for relevant information',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results to return' },
    },
    required: ['query'],
  },
  execute: async (args: { query: string; limit?: number }) => {
    return { results: [] };
  },
});

toolRegistry.register({
  name: 'browse_web',
  description: 'Navigate to a URL and extract content',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to browse' },
      action: { type: 'string', enum: ['get', 'click', 'type'], description: 'Action to perform' },
    },
    required: ['url'],
  },
  execute: async (args: { url: string; action?: string }) => {
    return { content: 'Web browsing requires browser service.' };
  },
});

toolRegistry.register({
  name: 'delegate_to_agent',
  description: 'Delegate a task to a specialized sub-agent',
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'ID of the sub-agent' },
      task: { type: 'string', description: 'Task to delegate' },
    },
    required: ['agentId', 'task'],
  },
  execute: async (args: { agentId: string; task: string }) => {
    return { result: 'Sub-agent delegation requires agent system.' };
  },
});

toolRegistry.register({
  name: 'create_artifact',
  description: 'Create a shareable artifact (HTML, PDF, Markdown, Code)',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['html', 'pdf', 'markdown', 'code'] },
      title: { type: 'string', description: 'Artifact title' },
      content: { type: 'string', description: 'Artifact content' },
    },
    required: ['type', 'content'],
  },
  execute: async (args: { type: string; title?: string; content: string }) => {
    return { success: true, artifactId: crypto.randomUUID() };
  },
});

toolRegistry.register({
  name: 'send_email',
  description: 'Send an email',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body' },
    },
    required: ['to', 'subject', 'body'],
  },
  execute: async (args: { to: string; subject: string; body: string }) => {
    return { success: true, messageId: crypto.randomUUID() };
  },
});

toolRegistry.register({
  name: 'github_push',
  description: 'Push code to a GitHub repository',
  parameters: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'Repository (owner/repo)' },
      branch: { type: 'string', description: 'Branch name' },
      files: { type: 'object', description: 'Files to push' },
    },
    required: ['repo', 'files'],
  },
  execute: async (args: { repo: string; branch?: string; files: any }) => {
    return { success: true, commitSha: 'abc123' };
  },
});
