# Kyro Code — Comprehensive Implementation Plan

**Status**: Pre-build (Phase 0)  
**Date**: July 18, 2026  
**Goal**: Complete agent coding platform with permission system, knowledge bases, sandbox execution, slash/mention system, and coding tools

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Permission System](#permission-system)
3. [Knowledge Base System](#knowledge-base-system)
4. [Sandbox Architecture](#sandbox-architecture)
5. [Agent Coding Tools](#agent-coding-tools)
6. [Slash Commands & @Mention System](#slash-commands--mention-system)
7. [Agent Orchestration](#agent-orchestration)
8. [Database Schema](#database-schema)
9. [API Routes](#api-routes)
10. [Frontend UI](#frontend-ui)
11. [Deployment](#deployment)
12. [Testing](#testing)
13. [Implementation Phases](#implementation-phases)

---

## 1. System Overview

**Kyro Code** is a multi-tenant AI chatbot SaaS with Claude-style UI and full agent capabilities. Users can:

- Chat with multiple AI models (OpenAI, Anthropic, Google) using their own API keys
- Spawn autonomous agents that execute real tasks (write files, run code, browse web)
- Create and manage multiple knowledge bases, assign them to agents
- Approve/deny agent actions via granular permission system
- See agent's thinking process in real-time (streaming)
- Collaborate with agents in shared projects
- Get temporary share links for artifacts (code, websites, docs)

### Architecture
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend   │    │   Backend   │    │   Database   │
│  Next.js 16  │───▶│   Hono API  │───▶│  Supabase   │
│  Tailwind 4  │    │  Node.js 22 │    │  (Postgres) │
│  shadcn/ui   │    │  Vercel AI  │    └─────────────┘
│  noVNC       │    │  SQLite     │    ┌─────────────┐
└─────────────┘    │  sqlite-vec  │───▶│   Vector DB  │
                   │  Docker      │    │  sqlite-vec  │
                   │  E2B (later) │    └─────────────┘
                   └─────────────┘
```

### RAM Budget (8GB VPS)
| Component | RAM |
|-----------|-----|
| Node.js backend | 150–300MB |
| SQLite + sqlite-vec | 50–100MB |
| Docker containers | 50–200MB |
| Nginx | 10MB |
| OS/other | 500MB |
| **Total** | **~1.5GB** |
| **Available for model inference** | **~6GB** |

---

## 2. Permission System

### 2.1 Philosophy
Agent has **full tool access** by default. User can **approve/deny** actions. This is not a restrictive system — it's a collaborative one where the user controls which actions the agent can take autonomously.

### 2.2 Permission Model

```typescript
// Per-tool permission configuration
interface PermissionConfig {
  tool: string;           // Tool name (e.g., "run_command", "write_file")
  pattern: string;        // Glob pattern (e.g., "npm *", "/tmp/*")
  action: 'allow' | 'deny' | 'ask';  // Default: 'ask'
  reason?: string;        // User-provided reason for denial
}

// Session permission state
interface PermissionState {
  userId: string;
  agentId: string;
  sessionId: string;
  rules: PermissionConfig[];
  approvedPatterns: string[];  // Cache of previously approved patterns
  deniedPatterns: string[];    // Cache of previously denied patterns
}
```

### 2.3 Permission Flow

```
Agent calls tool → Permission system checks rules →
  ├─ Match 'deny' rule → Return error "Permission denied"
  ├─ Match 'allow' rule → Execute immediately
  ├─ Match 'ask' rule (or no rule) → Send approval request to user
  │   ├─ User approves → Execute + cache pattern
  │   └─ User denies → Return error + cache pattern
  └─ No rule found → Default to 'ask' for sensitive tools
```

### 2.4 Sensitive Tools (Require Approval)

| Tool | Risk Level | Default |
|------|-----------|---------|
| `run_command` | High | Ask |
| `write_file` | Medium | Ask |
| `edit_file` | Medium | Ask |
| `delete_file` | High | Ask |
| `browser_navigate` | Low | Allow |
| `browser_click` | Low | Allow |
| `read_file` | Low | Allow |
| `search_files` | Low | Allow |
| `codebase_search` | Low | Allow |

### 2.5 Glob Pattern Matching

```typescript
// Pattern examples
const patterns = [
  "npm install *",           // Allow all npm installs
  "npm install @types/*",    // Allow @types installs specifically
  "git commit *",            // Allow all git commits
  "git push origin main",    // Allow push to main only
  "/tmp/*",                  // Allow writes to /tmp
  "*.test.ts",              // Allow edits to test files
];
```

### 2.6 Sub-Agent Permission Inheritance

```typescript
// When spawning sub-agents
const subAgent = await spawnSubAgent({
  name: "code-writer",
  permissions: {
    inheritFrom: parentAgent.id,
    deny: ["task", "todowrite"],  // Sub-agents can't spawn more sub-agents
    overrides: {
      "run_command": "allow",  // Allow all commands for this sub-agent
    }
  }
});
```

### 2.7 Auto-Approval Cache

```typescript
// Auto-approval logic
async function checkAutoApproval(
  userId: string,
  tool: string,
  pattern: string
): Promise<boolean> {
  // Check cache first
  const cached = await db.get(
    'SELECT * FROM permission_cache WHERE user_id = ? AND tool = ? AND pattern = ?',
    [userId, tool, pattern]
  );
  
  if (cached) {
    // Update last used timestamp
    await db.run(
      'UPDATE permission_cache SET last_used = NOW() WHERE id = ?',
      [cached.id]
    );
    return cached.approved;
  }
  
  // No cache — require approval
  return false;
}
```

### 2.8 Database Tables

```sql
-- Permission rules per user/agent
CREATE TABLE permission_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT CHECK(action IN ('allow', 'deny', 'ask')) NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auto-approval cache
CREATE TABLE permission_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  approval_count INTEGER DEFAULT 1,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(user_id, tool, pattern)
);

-- Permission audit log
CREATE TABLE permission_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL,
  approved BOOLEAN,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.9 API Routes

```typescript
// Permission management
POST   /api/permissions              - Create permission rule
GET    /api/permissions              - List user's permission rules
PUT    /api/permissions/:id          - Update permission rule
DELETE /api/permissions/:id          - Delete permission rule

POST   /api/permissions/approve      - Approve a pending action
POST   /api/permissions/deny         - Deny a pending action

GET    /api/permissions/pending      - List pending approval requests
DELETE /api/permissions/cache/:id    - Clear auto-approval cache

// Permission checks are done internally, not via API
```

---

## 3. Knowledge Base System

### 3.1 Architecture

```
┌─────────────────────────────────────────────────┐
│                  Knowledge Base                  │
├─────────────────────────────────────────────────┤
│  Documents (parsed, chunked, embedded)           │
│  ├── PDFs (pdf-parse)                           │
│  ├── Text files (plain text)                    │
│  ├── Markdown (marked + cheerio)                │
│  ├── Code files (langchain text splitter)       │
│  └── Images (describe via multimodal LLM)       │
│                                                  │
│  Vector Search (sqlite-vec)                      │
│  ├── Embeddings: all-MiniLM-L6-v2              │
│  ├── Similarity: cosine distance                │
│  └── Top-K retrieval (default: 5)               │
│                                                  │
│  Agent Assignment (many-to-many)                 │
│  ├── Primary agents: access to assigned KBs     │
│  ├── Sub-agents: inherit parent's KB access     │
│  └── Cross-KB search across multiple KBs        │
└─────────────────────────────────────────────────┘
```

### 3.2 Knowledge Base Model

```typescript
interface KnowledgeBase {
  id: string;
  userId: string;
  name: string;                    // e.g., "My Codebase", "Project Docs"
  description?: string;
  embeddingModel: string;          // "Xenova/all-MiniLM-L6-v2"
  createdAt: Date;
  updatedAt: Date;
}

interface Document {
  id: string;
  kbId: string;
  fileName: string;
  fileType: string;                // pdf, txt, md, ts, js, etc.
  fileSize: number;
  contentHash: string;             // SHA-256 for dedup
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
  chunkCount: number;
  createdAt: Date;
}

interface Chunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, any>;   // line numbers, headings, etc.
  embedding: Float32Array;         // 384 dimensions
}

// Agent ↔ KB assignment
interface AgentKB {
  agentId: string;
  kbId: string;
  priority: number;                // Higher = searched first
  maxChunks: number;               // Max chunks to inject per query
}
```

### 3.3 Embedding Pipeline

```typescript
// 1. Parse document → raw text
const rawText = await parseDocument(file);  // pdf-parse / plain text / marked

// 2. Split into chunks
const chunks = await splitText(rawText, {
  chunkSize: 512,       // characters
  chunkOverlap: 50,     // overlap between chunks
});

// 3. Generate embeddings
const embeddings = await generateEmbeddings(chunks);  // all-MiniLM-L6-v2

// 4. Store in SQLite + sqlite-vec
for (let i = 0; i < chunks.length; i++) {
  await db.run(
    'INSERT INTO chunks (id, document_id, chunk_index, content, metadata) VALUES (?, ?, ?, ?, ?)',
    [chunkId, docId, i, chunks[i].content, JSON.stringify(chunks[i].metadata)]
  );
  await vec.insert('chunks', chunkId, embeddings[i]);
}
```

### 3.4 Vector Search

```typescript
async function searchKB(
  kbIds: string[],
  query: string,
  topK: number = 5
): Promise<Chunk[]> {
  // 1. Embed query
  const queryEmbedding = await embed(query);
  
  // 2. Search across multiple KBs
  const results = await vec.search(
    'chunks',
    queryEmbedding,
    topK * 2,  // Search more, then filter
    { filter: { kb_id: kbIds } }
  );
  
  // 3. Filter by KB assignment priority
  const prioritized = results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  return prioritized;
}
```

### 3.5 Context Injection

```typescript
// When agent is processing a query
async function buildContext(
  agentId: string,
  query: string
): Promise<string> {
  // 1. Get agent's assigned KBs
  const kbs = await db.all(
    'SELECT kb_id, priority, max_chunks FROM agent_kbs WHERE agent_id = ?',
    [agentId]
  );
  
  // 2. Search each KB
  const allChunks = [];
  for (const kb of kbs) {
    const chunks = await searchKB([kb.kbId], query, kb.maxChunks);
    allChunks.push(...chunks);
  }
  
  // 3. Sort by similarity, take top N
  const topChunks = allChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);
  
  // 4. Format as context
  return topChunks
    .map(c => `<source file="${c.metadata.fileName}">\n${c.content}\n</source>`)
    .join('\n\n');
}
```

### 3.6 Database Tables

```sql
-- Knowledge bases
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT DEFAULT 'Xenova/all-MiniLM-L6-v2',
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents in KB
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'processing', 'ready', 'error')) NOT NULL,
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings (via sqlite-vec)
CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  embedding FLOAT[384]  -- all-MiniLM-L6-v2 dimensions
);

-- Text content (separate from embeddings for easy text search)
CREATE TABLE chunk_content (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,  -- JSON
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
);

-- Agent ↔ KB assignment
CREATE TABLE agent_kbs (
  agent_id TEXT NOT NULL,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,
  max_chunks INTEGER DEFAULT 5,
  PRIMARY KEY (agent_id, kb_id)
);
```

### 3.7 API Routes

```typescript
// Knowledge base management
POST   /api/kb                    - Create knowledge base
GET    /api/kb                    - List user's knowledge bases
GET    /api/kb/:id                - Get KB details
PUT    /api/kb/:id                - Update KB
DELETE /api/kb/:id                - Delete KB + all documents

POST   /api/kb/:id/documents      - Upload document(s)
GET    /api/kb/:id/documents      - List documents
DELETE /api/kb/:id/documents/:docId - Delete document

POST   /api/kb/:id/search         - Search KB (similarity search)
POST   /api/kb/:id/reindex        - Reindex entire KB

// Agent ↔ KB assignment
POST   /api/agent/:agentId/kb     - Assign KB to agent
DELETE /api/agent/:agentId/kb/:kbId - Unassign KB
GET    /api/agent/:agentId/kb     - List agent's KBs
```

---

## 4. Sandbox Architecture

### 4.1 Current State: Docker Sandbox (VPS)

```typescript
// apps/api/src/sandbox/service.ts
// Already implemented: Docker-based sandbox for VPS

interface SandboxOptions {
  image: string;           // "node:22-slim"
  command: string;         // "node -e 'console.log(1+1)'"
  timeout: number;         // 60000ms
  memoryLimit: string;     // "256m"
  cpuQuota: number;        // 50000 (50% of one CPU)
  workingDirectory: string;
  environment: Record<string, string>;
  volumes: string[];       // host:container mappings
}

// Supports: Node.js, Python, shell commands
// Isolation: container-based, resource-limited
// Pros: Fast, no network costs, free
// Cons: Shares host kernel, less isolated
```

### 4.2 Future: E2B Cloud Sandbox

```typescript
// E2B integration (when scaling)
import { Sandbox } from 'e2b';

interface E2BConfig {
  apiKey: string;           // E2B API key
  template: string;         // "base" (256MB RAM, 10GB disk)
  timeout: number;          // 5 min (hobby tier limit)
}

// E2B provides:
// - Firecracker microVMs (hardware-level isolation)
// - Sub-150ms cold starts
// - Full Linux (Ubuntu 22.04)
// - Persistent filesystem (within session)
// - Network access
// - Custom templates (install any toolchain)

// Pricing:
// - Hobby: Free ($100 credits/month)
// - Pro: $150/month (2000 sandbox-seconds/month)
// - Compute: $0.00022/sec CPU + $0.000097/sec RAM
```

### 4.3 Dual-Mode Sandbox

```typescript
// Unified sandbox interface
interface SandboxProvider {
  create(options: SandboxOptions): Promise<SandboxInstance>;
  execute(instanceId: string, command: string): Promise<CommandResult>;
  destroy(instanceId: string): Promise<void>;
  list(): Promise<SandboxInstance[]>;
}

// Router: choose provider based on config
function getSandboxProvider(): SandboxProvider {
  if (config.SANDBOX_MODE === 'e2b' && config.E2B_API_KEY) {
    return new E2BSandboxProvider();
  }
  return new DockerSandboxProvider();  // Default
}
```

### 4.4 Sandbox Security

```typescript
// Sandbox security rules
const sandboxSecurity = {
  // Network: disable by default
  network: false,
  
  // File system: read-only except workspace
  readOnlyRootfs: true,
  writablePaths: ['/workspace'],
  
  // Resources: hard limits
  maxMemory: '512m',
  maxCpu: '1.0',  // 1 full CPU core
  maxProcesses: 100,
  
  // Timeouts: prevent hanging
  maxExecutionTime: 60000,  // 60 seconds
  maxIdleTime: 300000,      // 5 minutes
  
  // Cleanup: destroy after timeout
  autoCleanup: true,
};
```

### 4.5 Database Tables

```sql
-- Sandbox instances
CREATE TABLE sandbox_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT CHECK(provider IN ('docker', 'e2b')) NOT NULL,
  status TEXT CHECK(status IN ('creating', 'running', 'stopped', 'destroyed')) NOT NULL,
  image TEXT,
  memory_limit TEXT,
  cpu_quota INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  destroyed_at DATETIME
);

-- Sandbox commands (audit log)
CREATE TABLE sandbox_commands (
  id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL REFERENCES sandbox_instances(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.6 API Routes

```typescript
// Sandbox management
POST   /api/sandbox               - Create sandbox instance
GET    /api/sandbox               - List user's sandboxes
GET    /api/sandbox/:id           - Get sandbox details
DELETE /api/sandbox/:id           - Destroy sandbox

POST   /api/sandbox/:id/exec      - Execute command in sandbox
GET    /api/sandbox/:id/exec/:cmdId - Get command result
WS     /api/sandbox/:id/exec      - WebSocket for live command output
```

---

## 5. Agent Coding Tools

### 5.1 Tool Registry

```typescript
// All tools follow the same pattern
interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;  // Zod schema for parameters
  execute: (args: any, context: ToolContext) => Promise<ToolResult>;
  permission?: 'allow' | 'deny' | 'ask';  // Default: 'ask'
  category: 'file' | 'search' | 'shell' | 'browser' | 'code' | 'memory' | 'agent';
}

// Tool categories
const toolCategories = {
  file: ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_files'],
  search: ['codebase_search', 'codebase_list', 'codebase_read'],
  shell: ['run_command'],
  browser: ['browser_navigate', 'browser_click', 'browser_type', 'browser_extract', 'browser_screenshot', 'browser_close'],
  code: ['replace_in_file', 'read_url'],
  memory: ['memory_search', 'memory_store', 'memory_delete'],
  agent: ['task', 'todowrite'],
};
```

### 5.2 File Operations

```typescript
// read_file
const readFileTool = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the full file content.',
  parameters: z.object({
    filePath: z.string().describe('Absolute path to the file to read'),
  }),
  execute: async (args) => {
    const content = await fs.readFile(args.filePath, 'utf-8');
    return { content };
  },
  permission: 'allow',
  category: 'file',
};

// write_file
const writeFileTool = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
  parameters: z.object({
    filePath: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  }),
  execute: async (args) => {
    await fs.mkdir(path.dirname(args.filePath), { recursive: true });
    await fs.writeFile(args.filePath, args.content, 'utf-8');
    return { success: true };
  },
  permission: 'ask',
  category: 'file',
};

// edit_file (search and replace)
const editFileTool = {
  name: 'edit_file',
  description: 'Replace a specific string in a file with new content. The old string must match exactly.',
  parameters: z.object({
    filePath: z.string().describe('Absolute path to the file to edit'),
    oldString: z.string().describe('The exact string to replace'),
    newString: z.string().describe('The new string to replace with'),
  }),
  execute: async (args) => {
    const content = await fs.readFile(args.filePath, 'utf-8');
    const newContent = content.replace(args.oldString, args.newString);
    await fs.writeFile(args.filePath, newContent, 'utf-8');
    return { success: true };
  },
  permission: 'ask',
  category: 'file',
};
```

### 5.3 Search Tools

```typescript
// codebase_search
const codebaseSearchTool = {
  name: 'codebase_search',
  description: 'Search for code patterns using regex. Returns file paths and line numbers.',
  parameters: z.object({
    query: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (default: workspace root)'),
    include: z.string().optional().describe('File pattern to include (e.g., "*.ts")'),
  }),
  execute: async (args) => {
    const results = await grep(args.query, args.path || workspaceRoot, args.include);
    return { results };
  },
  permission: 'allow',
  category: 'search',
};

// search_files (glob)
const searchFilesTool = {
  name: 'search_files',
  description: 'Find files by name pattern using glob.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.test.js")'),
    path: z.string().optional().describe('Directory to search in'),
  }),
  execute: async (args) => {
    const files = await glob(args.pattern, { cwd: args.path || workspaceRoot });
    return { files };
  },
  permission: 'allow',
  category: 'search',
};
```

### 5.4 Shell Execution

```typescript
// run_command
const runCommandTool = {
  name: 'run_command',
  description: 'Execute a shell command in the sandbox. Returns stdout, stderr, and exit code.',
  parameters: z.object({
    command: z.string().describe('Shell command to execute'),
    workingDirectory: z.string().optional().describe('Working directory (default: workspace root)'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 60000)'),
  }),
  execute: async (args, context) => {
    const result = await sandbox.execute(args.command, {
      workingDirectory: args.workingDirectory || workspaceRoot,
      timeout: args.timeout || 60000,
    });
    return result;
  },
  permission: 'ask',
  category: 'shell',
};
```

### 5.5 Browser Tools

```typescript
// browser_navigate
const browserNavigateTool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser. Opens in KasmWeb Chrome container.',
  parameters: z.object({
    url: z.string().url().describe('URL to navigate to'),
  }),
  execute: async (args) => {
    await browserService.navigate(args.url);
    return { success: true, url: args.url };
  },
  permission: 'allow',
  category: 'browser',
};

// browser_click
const browserClickTool = {
  name: 'browser_click',
  description: 'Click an element on the page by CSS selector.',
  parameters: z.object({
    selector: z.string().describe('CSS selector of the element to click'),
  }),
  execute: async (args) => {
    await browserService.click(args.selector);
    return { success: true };
  },
  permission: 'allow',
  category: 'browser',
};

// browser_type
const browserTypeTool = {
  name: 'browser_type',
  description: 'Type text into an input field.',
  parameters: z.object({
    selector: z.string().describe('CSS selector of the input field'),
    text: z.string().describe('Text to type'),
  }),
  execute: async (args) => {
    await browserService.type(args.selector, args.text);
    return { success: true };
  },
  permission: 'allow',
  category: 'browser',
};

// browser_extract
const browserExtractTool = {
  name: 'browser_extract',
  description: 'Extract text content from the current page.',
  parameters: z.object({
    selector: z.string().optional().describe('CSS selector to extract from (default: full page)'),
  }),
  execute: async (args) => {
    const content = await browserService.extract(args.selector);
    return { content };
  },
  permission: 'allow',
  category: 'browser',
};
```

### 5.6 Agent Tools

```typescript
// task (sub-agent spawn)
const taskTool = {
  name: 'task',
  description: 'Spawn a sub-agent to handle a complex task. The sub-agent can use all tools.',
  parameters: z.object({
    description: z.string().describe('Short description of the task'),
    prompt: z.string().describe('Detailed instructions for the sub-agent'),
    agentType: z.string().optional().describe('Type of sub-agent (default: general)'),
  }),
  execute: async (args, context) => {
    const subAgent = await subAgentManager.spawn({
      parentAgentId: context.agentId,
      description: args.description,
      prompt: args.prompt,
      agentType: args.agentType || 'general',
    });
    return { agentId: subAgent.id, status: 'spawned' };
  },
  permission: 'ask',
  category: 'agent',
};

// todowrite
const todowriteTool = {
  name: 'todowrite',
  description: 'Create or update a task list. Use this to track progress on complex tasks.',
  parameters: z.object({
    todos: z.array(z.object({
      content: z.string().describe('Task description'),
      status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
      priority: z.enum(['high', 'medium', 'low']).describe('Task priority'),
    })).describe('Updated task list'),
  }),
  execute: async (args) => {
    // Store in session state
    return { success: true, todos: args.todos };
  },
  permission: 'allow',
  category: 'agent',
};
```

### 5.7 MCP Tools (Dynamic)

```typescript
// MCP tools are loaded at runtime from configured servers
interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;  // JSON Schema from MCP server
  serverName: string;
}

// Tool adapter: convert MCP tool to agent tool
function adaptMCPTool(mcpTool: MCPTool): AgentTool {
  return {
    name: `mcp_${mcpTool.serverName}_${mcpTool.name}`,
    description: mcpTool.description,
    parameters: z.object({
      // Convert JSON Schema to Zod
      ...convertJSONSchemaToZod(mcpTool.inputSchema),
    }),
    execute: async (args) => {
      return await mcpClient.callTool(mcpTool.serverName, mcpTool.name, args);
    },
    permission: 'ask',  // MCP tools always require approval
    category: 'mcp',
  };
}
```

### 5.8 Skill Tools

```typescript
// Skills are markdown files with YAML frontmatter
// Agent can load skills into context

// Example skill: code-review.md
/*
---
name: code-review
description: Perform a thorough code review of the provided code
tools:
  - read_file
  - search_files
  - codebase_search
  - browser_navigate
---

# Code Review Skill

When reviewing code, follow these steps:
1. Read the file(s) to review
2. Search for related tests
3. Check for security vulnerabilities
4. Look for performance issues
5. Verify error handling
6. Check for accessibility (if UI)
7. Provide structured feedback
*/

const skillLoadTool = {
  name: 'skill_load',
  description: 'Load a skill into context. Skills provide specialized instructions for tasks.',
  parameters: z.object({
    skillName: z.string().describe('Name of the skill to load'),
  }),
  execute: async (args, context) => {
    const skill = await skillManager.load(args.skillName, context.agentId);
    return { skill };
  },
  permission: 'allow',
  category: 'agent',
};
```

---

## 6. Slash Commands & @Mention System

### 6.1 Architecture

```
User types input → Frontend parses → Detect triggers →
  ├─ Slash command (/xxx) → Intercept BEFORE LLM → Route to handler
  ├─ @mention (@xxx) → Resolve context → Inject into prompt → Send to LLM
  └─ Normal text → Send to LLM directly
```

### 6.2 Slash Commands (Intercepted)

| Command | Description | Handler |
|---------|-------------|---------|
| `/clear` | Clear conversation history | Frontend state |
| `/model [provider] [model]` | Switch AI model | API: update session |
| `/kb [name]` | Set active knowledge base | API: update session |
| `/agent [name]` | Switch active agent | API: update session |
| `/skill [name]` | Load a skill | API: inject into prompt |
| `/sandbox [on/off]` | Toggle sandbox mode | Frontend state |
| `/memory [query]` | Search memory | API: memory search |
| `/schedule [cron] [task]` | Schedule a recurring task | API: scheduler |
| `/help` | Show available commands | Frontend display |

### 6.3 @Mention System (Context Injection)

```typescript
// @mentions resolve context and inject into prompt

interface MentionResolver {
  pattern: RegExp;
  resolve: (match: string, userId: string) => Promise<MentionContext>;
}

// Available mentions
const mentionResolvers: MentionResolver[] = [
  {
    pattern: /@agent-(\w+)/,
    resolve: async (match, userId) => {
      const agent = await db.getAgent(match.slice(1));
      return { type: 'agent', agent };
    },
  },
  {
    pattern: /@kb-(\w+)/,
    resolve: async (match, userId) => {
      const kb = await db.getKB(match.slice(1));
      return { type: 'kb', kb };
    },
  },
  {
    pattern: /@file/,
    resolve: async (match, userId) => {
      // Open file picker in frontend
      return { type: 'file-picker' };
    },
  },
  {
    pattern: /@skill-(\w+)/,
    resolve: async (match, userId) => {
      const skill = await skillManager.get(match.slice(1));
      return { type: 'skill', skill };
    },
  },
];
```

### 6.4 Input Parser

```typescript
// Frontend input parser
interface ParsedInput {
  text: string;
  slashCommands: SlashCommand[];
  mentions: Mention[];
}

function parseInput(raw: string): ParsedInput {
  const slashCommands: SlashCommand[] = [];
  const mentions: Mention[] = [];
  let text = raw;

  // Extract slash commands
  const slashRegex = /\/(\w+)\s*(.*)/g;
  let match;
  while ((match = slashRegex.exec(raw))) {
    slashCommands.push({
      command: match[1],
      args: match[2].trim(),
    });
    text = text.replace(match[0], '');
  }

  // Extract mentions
  const mentionRegex = /@(\w[\w-]*)/g;
  while ((match = mentionRegex.exec(raw))) {
    mentions.push({
      type: match[1].split('-')[0],
      value: match[1],
    });
  }

  return { text: text.trim(), slashCommands, mentions };
}
```

### 6.5 Autocomplete Dropdown

```typescript
// Trigger autocomplete on "/" or "@"
interface AutocompleteItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  type: 'slash' | 'mention';
}

const autocompleteItems: AutocompleteItem[] = [
  // Slash commands
  { id: '/clear', label: '/clear', description: 'Clear conversation', icon: '🗑️', type: 'slash' },
  { id: '/model', label: '/model', description: 'Switch AI model', icon: '🤖', type: 'slash' },
  { id: '/kb', label: '/kb', description: 'Set active knowledge base', icon: '📚', type: 'slash' },
  { id: '/agent', label: '/agent', description: 'Switch active agent', icon: '🎭', type: 'slash' },
  { id: '/skill', label: '/skill', description: 'Load a skill', icon: '⚡', type: 'slash' },
  { id: '/help', label: '/help', description: 'Show commands', icon: '❓', type: 'slash' },
  
  // @mentions (dynamic based on user's agents/KBs)
  // Populated from API at runtime
];
```

### 6.6 Frontend Implementation

```typescript
// Using Tiptap for inline mention chips
import { useEditor, EditorContent } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';

const editor = useEditor({
  extensions: [
    Mention.configure({
      suggestion: {
        items: ({ query }) => {
          return autocompleteItems.filter(item =>
            item.label.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          // Custom render for autocomplete dropdown
        },
      },
    }),
  ],
});
```

### 6.7 Backend API Routes

```typescript
// Slash command handling
POST   /api/slash/execute         - Execute a slash command
GET    /api/slash/commands        - List available slash commands

// Mention resolution
POST   /api/mentions/resolve      - Resolve @mentions to context
GET    /api/mentions/agents       - List available @agent mentions
GET    /api/mentions/kb           - List available @kb mentions
GET    /api/mentions/skills       - List available @skill mentions
```

---

## 7. Agent Orchestration

### 7.1 Agent Loop

```typescript
// Core agent loop (analyze → plan → execute → observe)
async function agentLoop(
  userId: string,
  sessionId: string,
  agentId: string,
  messages: CoreMessage[]
): Promise<AgentResponse> {
  // 1. Load agent configuration
  const agent = await db.getAgent(agentId);
  
  // 2. Build context (KB search, memory, skills)
  const context = await buildContext(agentId, messages);
  
  // 3. Get available tools
  const tools = await getToolsForAgent(agentId, sessionId);
  
  // 4. Stream response with tool calls
  const stream = await streamText({
    model: getModel(agent.provider, agent.apiKey, agent.model),
    messages: [
      { role: 'system', content: agent.systemPrompt + '\n\n' + context },
      ...messages,
    ],
    tools,
    maxSteps: 20,  // Allow multi-step tool use
    onStepFinish: async (event) => {
      // Emit progress to WebSocket
      if (event.toolCalls) {
        for (const call of event.toolCalls) {
          await checkPermission(agentId, call.toolName, call.args);
        }
      }
    },
  });
  
  return stream;
}
```

### 7.2 Tool Permission Checking

```typescript
// Before executing any tool
async function checkPermission(
  agentId: string,
  toolName: string,
  args: any
): Promise<boolean> {
  // 1. Check tool's default permission
  const tool = toolRegistry.get(toolName);
  if (tool.permission === 'allow') return true;
  if (tool.permission === 'deny') return false;
  
  // 2. Check user's permission rules
  const pattern = getPatternFromArgs(toolName, args);
  const rules = await db.getPermissionRules(agentId);
  
  for (const rule of rules) {
    if (matchGlob(rule.pattern, pattern)) {
      if (rule.action === 'allow') return true;
      if (rule.action === 'deny') return false;
    }
  }
  
  // 3. Check auto-approval cache
  const cached = await db.getPermissionCache(userId, toolName, pattern);
  if (cached) return cached.approved;
  
  // 4. Ask user for approval
  const approval = await requestApproval(agentId, toolName, args);
  return approval.approved;
}
```

### 7.3 Sub-Agent Delegation

```typescript
// Spawn sub-agent for complex tasks
async function spawnSubAgent(
  parentAgentId: string,
  task: SubAgentTask
): Promise<SubAgent> {
  // 1. Create sub-agent record
  const subAgent = await db.createSubAgent({
    parentAgentId,
    name: task.name,
    prompt: task.prompt,
    agentType: task.agentType || 'general',
  });
  
  // 2. Inherit permissions from parent
  const parentRules = await db.getPermissionRules(parentAgentId);
  await db.setPermissionRules(subAgent.id, parentRules);
  
  // 3. Inherit KB access
  const parentKBs = await db.getAgentKBs(parentAgentId);
  for (const kb of parentKBs) {
    await db.assignKB(subAgent.id, kb.kbId, kb.priority, kb.maxChunks);
  }
  
  // 4. Start sub-agent loop
  const result = await agentLoop(
    task.userId,
    task.sessionId,
    subAgent.id,
    [{ role: 'user', content: task.prompt }]
  );
  
  // 5. Return result to parent
  return { ...subAgent, result };
}
```

### 7.4 Agent Memory

```typescript
// Short-term memory (session)
interface SessionMemory {
  sessionId: string;
  messages: CoreMessage[];
  artifacts: Artifact[];
  todos: Todo[];
}

// Long-term memory (user-level)
interface LongTermMemory {
  userId: string;
  memories: Memory[];  // Semantic memories embedded in sqlite-vec
}

// Memory search
async function searchMemory(
  userId: string,
  query: string,
  limit: number = 5
): Promise<Memory[]> {
  const queryEmbedding = await embed(query);
  const results = await vec.search('memories', queryEmbedding, limit, {
    filter: { user_id: userId },
  });
  return results;
}
```

---

## 8. Database Schema

### 8.1 Supabase (PostgreSQL) — Remote

```sql
-- Users (managed by Supabase Auth)
-- profiles table for additional user data
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'openai', 'anthropic', 'google'
  model TEXT NOT NULL,     -- 'gpt-4o', 'claude-sonnet-4-20250514', etc.
  api_key_encrypted TEXT,  -- Encrypted user API key
  is_active BOOLEAN DEFAULT TRUE,
  agent_type TEXT CHECK(agent_type IN ('primary', 'sub', 'both')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys (encrypted)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_encrypted TEXT NOT NULL,
  key_hint TEXT NOT NULL,  -- Last 4 chars for display
  is_valid BOOLEAN DEFAULT TRUE,
  last_validated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT,
  model TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Artifacts
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,  -- 'html', 'markdown', 'code', 'pdf'
  language TEXT,               -- For code artifacts
  share_token TEXT UNIQUE,     -- Public share link
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skills
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,       -- Markdown with YAML frontmatter
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled Tasks
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 SQLite (Local)

```sql
-- Knowledge Bases
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT DEFAULT 'Xenova/all-MiniLM-L6-v2',
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents
CREATE TABLE kb_documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'processing', 'ready', 'error')) NOT NULL,
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chunk Content
CREATE TABLE chunk_content (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
);

-- Agent ↔ KB Assignment
CREATE TABLE agent_kbs (
  agent_id TEXT NOT NULL,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 1,
  max_chunks INTEGER DEFAULT 5,
  PRIMARY KEY (agent_id, kb_id)
);

-- Permissions
CREATE TABLE permission_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT CHECK(action IN ('allow', 'deny', 'ask')) NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Permission Cache
CREATE TABLE permission_cache (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  approval_count INTEGER DEFAULT 1,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(user_id, tool, pattern)
);

-- Permission Audit
CREATE TABLE permission_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL,
  approved BOOLEAN,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Memory
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sandbox Instances
CREATE TABLE sandbox_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT CHECK(provider IN ('docker', 'e2b')) NOT NULL,
  status TEXT CHECK(status IN ('creating', 'running', 'stopped', 'destroyed')) NOT NULL,
  image TEXT,
  memory_limit TEXT,
  cpu_quota INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  destroyed_at DATETIME
);

-- Sandbox Commands
CREATE TABLE sandbox_commands (
  id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL REFERENCES sandbox_instances(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Session State
CREATE TABLE session_state (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  kb_id TEXT,
  model TEXT,
  provider TEXT,
  sandbox_enabled BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. API Routes

### 9.1 Full Route Map

```
Authentication
  POST   /api/auth/signup
  POST   /api/auth/login
  POST   /api/auth/logout
  GET    /api/auth/me

Users
  GET    /api/user/profile
  PUT    /api/user/profile

Agents
  GET    /api/agents
  POST   /api/agents
  GET    /api/agents/:id
  PUT    /api/agents/:id
  DELETE /api/agents/:id

Chat
  POST   /api/chat                   - Send message (SSE streaming)
  GET    /api/chat/sessions          - List sessions
  GET    /api/chat/sessions/:id      - Get session messages
  DELETE /api/chat/sessions/:id      - Delete session

API Keys
  GET    /api/apikeys
  POST   /api/apikeys
  PUT    /api/apikeys/:id
  DELETE /api/apikeys/:id
  POST   /api/apikeys/:id/validate

Knowledge Bases
  GET    /api/kb
  POST   /api/kb
  GET    /api/kb/:id
  PUT    /api/kb/:id
  DELETE /api/kb/:id
  POST   /api/kb/:id/documents
  GET    /api/kb/:id/documents
  DELETE /api/kb/:id/documents/:docId
  POST   /api/kb/:id/search
  POST   /api/kb/:id/reindex

Agent ↔ KB Assignment
  POST   /api/agent/:agentId/kb
  DELETE /api/agent/:agentId/kb/:kbId
  GET    /api/agent/:agentId/kb

Permissions
  GET    /api/permissions
  POST   /api/permissions
  PUT    /api/permissions/:id
  DELETE /api/permissions/:id
  GET    /api/permissions/pending
  POST   /api/permissions/approve
  POST   /api/permissions/deny
  DELETE /api/permissions/cache/:id

Sandbox
  GET    /api/sandbox
  POST   /api/sandbox
  GET    /api/sandbox/:id
  DELETE /api/sandbox/:id
  POST   /api/sandbox/:id/exec

Browser
  GET    /api/browser/sessions
  POST   /api/browser/sessions
  GET    /api/browser/sessions/:id
  DELETE /api/browser/sessions/:id
  POST   /api/browser/sessions/:id/navigate
  POST   /api/browser/sessions/:id/click
  POST   /api/browser/sessions/:id/type
  POST   /api/browser/sessions/:id/extract
  GET    /api/browser/sessions/:id/screenshot

Artifacts
  GET    /api/artifacts
  POST   /api/artifacts
  GET    /api/artifacts/:id
  PUT    /api/artifacts/:id
  DELETE /api/artifacts/:id
  POST   /api/artifacts/:id/share
  GET    /api/artifacts/shared/:token

Skills
  GET    /api/skills
  POST   /api/skills
  GET    /api/skills/:id
  PUT    /api/skills/:id
  DELETE /api/skills/:id

Memory
  GET    /api/memory
  POST   /api/memory
  POST   /api/memory/search
  DELETE /api/memory/:id

Scheduled Tasks
  GET    /api/scheduled
  POST   /api/scheduled
  PUT    /api/scheduled/:id
  DELETE /api/scheduled/:id
  POST   /api/scheduled/:id/run

Email
  GET    /api/email/inbox
  POST   /api/email/send
  GET    /api/email/:id

Slash Commands
  GET    /api/slash/commands
  POST   /api/slash/execute

Mentions
  GET    /api/mentions/agents
  GET    /api/mentions/kb
  GET    /api/mentions/skills
  POST   /api/mentions/resolve

WebSocket (live updates)
  WS     /ws/chat/:sessionId         - Chat streaming
  WS     /ws/browser/:sessionId      - Browser events
  WS     /ws/sandbox/:sandboxId      - Command output
```

---

## 10. Frontend UI

### 10.1 Design System

```typescript
// Design tokens
const theme = {
  colors: {
    background: {
      primary: '#0d0f11',
      secondary: '#141618',
      tertiary: '#1a1d1f',
      elevated: '#25262b',
    },
    text: {
      primary: '#f8f9fa',
      secondary: '#909296',
      muted: '#5c5f66',
    },
    accent: {
      primary: '#e8590c',
      hover: '#d9480f',
      light: '#fff4e6',
    },
    border: {
      primary: '#373a40',
      secondary: '#2c2e33',
    },
  },
  fonts: {
    sans: 'Inter, system-ui, sans-serif',
    mono: 'Geist Mono, monospace',
  },
  spacing: {
    mobile: {
      inputHeight: '56px',
      drawerWidth: '100vw',
    },
    desktop: {
      drawerWidth: '400px',
    },
  },
};
```

### 10.2 Component Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── [sessionId]/
│       └── page.tsx
├── components/
│   ├── chat/
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ToolCallDisplay.tsx
│   │   ├── ThinkingProcess.tsx
│   │   └── InputArea.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Dialog.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   └── ... (shadcn/ui)
│   ├── agents/
│   │   ├── AgentCard.tsx
│   │   ├── AgentForm.tsx
│   │   └── AgentSelector.tsx
│   ├── knowledge/
│   │   ├── KBList.tsx
│   │   ├── KBForm.tsx
│   │   ├── DocumentUpload.tsx
│   │   └── SearchResults.tsx
│   ├── sidebar/
│   │   ├── Sidebar.tsx
│   │   ├── SessionList.tsx
│   │   ├── SettingsPanel.tsx
│   │   └── AgentPanel.tsx
│   ├── browser/
│   │   ├── BrowserView.tsx
│   │   └── BrowserControls.tsx
│   └── sandbox/
│       └── SandboxTerminal.tsx
├── hooks/
│   ├── useChat.ts
│   ├── useAgent.ts
│   ├── usePermission.ts
│   └── useWebSocket.ts
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── utils.ts
└── stores/
    ├── chatStore.ts
    ├── agentStore.ts
    └── uiStore.ts
```

### 10.3 Mobile-First Layout

```
Mobile (< 768px):
┌─────────────────────────┐
│  Header (hamburger)     │
├─────────────────────────┤
│                         │
│     Chat Messages       │
│                         │
│                         │
├─────────────────────────┤
│  Input Area (56px)      │
│  [📎] [Message...] [▶] │
└─────────────────────────┘
→ Hamburger opens slide-in drawer

Desktop (≥ 768px):
┌──────┬──────────────────┬──────────┐
│      │                  │          │
│ Side │    Chat Area     │  Drawer  │
│ bar  │                  │  (400px) │
│      │                  │          │
│      │                  │          │
│      ├──────────────────┤          │
│      │  Input Area      │          │
└──────┴──────────────────┴──────────┘
```

---

## 11. Deployment

### 11.1 VPS Setup

```bash
# System requirements
- Ubuntu 22.04 LTS
- 8GB+ RAM
- 4+ CPU cores
- 50GB+ storage

# Install
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx docker.io

# Docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### 11.2 Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app/data
    restart: always

  browser:
    image: kasmweb/chrome:1.15.0
    ports:
      - "6901:6901"
    environment:
      - VNC_PW=password
    shm_size: '2g'
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    restart: always
```

### 11.3 Vercel Deployment (Frontend)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.kyrocode.com",
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key"
  }
}
```

---

## 12. Testing

### 12.1 Unit Tests

```typescript
// Permission system
describe('Permission System', () => {
  it('should match glob patterns correctly');
  it('should cache auto-approvals');
  it('should inherit deny rules to sub-agents');
  it('should log all permission decisions');
});

// Knowledge base
describe('Knowledge Base', () => {
  it('should parse PDF documents correctly');
  it('should split text into chunks');
  it('should generate embeddings');
  it('should search across multiple KBs');
  it('should respect priority ordering');
});

// Sandbox
describe('Sandbox', () => {
  it('should create Docker containers');
  it('should execute commands');
  it('should enforce resource limits');
  it('should cleanup after timeout');
});
```

### 12.2 Integration Tests

```typescript
// Full agent flow
describe('Agent Orchestration', () => {
  it('should run agent loop with tool calls');
  it('should spawn sub-agents');
  it('should inject KB context');
  it('should handle permission requests');
});
```

### 12.3 E2E Tests

```typescript
// Playwright
describe('Chat UI', () => {
  it('should send messages');
  it('should display streaming responses');
  it('should show tool calls');
  it('should handle @mentions');
  it('should execute slash commands');
});
```

---

## 13. Implementation Phases

### Phase 0: Setup & Planning ✅
- [x] System architecture design
- [x] Database schema
- [x] Research (sandbox, permissions, mentions, coding tools)
- [x] Comprehensive implementation plan
- [x] Project rename to Kyro Code
- [x] Organize docs

### Phase 1: Permission System
- [ ] Create permission database tables
- [ ] Implement permission service
- [ ] Add glob pattern matching
- [ ] Build approval request flow
- [ ] Add auto-approval cache
- [ ] Create permission UI (approval modal)
- [ ] Test permission flow

### Phase 2: Knowledge Base System
- [ ] Create KB database tables
- [ ] Implement document upload & parsing
- [ ] Add chunking & embedding generation
- [ ] Integrate sqlite-vec for vector search
- [ ] Build agent ↔ KB assignment
- [ ] Add context injection to agent
- [ ] Create KB management UI
- [ ] Test KB search quality

### Phase 3: Sandbox Enhancements
- [ ] Add E2B provider support (optional)
- [ ] Implement command execution streaming
- [ ] Add resource monitoring
- [ ] Create sandbox terminal UI
- [ ] Test sandbox security

### Phase 4: Coding Tools
- [ ] Implement all file operation tools
- [ ] Add search tools (glob + regex)
- [ ] Implement shell execution tool
- [ ] Add browser tools (noVNC integration)
- [ ] Create MCP tool adapter
- [ ] Test tool execution

### Phase 5: Slash & @Mention System
- [ ] Create input parser
- [ ] Implement slash command handlers
- [ ] Add @mention resolution
- [ ] Build autocomplete dropdown
- [ ] Create mention chips (Tiptap)
- [ ] Test command routing

### Phase 6: Agent Orchestration
- [ ] Rewrite agent loop with new tools
- [ ] Add sub-agent delegation
- [ ] Implement memory system
- [ ] Add scheduled tasks
- [ ] Test full agent flow

### Phase 7: Frontend Polish
- [ ] Mobile-responsive layout
- [ ] Real-time streaming UI
- [ ] Permission approval modal
- [ ] KB management interface
- [ ] Agent configuration panel
- [ ] Dark theme refinement

### Phase 8: Testing & Deployment
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Security audit
- [ ] Performance testing
- [ ] Production deployment

### Phase 9: SDK Extraction
- [ ] Extract agent loop into standalone SDK
- [ ] Create SDK documentation
- [ ] Publish to npm
- [ ] Build desktop app wrapper

---

## Success Criteria

- [ ] Agent can write/edit files with user approval
- [ ] Agent can execute shell commands in sandbox
- [ ] Agent can browse web via noVNC
- [ ] Knowledge base search returns relevant results
- [ ] Multiple KBs can be assigned to agents
- [ ] Permission system prevents unauthorized actions
- [ ] Slash commands work (/clear, /model, /kb, /agent)
- [ ] @mentions resolve correctly
- [ ] Sub-agents inherit permissions
- [ ] Streaming responses show tool calls
- [ ] Mobile UI is functional
- [ ] All tests pass
- [ ] Production deployment works

---

## Appendix: Key Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite + sqlite-vec | Lightweight, <2MB, no separate vector DB needed |
| Docker sandbox first | Free, fast, already implemented |
| E2B later | Better isolation, but requires internet + paid |
| Glob permissions | Flexible, matches Open Code pattern |
| Tiptap for mentions | Rich text editor with mention support |
| noVNC for browser | Full interactive browser, user can take control |
| Custom agent loop | More control than Vercel AI SDK's built-in agent |
| Supabase Auth | Fast to implement, free tier sufficient |
| Hono API | Lightweight, fast, TypeScript-first |
| Effect-based tools | Consistent pattern, composable |
