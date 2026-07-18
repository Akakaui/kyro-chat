# Kyro Chat — Agentic Chatbot for VPS

**Status**: Pre-build (Phase 0)  
**Date**: July 18, 2026  
**Goal**: Agentic chatbot with E2B sandbox, noVNC browser, email, sub-agents, memory, scheduled tasks

---

## Table of Contents
1. [System Overview](#system-overview)
2. [E2B Sandbox](#e2b-sandbox)
3. [noVNC Browser](#novnc-browser)
4. [Email System](#email-system)
5. [Sub-Agent System](#sub-agent-system)
6. [Memory System](#memory-system)
7. [Scheduled Tasks](#scheduled-tasks)
8. [MCP Integration](#mcp-integration)
9. [Database Schema](#database-schema)
10. [API Routes](#api-routes)
11. [Frontend UI](#frontend-ui)
12. [Deployment](#deployment)
13. [Implementation Phases](#implementation-phases)

---

## 1. System Overview

**Kyro Chat** is an agentic chatbot for VPS with:
- E2B cloud sandbox for code execution
- noVNC browser in Docker (KasmWeb Chrome)
- Email (nodemailer + imap-simple)
- Sub-agents (delegation)
- Memory (sqlite-vec)
- Scheduled tasks (cron)
- Remote MCP connections only
- Custom API / bring your own key

### Architecture
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend   │    │   Backend   │    │   Database   │
│  Next.js 16  │───▶│   Hono API  │───▶│  Supabase   │
│  Tailwind 4  │    │  Node.js 22 │    │  (Postgres) │
│  shadcn/ui   │    │  Vercel AI  │    └─────────────┘
│  noVNC       │    │  E2B SDK    │    ┌─────────────┐
└─────────────┘    │  SQLite     │───▶│   Vector DB  │
                   │  sqlite-vec  │    │  sqlite-vec  │
                   └─────────────┘    └─────────────┘
```

### RAM Budget (500MB VPS)
| Component | RAM |
|-----------|-----|
| Node.js backend | 100–150MB |
| SQLite + sqlite-vec | 20–50MB |
| Docker (noVNC) | 100–200MB |
| Nginx | 10MB |
| OS/other | 100MB |
| **Total** | **~400MB** |

---

## 2. E2B Sandbox

### 2.1 E2B Architecture

```typescript
// E2B integration
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

### 2.2 Sandbox Service

```typescript
// apps/api/src/sandbox/service.ts
import { Sandbox } from 'e2b';

export class EBSSandboxService {
  private apiKey: string;
  private template: string;

  constructor(apiKey: string, template: string = 'base') {
    this.apiKey = apiKey;
    this.template = template;
  }

  async create(options: SandboxOptions): Promise<SandboxInstance> {
    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      template: this.template,
      timeout: options.timeout || 300000, // 5 min
    });

    return {
      id: sandbox.id,
      status: 'running',
      createdAt: new Date(),
    };
  }

  async execute(instanceId: string, command: string): Promise<CommandResult> {
    const sandbox = await Sandbox.connect(instanceId, {
      apiKey: this.apiKey,
    });

    const result = await sandbox.runCode(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.error ? 1 : 0,
    };
  }

  async destroy(instanceId: string): Promise<void> {
    const sandbox = await Sandbox.connect(instanceId, {
      apiKey: this.apiKey,
    });
    await sandbox.kill();
  }
}
```

### 2.3 Database Tables

```sql
-- E2B Sandbox instances
CREATE TABLE sandbox_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT DEFAULT 'e2b',
  status TEXT CHECK(status IN ('creating', 'running', 'stopped', 'destroyed')) NOT NULL,
  template TEXT,
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

### 2.4 API Routes

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

## 3. noVNC Browser

### 3.1 KasmWeb Chrome Container

```typescript
// apps/api/src/browser/service.ts
import Docker from 'dockerode';

export class BrowserService {
  private docker: Docker;
  private containerName: string;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.containerName = 'kyro-chat-browser';
  }

  async start(userId: string): Promise<BrowserSession> {
    // Check if container exists
    const container = await this.docker.getContainer(this.containerName);
    
    try {
      await container.start();
      return { id: this.containerName, status: 'running' };
    } catch (error) {
      // Container doesn't exist, create it
      const newContainer = await this.docker.createContainer({
        Image: 'kasmweb/chrome:1.15.0',
        name: this.containerName,
        Env: ['VNC_PW=password'],
        HostConfig: {
          PortBindings: {
            '6901/tcp': [{ HostPort: '6901' }],
          },
          ShmSize: 2 * 1024 * 1024 * 1024, // 2GB
        },
      });
      
      await newContainer.start();
      return { id: this.containerName, status: 'running' };
    }
  }

  async navigate(url: string): Promise<void> {
    // Use VNC protocol or KasmWeb API to navigate
    // Implementation depends on KasmWeb API
  }

  async screenshot(): Promise<Buffer> {
    // Capture screenshot from VNC
    // Return PNG buffer
  }

  async stop(): Promise<void> {
    const container = await this.docker.getContainer(this.containerName);
    await container.stop();
  }
}
```

### 3.2 noVNC in Frontend

```typescript
// Frontend: embed noVNC in iframe or use noVNC client
// apps/web/components/browser/BrowserView.tsx

export function BrowserView({ sessionId }: { sessionId: string }) {
  const noVNCUrl = `http://${window.location.hostname}:6901`;
  
  return (
    <div className="browser-view">
      <iframe
        src={noVNCUrl}
        className="w-full h-full"
        title="Browser"
      />
    </div>
  );
}
```

### 3.3 Database Tables

```sql
-- Browser sessions
CREATE TABLE browser_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('starting', 'running', 'stopped')) NOT NULL,
  vnc_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  stopped_at DATETIME
);
```

---

## 4. Email System

### 4.1 Email Service

```typescript
// apps/api/src/email/service.ts
import nodemailer from 'nodemailer';
import imapsimple from 'imap-simple';

export class EmailService {
  private transporter: nodemailer.Transporter;
  private imapConfig: any;

  constructor(config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });

    this.imapConfig = {
      imap: {
        user: config.imap.user,
        password: config.imap.pass,
        host: config.imap.host,
        port: config.imap.port,
        tls: config.imap.tls,
        authTimeout: 10000,
      },
    };
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }

  async fetchInbox(): Promise<Email[]> {
    const connection = await imapsimple.connect(this.imapConfig);
    await connection.openBox('INBOX');
    
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT'],
      markSeen: true,
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    return messages.map(this.parseMessage);
  }
}
```

### 4.2 Database Tables

```sql
-- Email accounts
CREATE TABLE email_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  smtp_host TEXT,
  smtp_port INTEGER,
  imap_host TEXT,
  imap_port INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email messages
CREATE TABLE email_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body TEXT,
  received_at DATETIME,
  is_read BOOLEAN DEFAULT FALSE
);
```

---

## 5. Sub-Agent System

### 5.1 Sub-Agent Manager

```typescript
// apps/api/src/agent/subagent.ts
export class SubAgentManager {
  async spawn(options: SubAgentOptions): Promise<SubAgent> {
    const subAgent = await db.createSubAgent({
      parentAgentId: options.parentAgentId,
      name: options.name,
      prompt: options.prompt,
      agentType: options.agentType || 'general',
    });

    // Start sub-agent loop
    const result = await agentLoop(
      options.userId,
      options.sessionId,
      subAgent.id,
      [{ role: 'user', content: options.prompt }]
    );

    return { ...subAgent, result };
  }

  async list(parentAgentId: string): Promise<SubAgent[]> {
    return await db.getSubAgents(parentAgentId);
  }

  async kill(subAgentId: string): Promise<void> {
    await db.updateSubAgent(subAgentId, { status: 'killed' });
  }
}
```

### 5.2 Database Tables

```sql
-- Sub-agents
CREATE TABLE sub_agents (
  id TEXT PRIMARY KEY,
  parent_agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  agent_type TEXT DEFAULT 'general',
  status TEXT CHECK(status IN ('running', 'completed', 'killed')) NOT NULL,
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

---

## 6. Memory System

### 6.1 Memory Service

```typescript
// apps/api/src/memory/service.ts
export class MemoryService {
  async store(userId: string, content: string, category?: string): Promise<Memory> {
    const memory = await db.createMemory({
      userId,
      content,
      category,
    });

    // Generate embedding
    const embedding = await embed(content);
    await vec.insert('memories', memory.id, embedding);

    return memory;
  }

  async search(userId: string, query: string, limit: number = 5): Promise<Memory[]> {
    const queryEmbedding = await embed(query);
    const results = await vec.search('memories', queryEmbedding, limit, {
      filter: { user_id: userId },
    });
    return results;
  }

  async delete(memoryId: string): Promise<void> {
    await db.deleteMemory(memoryId);
    await vec.delete('memories', memoryId);
  }
}
```

### 6.2 Database Tables

```sql
-- Memory
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Scheduled Tasks

### 7.1 Scheduler Service

```typescript
// apps/api/src/scheduler/service.ts
export class SchedulerService {
  async create(options: SchedulerOptions): Promise<ScheduledTask> {
    const task = await db.createScheduledTask({
      userId: options.userId,
      agentId: options.agentId,
      name: options.name,
      prompt: options.prompt,
      cronExpression: options.cronExpression,
    });

    // Schedule with node-cron or similar
    this.scheduleTask(task);
    return task;
  }

  private scheduleTask(task: ScheduledTask): void {
    // Use node-cron to schedule
    cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task.id);
    });
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = await db.getScheduledTask(taskId);
    // Execute the task via agent loop
    await agentLoop(task.userId, task.sessionId, task.agentId, [
      { role: 'user', content: task.prompt },
    ]);
  }
}
```

### 7.2 Database Tables

```sql
-- Scheduled Tasks
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. MCP Integration

### 8.1 Remote MCP Only

```typescript
// MCP configuration for Kyro Chat (remote only)
interface MCPConfig {
  servers: MCPServer[];
}

interface MCPServer {
  name: string;
  url: string;           // Remote MCP server URL
  apiKey?: string;       // Optional API key
}

// No stdio connections (that's for Kyro Code desktop)
```

### 8.2 Database Tables

```sql
-- MCP servers
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  api_key TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Database Schema

### 9.1 Supabase (PostgreSQL) — Remote

```sql
-- Users (managed by Supabase Auth)
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
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT,
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
  key_hint TEXT NOT NULL,
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
  content_type TEXT NOT NULL,
  language TEXT,
  share_token TEXT UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skills
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
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

-- MCP Servers
CREATE TABLE mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  api_key TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.2 SQLite (Local)

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

-- Memory
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sandbox Instances (E2B)
CREATE TABLE sandbox_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT DEFAULT 'e2b',
  status TEXT CHECK(status IN ('creating', 'running', 'stopped', 'destroyed')) NOT NULL,
  template TEXT,
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

-- Browser Sessions
CREATE TABLE browser_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('starting', 'running', 'stopped')) NOT NULL,
  vnc_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  stopped_at DATETIME
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

## 10. API Routes

### 10.1 Full Route Map

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

MCP Servers
  GET    /api/mcp
  POST   /api/mcp
  PUT    /api/mcp/:id
  DELETE /api/mcp/:id
  POST   /api/mcp/:id/test

WebSocket (live updates)
  WS     /ws/chat/:sessionId         - Chat streaming
  WS     /ws/browser/:sessionId      - Browser events
  WS     /ws/sandbox/:sandboxId      - Command output
```

---

## 11. Frontend UI

### 11.1 Design System

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
};
```

### 11.2 Component Structure

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

---

## 12. Deployment

### 12.1 VPS Setup

```bash
# System requirements
- Ubuntu 22.04 LTS
- 500MB+ RAM
- 2+ CPU cores
- 20GB+ storage

# Install
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx docker.io

# Docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### 12.2 Docker Compose

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
      - E2B_API_KEY=${E2B_API_KEY}
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

---

## 13. Implementation Phases

### Phase 0: Setup & Planning ✅
- [x] System architecture design
- [x] Database schema
- [x] Research (E2B, noVNC, email, sub-agents, MCP)
- [x] Comprehensive implementation plan
- [x] Project rename to Kyro Chat
- [x] Organize docs

### Phase 1: E2B Sandbox
- [ ] Set up E2B account and API key
- [ ] Implement E2B sandbox service
- [ ] Add sandbox API routes
- [ ] Create sandbox UI (terminal)
- [ ] Test sandbox execution

### Phase 2: noVNC Browser
- [ ] Set up KasmWeb Chrome container
- [ ] Implement browser service
- [ ] Add browser API routes
- [ ] Create browser UI (iframe/embed)
- [ ] Test browser navigation

### Phase 3: Email System
- [ ] Set up email account (SMTP/IMAP)
- [ ] Implement email service
- [ ] Add email API routes
- [ ] Create email UI
- [ ] Test email send/receive

### Phase 4: Sub-Agent System
- [ ] Implement sub-agent manager
- [ ] Add sub-agent API routes
- [ ] Create sub-agent UI
- [ ] Test sub-agent delegation

### Phase 5: Memory System
- [ ] Implement memory service
- [ ] Add memory API routes
- [ ] Create memory UI
- [ ] Test memory search

### Phase 6: Scheduled Tasks
- [ ] Implement scheduler service
- [ ] Add scheduled task API routes
- [ ] Create scheduled task UI
- [ ] Test cron execution

### Phase 7: MCP Integration
- [ ] Implement MCP client (remote only)
- [ ] Add MCP API routes
- [ ] Create MCP UI
- [ ] Test MCP connections

### Phase 8: Frontend Polish
- [ ] Mobile-responsive layout
- [ ] Real-time streaming UI
- [ ] Agent configuration panel
- [ ] Dark theme refinement

### Phase 9: Testing & Deployment
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Security audit
- [ ] Performance testing
- [ ] Production deployment

---

## Success Criteria

- [ ] Agent can execute code in E2B sandbox
- [ ] Agent can browse web via noVNC
- [ ] Agent can send/receive email
- [ ] Agent can spawn sub-agents
- [ ] Agent can search memory
- [ ] Agent can run scheduled tasks
- [ ] Agent can connect to remote MCP servers
- [ ] Streaming responses show tool calls
- [ ] Mobile UI is functional
- [ ] All tests pass
- [ ] Production deployment works on 500MB VPS
