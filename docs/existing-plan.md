# AkakaCode — Full Project Plan (Updated)

## Overview

AkakaCode is a unified AI coding platform. It runs as a **desktop app** (Electron) or **web app** (VPS-hosted), with UI, agent, and features all bundled as one application.

**Key principle:** One app, two targets. Desktop install for local development, web host for team access. Everything bundled — no separate MCP servers for core features.

**Agent engine:** OpenCode SDK (`@opencode-ai/sdk`) — we use it as a client library to control the agent server. We build everything else on top.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  AkakaCode (One App)                                                 │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  OpenCode SDK (Agent Engine)                                  │     │
│  │                                                               │     │
│  │  createOpencode() → session, message, tool, subagent         │     │
│  │  - LLM calls (Anthropic, OpenAI, etc.)                       │     │
│  │  - Tool execution (our bundled tools)                        │     │
│  │  - Sessions (one per agent)                                   │     │
│  │  - Sub-agents (agent can spawn agents)                       │     │
│  │  - Permissions (per tool, per agent)                          │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  Our Bundled Features (part of the app, not MCP)             │     │
│  │                                                               │     │
│  │  ┌─────────────────────────────────────────────────────┐     │     │
│  │  │  Knowledge Base System                                │     │     │
│  │  │                                                       │     │     │
│  │  │  Embeddings:  transformers.js + all-MiniLM-L6-v2     │     │     │
│  │  │  Vector DB:   sqlite-vec (in SQLite)                  │     │     │
│  │  │  Storage:     better-sqlite3 (one DB file)            │     │     │
│  │  │                                                       │     │     │
│  │  │  Features:                                            │     │     │
│  │  │  - Create multiple knowledge bases                   │     │     │
│  │  │  - Add files, text, URLs to any KB                   │     │     │
│  │  │  - Search across one or all KBs                      │     │     │
│  │  │  - Assign KBs to agents (many-to-many)              │     │     │
│  │  └─────────────────────────────────────────────────────┘     │     │
│  │                                                               │     │
│  │  ┌─────────────────────────────────────────────────────┐     │     │
│  │  │  Scheduler System                                    │     │     │
│  │  │                                                       │     │     │
│  │  │  Engine:     node-cron (cron expressions)            │     │     │
│  │  │  Storage:    SQLite (task persistence)               │     │     │
│  │  │                                                       │     │     │
│  │  │  Features:                                            │     │     │
│  │  │  - Create cron tasks                                 │     │     │
│  │  │  - Assign task to specific agent                     │     │     │
│  │  │  - Pause / resume / delete tasks                     │     │     │
│  │  │  - Task history and logs                             │     │     │
│  │  └─────────────────────────────────────────────────────┘     │     │
│  │                                                               │     │
│  │  ┌─────────────────────────────────────────────────────┐     │     │
│  │  │  Email System                                        │     │     │
│  │  │                                                       │     │     │
│  │  │  Send:       nodemailer (SMTP)                       │     │     │
│  │  │  Receive:    imap-simple (IMAP)                      │     │     │
│  │  │                                                       │     │     │
│  │  │  Features:                                            │     │     │
│  │  │  - Assign email account to agent                     │     │     │
│  │  │  - Agent reads inbox                                  │     │     │
│  │  │  - Agent sends emails                                 │     │     │
│  │  │  - User emails agent directly                         │     │     │
│  │  └─────────────────────────────────────────────────────┘     │     │
│  │                                                               │     │
│  │  ┌─────────────────────────────────────────────────────┐     │     │
│  │  │  Agent System                                        │     │     │
│  │  │                                                       │     │     │
│  │  │  - Create multiple agents                            │     │     │
│  │  │  - Each agent = one OpenCode session                 │     │     │
│  │  │  - Assign KBs to agent (1:1, 1:N, N:1, N:N)        │     │     │
│  │  │  - Assign email to agent                             │     │     │
│  │  │  - Assign tasks to agent                             │     │     │
│  │  │  - Agent-specific system prompts                     │     │     │
│  │  │  - Agent-specific model selection                    │     │     │
│  │  └─────────────────────────────────────────────────────┘     │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  UI (SolidJS)                                                │     │
│  │                                                               │     │
│  │  - Chat (per agent, with KB context)                         │     │
│  │  - File tree (project files)                                 │     │
│  │  - Diff viewer (code changes)                                │     │
│  │  - Terminal (built-in)                                       │     │
│  │  - Knowledge Base manager                                    │     │
│  │  - Scheduler manager                                         │     │
│  │  - Email inbox (per agent)                                   │     │
│  │  - Agent manager (create, config, assign)                    │     │
│  │  - Settings                                                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  MCP (Only for external services)                            │     │
│  │                                                               │     │
│  │  - GitHub (optional)                                         │     │
│  │  - Slack (optional)                                          │     │
│  │  - Other external APIs (optional)                            │     │
│  └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**Desktop mode:** Agent core (OpenCode SDK) runs in Electron main process, UI in renderer, sandbox via node-pty subprocess.

**Web/VPS mode:** Agent core runs as HTTP server, UI served as static files, sandbox via Docker or local shell.

---

## Many-to-Many Assignment Rules

| Relationship | Example | Database |
|-------------|---------|----------|
| One KB → Many Agents | KB "Research" → Agent A + Agent B | `agent_knowledge_bases` junction table |
| One Agent → Many KBs | Agent A → KB1 + KB2 + KB3 | `agent_knowledge_bases` junction table |
| One Agent → One Email | Agent A → inbox@akakacode.com | `email_accounts.agent_id` |
| One Task → One Agent | Task "Daily Report" → Agent A | `tasks.agent_id` |
| One Agent → Many Tasks | Agent A → Task1 + Task2 | `tasks.agent_id` |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Agent Engine** | OpenCode SDK (`@opencode-ai/sdk`) | Client library, controls OpenCode server |
| **Shell** | Electron | Desktop app, server in main process |
| **UI Framework** | SolidJS | Small bundle, fast, OpenCode ecosystem |
| **Styling** | Tailwind CSS 4.1 | Matches OpenCode |
| **File Tree** | `@pierre/trees` | Virtualized, search, git status |
| **Diff Viewer** | `@pierre/diffs` | Shiki-based, side-by-side/inline |
| **Terminal** | `xterm.js` + `node-pty` | Standard Electron terminal |
| **@ Mentions** | `@skyastrall/mentions-react` | Headless, multi-trigger, ~4KB |
| **/ Commands** | `cmdk` | Battle-tested, used by Vercel |
| **Embeddings** | `transformers.js` + `all-MiniLM-L6-v2` | ~23MB, runs locally, no API keys |
| **Vector Search** | `sqlite-vec` | Pure C, <1MB, runs in SQLite |
| **Vector Storage** | `better-sqlite3` | Single file, already in stack |
| **Scheduler** | `node-cron` | Zero deps, cron expressions |
| **Email Send** | `nodemailer` | Zero deps, SMTP |
| **Email Read** | `imap-simple` | IMAP polling |
| **State** | SolidJS signals + Zustand | Lightweight, shared state |
| **Bundler** | Vite | Matches OpenCode |

---

## Database Schema

```sql
-- Knowledge Bases
CREATE TABLE knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents in KBs
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  kb_id TEXT REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding BLOB,  -- 384-dim vector from transformers.js
  metadata JSON,   -- { name, source, type, tags, ... }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vector index (sqlite-vec)
CREATE VIRTUAL TABLE documents_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT DEFAULT 'anthropic/claude-sonnet-4-20250514',
  system_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent ↔ KB Assignment (Many-to-Many)
CREATE TABLE agent_knowledge_bases (
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  kb_id TEXT REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, kb_id)
);

-- Scheduled Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,           -- cron expression
  prompt TEXT NOT NULL,         -- what agent should do
  enabled BOOLEAN DEFAULT true,
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email Accounts
CREATE TABLE email_accounts (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_tls BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_tls BOOLEAN DEFAULT true,
  username TEXT,
  password_encrypted TEXT,      -- encrypted at rest
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task Execution History
CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  session_id TEXT,              -- OpenCode session for this run
  status TEXT DEFAULT 'running', -- running, success, failed
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  output TEXT,
  error TEXT
);
```

---

## How SDK Enables Everything

### Agent Creation Flow
```
User clicks "Create Agent" in UI
        │
        ▼
UI sends request to our code
        │
        ▼
Our code creates agent in SQLite
        │
        ▼
Our code calls: opencode.session.create()
        │
        ▼
SDK creates session (agent core ready)
        │
        ▼
Agent can now:
- Call LLM (via SDK)
- Use tools (via SDK)
- Search KB (via our bundled tool)
- Receive scheduled tasks (via our scheduler)
- Send/receive email (via our bundled tool)
```

### KB Search Flow (Agent Using Knowledge)
```
User asks agent a question
        │
        ▼
SDK receives message
        │
        ▼
Agent decides to search KB
        │
        ▼
Agent calls our "knowledge_search" tool
        │
        ▼
Our code:
  1. Embeds query (transformers.js)
  2. Searches SQLite (sqlite-vec)
  3. Returns relevant documents
        │
        ▼
Agent uses results to answer user
```

### Scheduled Task Flow
```
node-cron triggers task
        │
        ▼
Our code creates new OpenCode session
  (opencode.session.create())
        │
        ▼
Our code sends prompt to session
  (opencode.message.send(sessionId, prompt))
        │
        ▼
Agent executes task using its assigned KBs
        │
        ▼
Results stored in task_runs table
```

### Email Flow (Agent Receives Email)
```
imap-simple checks inbox
        │
        ▼
New email found for agent@akakacode.com
        │
        ▼
Our code creates OpenCode session
        │
        ▼
Our code sends email content to agent
  "You have an email from X: [content]"
        │
        ▼
Agent processes email
  - May search KB for context
  - May draft reply
  - May take action
        │
        ▼
Agent sends reply via our "email_send" tool
  (nodemailer sends via SMTP)
```

---

## Assignment UI Example

### Create Agent + Assign KBs
```
┌─────────────────────────────────────────────┐
│  Create New Agent                           │
│                                             │
│  Name: [Research Bot                    ]   │
│  Model: [anthropic/claude-sonnet-4-20250514 ▼]   │
│  System Prompt: [You are a research...   ]  │
│                                             │
│  Knowledge Bases:                           │
│  ☑ Research Papers    (KB1)                │
│  ☑ Code Examples      (KB2)                │
│  ☐ Company Policies   (KB3)                │
│  ☑ Web Articles       (KB4)                │
│                                             │
│  Email: [research-bot@akakacode.com     ]   │
│                                             │
│  [Cancel]  [Create Agent]                   │
└─────────────────────────────────────────────┘
```

### Database After Creation
```sql
-- Agent created
INSERT INTO agents (id, name, model, system_prompt)
VALUES ('a1', 'Research Bot', 'anthropic/claude-sonnet-4-20250514', 'You are a research...');

-- KBs assigned (many-to-many)
INSERT INTO agent_knowledge_bases (agent_id, kb_id) VALUES ('a1', 'kb1');  -- Research Papers
INSERT INTO agent_knowledge_bases (agent_id, kb_id) VALUES ('a1', 'kb2');  -- Code Examples
INSERT INTO agent_knowledge_bases (agent_id, kb_id) VALUES ('a1', 'kb4');  -- Web Articles

-- Email assigned
INSERT INTO email_accounts (id, agent_id, email)
VALUES ('e1', 'a1', 'research-bot@akakacode.com');
```

---

## Dependencies

```json
{
  "dependencies": {
    "solid-js": "^1.9.0",
    "@opencode-ai/sdk": "latest",
    "@huggingface/transformers": "^3.0.0",
    "sqlite-vec": "^0.1.0",
    "better-sqlite3": "^11.0.0",
    "node-cron": "^4.0.0",
    "nodemailer": "^7.0.0",
    "imap-simple": "^6.0.0",
    "xterm": "^5.0.0",
    "@xterm/addon-fit": "^0.10.0",
    "@pierre/trees": "latest",
    "@pierre/diffs": "latest",
    "@skyastrall/mentions-react": "latest",
    "cmdk": "latest"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "vite": "^6.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

---

## What SDK Handles vs What We Build

| Component | Source | Notes |
|-----------|--------|-------|
| LLM calls | **SDK** | Anthropic, OpenAI, etc. |
| Session management | **SDK** | One session per agent |
| Tool execution | **SDK** | Routes to our bundled tools |
| Sub-agents | **SDK** | Built-in `task` tool |
| Permissions | **SDK** | `opencode.json` config |
| Knowledge Base | **We build** | transformers.js + sqlite-vec |
| Scheduler | **We build** | node-cron + SQLite |
| Email | **We build** | nodemailer + imap-simple |
| Agent CRUD | **We build** | SQLite + UI |
| KB ↔ Agent assignment | **We build** | Junction table + UI |
| Chat UI | **We build** | SolidJS |
| File tree | **We build** | @pierre/trees |
| Diff viewer | **We build** | @pierre/diffs |
| Terminal | **We build** | xterm.js + node-pty |
| Settings UI | **We build** | SolidJS |

---

## Implementation Phases

### Phase 0: Foundation (Days 1-3)
| Task | Details |
|------|---------|
| Project setup | pnpm monorepo, packages structure |
| Dependencies | OpenCode SDK, transformers.js, sqlite-vec, better-sqlite3, node-cron, nodemailer, imap-simple |
| SQLite schema | All tables above |
| OpenCode config | opencode.json, permissions |

### Phase 1: OpenCode Integration (Days 4-6)
| Task | Details |
|------|---------|
| SDK wrapper | `createAkakaCode()` init function |
| Session manager | Create/destroy sessions per agent |
| Message handler | Route messages to correct agent session |
| Tool registration | Register our bundled tools with SDK |

### Phase 2: Knowledge Base (Days 7-10)
| Task | Details |
|------|---------|
| Embedding engine | transformers.js + all-MiniLM-L6-v2 (lazy load, cache model) |
| Vector store | sqlite-vec (create index, search, insert, delete) |
| KB CRUD | Create/delete/rename knowledge bases |
| Document management | Add files, text, URLs. Chunk, embed, store |
| Search API | Query one KB or all assigned KBs |
| Agent integration | Agent calls `knowledge_search` tool |

### Phase 3: Scheduler (Days 11-13)
| Task | Details |
|------|---------|
| Cron engine | node-cron with overlap prevention |
| Task CRUD | Create/pause/resume/delete tasks |
| SQLite persistence | Tasks survive restart |
| Agent integration | Task triggers OpenCode session + message |
| History logging | Store run results in task_runs |

### Phase 4: Email (Days 14-16)
| Task | Details |
|------|---------|
| SMTP send | nodemailer integration |
| IMAP read | imap-simple polling (configurable interval) |
| Account CRUD | Add/remove email accounts per agent |
| Agent integration | Email triggers agent session, agent can reply |
| Password encryption | Encrypt IMAP/SMTP passwords at rest |

### Phase 5: Agent System (Days 17-19)
| Task | Details |
|------|---------|
| Agent CRUD | Create/edit/delete agents |
| KB assignment UI | Many-to-many checkbox interface |
| Email assignment | One email per agent |
| Task assignment | One agent per task |
| Agent switcher | UI to switch between active agents |
| System prompts | Per-agent system prompts |

### Phase 6: UI - Core (Days 20-24)
| Task | Details |
|------|---------|
| Layout | Sidebar + main content |
| Chat UI | Per-agent chat with streaming |
| File tree | @pierre/trees |
| Diff viewer | @pierre/diffs |
| Terminal | xterm.js + node-pty |

### Phase 7: UI - Features (Days 25-28)
| Task | Details |
|------|---------|
| Knowledge Base UI | Create KBs, add files, search, assign to agents |
| Scheduler UI | Create tasks, view history, pause/resume |
| Email UI | Inbox per agent, compose, read, reply |
| Agent Manager | Create agents, assign KBs, config |
| Settings | Model selection, API keys, preferences |

### Phase 8: Desktop App (Days 29-31)
| Task | Details |
|------|---------|
| Electron main | OpenCode server in main process |
| Preload script | Expose SDK to renderer |
| Window management | Single window, menus |
| Tray icon | Background mode |
| Auto-update | Electron updater |

### Phase 9: Web / VPS (Days 32-34)
| Task | Details |
|------|---------|
| Express server | API routes + static files |
| Authentication | Login system (JWT or session) |
| HTTPS | Let's Encrypt or custom cert |
| Process manager | PM2 or systemd |
| Deployment script | One-command VPS setup |

### Phase 10: Testing & Polish (Days 35-38)
| Task | Details |
|------|---------|
| Unit tests | KB, Scheduler, Email modules |
| Integration tests | Agent + KB + Scheduler + Email |
| E2E tests | Full user flows |
| Performance | Model loading, vector search speed |
| Error handling | Graceful failures, retry logic |

---

## File Structure

```
akakacode/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── desktop/              # Electron app
│   │   ├── main.ts           # OpenCode SDK in main process
│   │   ├── preload.ts        # IPC bridge
│   │   └── package.json
│   └── web/                  # VPS web app
│       ├── server.ts         # Express + OpenCode SDK
│       └── package.json
├── packages/
│   ├── ui/                   # SolidJS components
│   │   ├── components/
│   │   │   ├── Chat/
│   │   │   ├── FileTree/
│   │   │   ├── DiffViewer/
│   │   │   ├── Terminal/
│   │   │   ├── KnowledgeBase/
│   │   │   ├── Scheduler/
│   │   │   ├── Email/
│   │   │   ├── AgentManager/
│   │   │   └── Settings/
│   │   └── package.json
│   ├── features/             # Our bundled features
│   │   ├── knowledge-base/   # transformers.js + sqlite-vec
│   │   ├── scheduler/        # node-cron + SQLite
│   │   ├── email/            # nodemailer + imap-simple
│   │   └── agents/           # Agent CRUD + assignments
│   └── sdk/                  # OpenCode SDK wrapper
│       ├── index.ts          # createAkakaCode()
│       └── package.json
├── opencode/
│   ├── tools/                # Custom tools (registered with SDK)
│   │   ├── knowledge.ts      # knowledge_search, knowledge_add
│   │   ├── scheduler.ts      # schedule_task, list_tasks
│   │   └── email.ts          # email_send, email_read
│   ├── skills/               # Skills (registered with SDK)
│   │   └── knowledge.md
│   └── config/
│       └── opencode.json     # Permissions, MCP config
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── docs/
    ├── architecture.md
    └── deployment.md
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| OpenCode SDK changes | Pin version, track releases |
| transformers.js model size | Lazy load, cache after first download |
| sqlite-vec native bindings | Test on all platforms early |
| Electron security | Use context isolation, preload only |
| IMAP polling performance | Configurable intervals, connection pooling |

---

## Summary

| Aspect | Choice |
|--------|--------|
| **Agent Engine** | OpenCode SDK (`@opencode-ai/sdk`) |
| **Desktop** | Electron |
| **Web** | Express + static files |
| **UI Framework** | SolidJS |
| **File Tree** | `@pierre/trees` |
| **Diff Viewer** | `@pierre/diffs` |
| **Terminal** | `xterm.js` + `node-pty` |
| **Embeddings** | `transformers.js` + `all-MiniLM-L6-v2` |
| **Vector Search** | `sqlite-vec` |
| **Scheduler** | `node-cron` |
| **Email** | `nodemailer` + `imap-simple` |
| **VPS Deploy** | Docker + Nginx/Caddy |
| **Timeline** | 38 days (10 phases) |

---

## Advanced Agentic Features

### Human-in-the-Loop System

| Pattern | Implementation | Database |
|---------|---------------|----------|
| **Runtime Questions** | Agent pauses, shows options, user picks. Three modes: multiple-choice, custom input, open-ended | `agent_questions` table |
| **Approval Gates** | Agent pauses before irreversible actions (delete file, send email, deploy). Shows diff/preview, user approves/rejects | `agent_approvals` table |
| **Escalation Triggers** | Agent detects low confidence or ambiguity, escalates to user with context | `agent_escalations` table |
| **Disambiguation** | Agent asks clarifying question before acting on ambiguous request | Same as questions |
| **Progressive Delegation** | Agent starts as drafts-only, autonomy level increases as trust builds (approval history) | `agent_trust` column on agents |
| **Mixed-Initiative** | Either party can take control at any time — no lock-in | Session state tracking |

#### Approval Gate Actions
- File operations: delete, move, overwrite
- Email: send, reply
- Code: execute, deploy, push to main
- External API calls with side effects
- Budget/cost thresholds (LLM token usage)

#### Question Flow
```
Agent needs user input
        │
        ▼
Agent calls "ask_user" tool
  with question + options
        │
        ▼
UI displays question to user
  - Multiple choice: radio buttons
  - Custom: text input
  - Open-ended: textarea
        │
        ▼
User responds
        │
        ▼
Response sent back to agent
        │
        ▼
Agent continues with answer
```

### Plan Mode & Task Orchestration

#### Plan Mode
```
User describes goal
        │
        ▼
Agent enters PLAN MODE
  - Reads codebase (file tree, relevant files)
  - Analyzes architecture
  - Proposes implementation plan
        │
        ▼
Agent presents plan to user
  - List of subtasks
  - Effort estimates (S/M/L/XL)
  - Dependency graph
  - Risks and alternatives
        │
        ▼
User reviews plan
  - Approve → Lock plan → Execute
  - Modify → Adjust plan → Lock → Execute
  - Reject → Agent re-plans
        │
        ▼
Agent executes locked plan
  - Subtasks in dependency order
  - Parallel when independent
  - Checkpoints after each subtask
```

#### Task Decomposition
| Feature | Description |
|---------|-------------|
| **Subtask Generation** | Agent breaks goal into subtasks with estimates |
| **Dependency Graph** | Which subtasks depend on which |
| **Parallel Execution** | Independent subtasks run simultaneously |
| **Checkpoints** | After each subtask, agent checks progress |
| **Re-planning** | If subtask fails, agent re-plans remaining tasks |

#### Kanban Board
| Column | Status |
|--------|--------|
| **Backlog** | Subtasks not yet started |
| **In Progress** | Currently being worked on |
| **Review** | Needs user review/approval |
| **Done** | Completed and verified |

### Memory & Context

#### Three-Layer Memory System
| Layer | What It Stores | How It Works |
|-------|---------------|--------------|
| **Episodic Memory** | Event log: user interactions, tool calls, outcomes | Append-only log with timestamps |
| **Semantic Memory** | Knowledge graph: Topic → Concept → Fact | Graph DB in SQLite |
| **Procedural Memory** | Skills: user preferences, workflow patterns | JSON rules in agents table |

#### Persistent Memory
- Agent remembers across sessions (not just current chat)
- Knowledge graph about your codebase (file relationships, dependencies, patterns)
- Session memory via knowledge graph recall (never hit context limits)
- Context engineering: only send relevant context per turn

#### Memory Flow
```
User starts new session
        │
        ▼
Agent loads:
  - Procedural memory (user preferences)
  - Semantic memory (codebase knowledge)
        │
        ▼
Agent reads current conversation
        │
        ▼
Agent retrieves relevant episodic memory
  (past interactions on similar topics)
        │
        ▼
Agent has full context
  (current + historical + codebase)
```

### Verification & Safety

#### Pre-Action Assertions
| Step | Description |
|------|-------------|
| 1. State expectation | Before acting, agent states expected behavior |
| 2. Execute action | Agent performs the action |
| 3. Check result | Agent compares actual vs expected |
| 4. Grade outcome | Pass/fail/partial with reasoning |
| 5. Report to user | Clear result with evidence |

#### Source-Grounded Plans
- Agent reads code before making plans
- Plans reference specific files and line numbers
- No assumptions — only facts from codebase

#### Audit Trails
- Log every agent action with reasoning
- Record tool calls, parameters, results
- Track decision points and user interactions
- Exportable for compliance/debugging

#### Bounded Autonomy
| Level | Allowed Actions | Requires Approval |
|-------|----------------|-------------------|
| **L1: Drafts** | Create drafts only | Always |
| **L2: Read-Only** | Read files, search, analyze | Always for write |
| **L3: Limited Write** | Edit tracked files, create new | Delete, deploy |
| **L4: Full Write** | All file operations | Delete, deploy |
| **L5: Autonomous** | All actions | Never (but logs everything) |

### Feedback Loops

#### Learning from Interactions
| Signal | Weight | Action |
|--------|--------|--------|
| **Approval without changes** | +2 (positive) | Agent learns this pattern is correct |
| **Approval with modifications** | +1 (learning) | Agent extracts reasoning |
| **Rejection** | -2 (negative) | Agent adds to anti-patterns |
| **Guideline update** | 0 | Codify preference into agent's guidelines |

#### Guideline Updates
```
User rejects agent's action
        │
        ▼
Agent asks "Why was this wrong?"
        │
        ▼
User explains reasoning
        │
        ▼
Agent adds to guidelines:
  "When doing X, always consider Y first"
        │
        ▼
Future actions follow new guideline
```

---

## Updated Database Schema

```sql
-- Add to existing schema above:

-- Agent Trust Level (for progressive delegation)
ALTER TABLE agents ADD COLUMN trust_level INTEGER DEFAULT 1;  -- 1-5

-- Agent Questions (runtime human-in-the-loop)
CREATE TABLE agent_questions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL,  -- 'multiple_choice', 'custom', 'open_ended'
  options JSON,                 -- for multiple_choice: ["option1", "option2", ...]
  response TEXT,                -- user's answer (NULL until answered)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  answered_at DATETIME
);

-- Agent Approvals (approval gates)
CREATE TABLE agent_approvals (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  action_type TEXT NOT NULL,    -- 'file_delete', 'email_send', 'code_execute', etc.
  action_description TEXT NOT NULL,
  preview TEXT,                 -- diff, content preview, etc.
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME
);

-- Agent Escalations (escalation triggers)
CREATE TABLE agent_escalations (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  reason TEXT NOT NULL,         -- 'low_confidence', 'ambiguous', 'high_risk'
  context TEXT,                 -- what agent was trying to do
  suggestion TEXT,              -- what agent thinks should happen
  status TEXT DEFAULT 'open',   -- 'open', 'resolved'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

-- Agent Memory (episodic)
CREATE TABLE agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  memory_type TEXT NOT NULL,    -- 'interaction', 'tool_call', 'decision', 'preference'
  content TEXT NOT NULL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent Knowledge Graph (semantic)
CREATE TABLE knowledge_graph (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  subject TEXT NOT NULL,        -- e.g., "file:src/auth.ts"
  predicate TEXT NOT NULL,      -- e.g., "depends_on"
  object TEXT NOT NULL,         -- e.g., "file:src/db.ts"
  confidence REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit Trail
CREATE TABLE audit_trail (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  action TEXT NOT NULL,         -- 'tool_call', 'llm_call', 'user_interaction'
  details JSON NOT NULL,        -- full action details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task Plan (for plan mode)
CREATE TABLE task_plans (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  goal TEXT NOT NULL,
  status TEXT DEFAULT 'draft',  -- 'draft', 'locked', 'executing', 'completed'
  plan JSON NOT NULL,           -- subtasks, dependencies, estimates
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME,
  completed_at DATETIME
);

-- Task Plan Subtasks
CREATE TABLE plan_subtasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES task_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  effort TEXT,                  -- 'S', 'M', 'L', 'XL'
  status TEXT DEFAULT 'backlog', -- 'backlog', 'in_progress', 'review', 'done'
  depends_on JSON,              -- array of subtask IDs
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);
```

---

## Updated Implementation Phases

### Phase 0: Foundation (Days 1-3)
| Task | Details |
|------|---------|
| Project setup | pnpm monorepo, packages structure |
| Dependencies | All packages (including new ones below) |
| SQLite schema | All tables above |
| OpenCode config | opencode.json, permissions |

### Phase 1: OpenCode Integration (Days 4-6)
| Task | Details |
|------|---------|
| SDK wrapper | `createAkakaCode()` init function |
| Session manager | Create/destroy sessions per agent |
| Message handler | Route messages to correct agent session |
| Tool registration | Register our bundled tools with SDK |

### Phase 2: Knowledge Base (Days 7-10)
| Task | Details |
|------|---------|
| Embedding engine | transformers.js + all-MiniLM-L6-v2 |
| Vector store | sqlite-vec (create index, search, insert, delete) |
| KB CRUD | Create/delete/rename knowledge bases |
| Document management | Add files, text, URLs. Chunk, embed, store |
| Search API | Query one KB or all assigned KBs |
| Agent integration | Agent calls `knowledge_search` tool |

### Phase 3: Scheduler (Days 11-13)
| Task | Details |
|------|---------|
| Cron engine | node-cron with overlap prevention |
| Task CRUD | Create/pause/resume/delete tasks |
| SQLite persistence | Tasks survive restart |
| Agent integration | Task triggers OpenCode session + message |
| History logging | Store run results in task_runs |

### Phase 4: Email (Days 14-16)
| Task | Details |
|------|---------|
| SMTP send | nodemailer integration |
| IMAP read | imap-simple polling |
| Account CRUD | Add/remove email accounts per agent |
| Agent integration | Email triggers agent session, agent can reply |
| Password encryption | Encrypt IMAP/SMTP passwords at rest |

### Phase 5: Agent System (Days 17-19)
| Task | Details |
|------|---------|
| Agent CRUD | Create/edit/delete agents |
| KB assignment UI | Many-to-many checkbox interface |
| Email assignment | One email per agent |
| Task assignment | One agent per task |
| Agent switcher | UI to switch between active agents |
| System prompts | Per-agent system prompts |

### Phase 6: Human-in-the-Loop (Days 20-22) ← NEW
| Task | Details |
|------|---------|
| Question system | `ask_user` tool with three question types |
| Approval gates | `require_approval` tool with preview/diff |
| Escalation triggers | Auto-escalate on low confidence |
| Trust levels | Progressive delegation based on approval history |
| Audit trail | Log all agent actions with reasoning |

### Phase 7: Plan Mode & Orchestration (Days 23-25) ← NEW
| Task | Details |
|------|---------|
| Plan mode | Agent reads codebase, proposes plan |
| Task decomposition | Break goals into subtasks with estimates |
| Dependency graph | Identify which tasks depend on which |
| Kanban board | Visual task management UI |
| Parallel execution | Run independent subtasks simultaneously |
| Checkpoints | After each subtask, verify progress |

### Phase 8: Memory & Context (Days 26-28) ← NEW
| Task | Details |
|------|---------|
| Episodic memory | Event log of interactions |
| Semantic memory | Knowledge graph (Topic → Concept → Fact) |
| Procedural memory | User preferences, workflow patterns |
| Context engineering | Relevant context per turn |
| Feedback loops | Learn from approvals/modifications/rejections |

### Phase 9: UI - Core (Days 29-33)
| Task | Details |
|------|---------|
| Layout | Sidebar + main content |
| Chat UI | Per-agent chat with streaming |
| File tree | @pierre/trees |
| Diff viewer | @pierre/diffs |
| Terminal | xterm.js + node-pty |

### Phase 10: UI - Features (Days 34-37)
| Task | Details |
|------|---------|
| Knowledge Base UI | Create KBs, add files, search, assign to agents |
| Scheduler UI | Create tasks, view history, pause/resume |
| Email UI | Inbox per agent, compose, read, reply |
| Agent Manager | Create agents, assign KBs, config |
| Plan UI | Kanban board, plan editor, subtask view |
| Settings | Model selection, API keys, preferences |

### Phase 11: Desktop App (Days 38-40) ← Moved
| Task | Details |
|------|---------|
| Electron main | OpenCode server in main process |
| Preload script | Expose SDK to renderer |
| Window management | Single window, menus |
| Tray icon | Background mode |
| Auto-update | Electron updater |

### Phase 12: Web / VPS (Days 41-43) ← Moved
| Task | Details |
|------|---------|
| Express server | API routes + static files |
| Authentication | Login system (JWT or session) |
| HTTPS | Let's Encrypt or custom cert |
| Process manager | PM2 or systemd |
| Deployment script | One-command VPS setup |

### Phase 13: Testing & Polish (Days 44-48) ← Moved
| Task | Details |
|------|---------|
| Unit tests | KB, Scheduler, Email, Memory modules |
| Integration tests | Agent + KB + Scheduler + Email + Memory |
| E2E tests | Full user flows |
| Performance | Model loading, vector search speed |
| Error handling | Graceful failures, retry logic |

---

## Updated Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Agent Engine** | OpenCode SDK (`@opencode-ai/sdk`) | Client library, controls OpenCode server |
| **Shell** | Electron | Desktop app, server in main process |
| **UI Framework** | SolidJS | Small bundle, fast, OpenCode ecosystem |
| **Styling** | Tailwind CSS 4.1 | Matches OpenCode |
| **File Tree** | `@pierre/trees` | Virtualized, search, git status |
| **Diff Viewer** | `@pierre/diffs` | Shiki-based, side-by-side/inline |
| **Terminal** | `xterm.js` + `node-pty` | Standard Electron terminal |
| **@ Mentions** | `@skyastrall/mentions-react` | Headless, multi-trigger, ~4KB |
| **/ Commands** | `cmdk` | Battle-tested, used by Vercel |
| **Embeddings** | `transformers.js` + `all-MiniLM-L6-v2` | ~23MB, runs locally, no API keys |
| **Vector Search** | `sqlite-vec` | Pure C, <1MB, runs in SQLite |
| **Vector Storage** | `better-sqlite3` | Single file, already in stack |
| **Scheduler** | `node-cron` | Zero deps, cron expressions |
| **Email Send** | `nodemailer` | Zero deps, SMTP |
| **Email Read** | `imap-simple` | IMAP polling |
| **State** | SolidJS signals + Zustand | Lightweight, shared state |
| **Bundler** | Vite | Matches OpenCode |
| **Memory** | SQLite (episodic, semantic, procedural) | Already in stack, no new deps |
| **Audit Trail** | SQLite (append-only log) | Already in stack, no new deps |

---

## Updated Summary

| Aspect | Choice |
|--------|--------|
| **Agent Engine** | OpenCode SDK (`@opencode-ai/sdk`) |
| **Desktop** | Electron |
| **Web** | Express + static files |
| **UI Framework** | SolidJS |
| **File Tree** | `@pierre/trees` |
| **Diff Viewer** | `@pierre/diffs` |
| **Terminal** | `xterm.js` + `node-pty` |
| **Embeddings** | `transformers.js` + `all-MiniLM-L6-v2` |
| **Vector Search** | `sqlite-vec` |
| **Scheduler** | `node-cron` |
| **Email** | `nodemailer` + `imap-simple` |
| **Memory** | SQLite (episodic + semantic + procedural) |
| **Human-in-the-Loop** | Questions + Approvals + Escalations |
| **Plan Mode** | Task decomposition + Kanban + Dependencies |
| **VPS Deploy** | Docker + Nginx/Caddy |
| **Timeline** | 48 days (13 phases) |

---

## Worktrees, Undo Prompt & Context Extension

### Undo Prompt (Option B: Smart Revert)

When you undo a prompt, the system:
1. **Reverts files** — Git revert to state before the prompt
2. **Deletes agent memory** of that prompt (agent forgets it happened)
3. **Keeps audit trail** — marked as "reverted" for debugging

```
You: "Add product catalog"
Agent: Creates 12 files ✓

You: "Add dark mode"
Agent: Adds dark mode ✓

You: "Undo catalog"
        │
        ▼
System:
  1. Git revert (remove catalog files)
  2. Delete agent memory of "Add product catalog"
  3. Mark audit trail: "reverted"
        │
        ▼
Result:
  ✓ Dark mode still exists
  ✓ Audit trail shows what happened
  ✗ Catalog files removed
  ✗ Agent forgets catalog prompt
```

#### Undo/Redo Commands
| Command | What It Does |
|---------|-------------|
| `Ctrl+Z` | Undo last prompt + all its changes |
| `Ctrl+Shift+Z` | Redo undone prompt |

#### What Gets Reverted
| Item | Reverted? | Why |
|------|-----------|-----|
| File changes | ✅ Yes | Git revert |
| Agent memory of prompt | ✅ Yes | Agent forgets |
| Audit trail | ❌ Kept (marked "reverted") | Debugging |
| User memory | ❌ No | You remember what happened |

---

### Worktrees (Temporary Sandboxes)

Worktrees are **temporary folders** where agents work without touching your main project.

#### Location
```
Your project (NEVER touched by worktrees):
  my-project/
    src/

Worktrees (temporary):
  ~/.akakacode/worktrees/
    my-project-feature-auth/
    my-project-feature-catalog/
    my-project-bugfix-123/
```

#### Who Can Do What
| Action | User | Agent |
|--------|------|-------|
| Create worktree | ✅ | ✅ |
| List worktrees | ✅ | ✅ |
| Merge worktree | ✅ | ✅ |
| Delete worktree | ✅ | ✅ |
| View diff | ✅ | ✅ |
| Work inside worktree | ❌ | ✅ |

#### Worktree Lifecycle
```
1. CREATE (temporary sandbox)
   User or Agent: create_worktree("feature-auth")
   System creates: ~/.akakacode/worktrees/my-project-feature-auth/

2. WORK (isolated)
   Agent works in worktree
   Your main folder: untouched

3. COMMIT (in worktree)
   Agent commits changes to worktree

4. MERGE (or DISCARD)
   User or Agent: merge_worktree("feature-auth")
   System merges worktree into main project
   Worktree deleted after merge

5. CLEANUP
   Worktree removed
   Only your main project remains
```

#### Worktree + Undo Integration
```
Agent creates worktree: my-project-catalog/
Agent commits: "Add product catalog"

You: "Undo catalog"
        │
        ▼
System reverts worktree (or deletes it)
Your main folder: unaffected
```

#### Sub-Agent + Worktree Flow
```
You: "Build e-commerce website"
        │
        ▼
Main Agent creates plan:
  1. Product catalog
  2. Checkout flow
  3. User auth
        │
        ▼
Main Agent spawns 3 sub-agents:
  - Sub-Agent 1 → worktree: catalog/
  - Sub-Agent 2 → worktree: checkout/
  - Sub-Agent 3 → worktree: auth/
        │
        ▼
All work in parallel (no conflicts)
        │
        ▼
Main Agent merges all worktrees
        │
        ▼
Result: Complete e-commerce website
```

---

### Context Extension (Making Agent "Remember More")

The agent's context window is limited (e.g., 200K tokens). Context Extension is the smart way to let the agent work with MORE context than fits in memory.

#### The Problem
```
Claude's context window: 200K tokens
Your codebase: 2M tokens (too big to fit)
Agent needs: All of it to do good work
```

#### The Solution: Smart Context Loading
```
Agent doesn't load EVERYTHING. It loads WHAT IT NEEDS.

Instead of: "Here's all 2M tokens of code"
Do this: "Here's the 50K tokens that matter right now"
```

#### Context Extension Techniques
| Technique | What It Does | Token Savings |
|-----------|-------------|---------------|
| **RAG Search** | Search KB for relevant docs, not all docs | 90% |
| **Code Map** | Agent knows file structure, reads files on demand | 80% |
| **Session Memory** | Summarize old conversations, keep recent | 70% |
| **On-Demand Read** | Only read files when needed, not all at once | 85% |
| **Progressive Disclosure** | Start with overview, zoom in when needed | 75% |

#### Context Extension Flow
```
Agent starts session:
  Context: 8K/200K (4% full)

Agent works for 30 minutes:
  Context: 180K/200K (90% full) ← DANGER

Agent auto-summarizes (no asking):
  System summarizes last 50 messages into 5K
  Context: 135K/200K (67% full) ← OK again

Agent works for 30 more minutes:
  Context: 190K/200K (95% full) ← DANGER

Agent forgets old tool results:
  System deletes old file reads
  Context: 170K/200K (85% full) ← OK again
```

#### Context Management Rules
| Rule | Behavior |
|------|----------|
| **Auto-summarize** | Agent auto-summarizes when context is full (no asking) |
| **On-demand loading** | Load files/KB only when needed |
| **Progressive disclosure** | Start with overview, zoom in when needed |
| **Forget old results** | Delete old tool outputs after applying |
| **Keep decisions** | Never forget user decisions |

#### Context Management Tools (for Agent)
| Tool | What It Does | When Agent Uses It |
|------|-------------|-------------------|
| `search_codebase` | Find files/functions by name or pattern | When exploring code |
| `read_file` | Read specific file (not all files) | When needs file content |
| `search_kb` | Search knowledge base for relevant docs | When needs documentation |
| `summarize_session` | Compress old messages into summary | When context getting full |
| `get_code_map` | Get file tree overview | When exploring project |
| `query_memory` | Load relevant past interactions | When needing history |

#### Example: Without vs With Context Extension
```
WITHOUT (naive approach):
  Agent loads: entire codebase (2M tokens) → CRASH

WITH (smart approach):
  Step 1: Agent loads code map (file tree) → 5K tokens
  Step 2: Agent searches KB for "authentication" → 10K tokens
  Step 3: Agent reads auth.ts (relevant file) → 2K tokens
  Step 4: Agent has context it needs → 17K tokens (fits!)
```

---

### Sub-Agent Delegation

The main agent can spawn sub-agents to handle complex tasks in parallel.

#### Sub-Agent Types
| Type | Purpose | Example |
|------|---------|---------|
| **Specialist** | Expert in one area | "Database Agent" — only handles DB stuff |
| **Generalist** | Does anything | "Code Agent" — writes any code |
| **Reviewer** | Reviews other agents' work | "QA Agent" — tests everything |
| **Planner** | Creates plans only | "Architect Agent" — designs structure |
| **Executor** | Executes plans only | "Builder Agent" — follows plans |

#### Delegation Flow
```
Main Agent receives task
        │
        ▼
Main Agent analyzes:
  - Is this simple? → Do it myself
  - Is this complex? → Break into subtasks
        │
        ▼
For each subtask:
  1. Create sub-agent session
  2. Assign subtask + context
  3. Create worktree (if code changes)
  4. Sub-agent works independently
  5. Sub-agent commits to worktree
  6. Main Agent reviews result
        │
        ▼
Main Agent merges all worktrees
        │
        ▼
Main Agent reports back to you
```

#### Sub-Agent Tools
| Tool | What It Does |
|------|-------------|
| `create_sub_agent` | Spawn a new sub-agent with task |
| `list_sub_agents` | See all active sub-agents |
| `send_to_sub_agent` | Send message to sub-agent |
| `get_sub_agent_result` | Get sub-agent's result |
| `merge_sub_agent` | Merge sub-agent's worktree |

#### Three Modes for AkakaCode
| Mode | When to Use | How It Works |
|------|-------------|--------------|
| **Mode 1: Single Folder** | Simple tasks, one agent | Agent works directly in your project |
| **Mode 2: Worktrees** | Complex tasks, multiple agents | Each agent gets isolated sandbox |
| **Mode 3: Hybrid** | Some tasks parallel, some sequential | Mix of both |

---

### Updated Database Schema

```sql
-- Add to existing schema above:

-- Undo/Redo History
CREATE TABLE undo_history (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  prompt TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,  -- git commit hash before prompt
  status TEXT DEFAULT 'active', -- 'active', 'reverted'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reverted_at DATETIME
);

-- Worktrees
CREATE TABLE worktrees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,         -- ~/.akakacode/worktrees/my-project-feature-auth
  source_project TEXT NOT NULL, -- original project path
  status TEXT DEFAULT 'active', -- 'active', 'merged', 'deleted'
  created_by TEXT NOT NULL,    -- 'user' or 'agent'
  agent_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  merged_at DATETIME,
  deleted_at DATETIME
);

-- Sub-Agents
CREATE TABLE sub_agents (
  id TEXT PRIMARY KEY,
  parent_agent_id TEXT REFERENCES agents(id),
  session_id TEXT,            -- OpenCode session for this sub-agent
  task TEXT NOT NULL,
  worktree_id TEXT REFERENCES worktrees(id),
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Context Snapshots (for undo/redo)
CREATE TABLE context_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  snapshot_type TEXT NOT NULL, -- 'full', 'incremental'
  data JSON NOT NULL,         -- session state at this point
  git_commit TEXT,            -- git commit hash if code changes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### Updated Implementation Phases

#### Phase 6: Human-in-the-Loop (Days 20-22)
| Task | Details |
|------|---------|
| Question system | `ask_user` tool with three question types |
| Approval gates | `require_approval` tool with preview/diff |
| Escalation triggers | Auto-escalate on low confidence |
| Trust levels | Progressive delegation based on approval history |
| Audit trail | Log all agent actions with reasoning |

#### Phase 7: Plan Mode & Orchestration (Days 23-25)
| Task | Details |
|------|---------|
| Plan mode | Agent reads codebase, proposes plan |
| Task decomposition | Break goals into subtasks with estimates |
| Dependency graph | Identify which tasks depend on which |
| Kanban board | Visual task management UI |
| Parallel execution | Run independent subtasks simultaneously |
| Checkpoints | After each subtask, verify progress |

#### Phase 8: Memory & Context (Days 26-28)
| Task | Details |
|------|---------|
| Episodic memory | Event log of interactions |
| Semantic memory | Knowledge graph (Topic → Concept → Fact) |
| Procedural memory | User preferences, workflow patterns |
| Context engineering | Relevant context per turn |
| Feedback loops | Learn from approvals/modifications/rejections |
| Auto-summarize | Agent auto-summarizes when context full |
| On-demand loading | Load files/KB only when needed |

#### Phase 9: Undo/Redo & Worktrees (Days 29-31) ← NEW
| Task | Details |
|------|---------|
| Git snapshots | Create snapshot before each prompt |
| Undo system | Revert files + delete agent memory |
| Redo system | Re-apply reverted prompt |
| Worktree manager | Create/merge/delete worktrees |
| Worktree UI | Show worktrees in sidebar |
| Sub-agent delegation | Spawn sub-agents with worktrees |
| Merge system | Merge worktrees into main project |

#### Phase 10: UI - Core (Days 32-36) ← Moved
| Task | Details |
|------|---------|
| Layout | Sidebar + main content |
| Chat UI | Per-agent chat with streaming |
| File tree | @pierre/trees |
| Diff viewer | @pierre/diffs |
| Terminal | xterm.js + node-pty |

#### Phase 11: UI - Features (Days 37-40) ← Moved
| Task | Details |
|------|---------|
| Knowledge Base UI | Create KBs, add files, search, assign to agents |
| Scheduler UI | Create tasks, view history, pause/resume |
| Email UI | Inbox per agent, compose, read, reply |
| Agent Manager | Create agents, assign KBs, config |
| Plan UI | Kanban board, plan editor, subtask view |
| Settings | Model selection, API keys, preferences |

#### Phase 12: Desktop App (Days 41-43) ← Moved
| Task | Details |
|------|---------|
| Electron main | OpenCode server in main process |
| Preload script | Expose SDK to renderer |
| Window management | Single window, menus |
| Tray icon | Background mode |
| Auto-update | Electron updater |

#### Phase 13: Web / VPS (Days 44-46) ← Moved
| Task | Details |
|------|---------|
| Express server | API routes + static files |
| Authentication | Login system (JWT or session) |
| HTTPS | Let's Encrypt or custom cert |
| Process manager | PM2 or systemd |
| Deployment script | One-command VPS setup |

#### Phase 14: Testing & Polish (Days 47-51) ← Moved
| Task | Details |
|------|---------|
| Unit tests | KB, Scheduler, Email, Memory modules |
| Integration tests | Agent + KB + Scheduler + Email + Memory + Worktrees |
| E2E tests | Full user flows |
| Performance | Model loading, vector search speed |
| Error handling | Graceful failures, retry logic |

---

### Updated Summary

| Aspect | Choice |
|--------|--------|
| **Agent Engine** | OpenCode SDK (`@opencode-ai/sdk`) |
| **Desktop** | Electron |
| **Web** | Express + static files |
| **UI Framework** | SolidJS |
| **File Tree** | `@pierre/trees` |
| **Diff Viewer** | `@pierre/diffs` |
| **Terminal** | `xterm.js` + `node-pty` |
| **Embeddings** | `transformers.js` + `all-MiniLM-L6-v2` |
| **Vector Search** | `sqlite-vec` |
| **Scheduler** | `node-cron` |
| **Email** | `nodemailer` + `imap-simple` |
| **Memory** | SQLite (episodic + semantic + procedural) |
| **Human-in-the-Loop** | Questions + Approvals + Escalations |
| **Plan Mode** | Task decomposition + Kanban + Dependencies |
| **Undo/Redo** | Smart Revert (files + memory, keep audit) |
| **Worktrees** | User + Agent, temp location, deleted after merge |
| **Context Extension** | RAG + Code Map + Memory + On-Demand Read |
| **Sub-Agents** | Spawn sub-agents for parallel work |
| **VPS Deploy** | Docker + Nginx/Caddy |
| **Timeline** | 51 days (14 phases) |

---

## UI/UX Specification: File Tree, Diffs, Sub-Agents, Artifacts & Chat

### 1. File Tree View

**Library**: `@pierre/trees` (path-first, virtualized, Shadow DOM, built-in search, git status, context menu, drag-and-drop)

#### File Tree Panel (Left Sidebar)

```
┌─────────────────────────────────────────┐
│ 📁 my-project                    [🔍] [⋯]│
├─────────────────────────────────────────┤
│ 📄 README.md                  (M)       │
│ 📁 src/                                 │
│   📄 index.ts                  (M)      │
│   📁 components/                        │
│     📄 Button.tsx             (A)      │
│     📄 Input.tsx                        │
│   📁 utils/                             │
│     📄 helpers.ts              (M)      │
│ 📁 tests/                               │
│   📄 Button.test.ts           (A)      │
│ 📄 package.json                         │
│ 📄 tsconfig.json                        │
├─────────────────────────────────────────┤
│ (A) Added  (M) Modified  (D) Deleted    │
└─────────────────────────────────────────┘
```

#### File Tree Features
| Feature | Description |
|---------|-------------|
| **Git Status** | (A) Added, (M) Modified, (D) Deleted badges on files |
| **Search** | Type `/` to search files by name |
| **Context Menu** | Right-click: Open, Copy Path, Copy Relative, Rename, Delete |
| **Expand/Collapse** | Click arrow or press `→`/`←` |
| **Selection** | Click to select, `Shift+Click` for range, `Ctrl+Click` for multi |
| **Drag & Drop** | Move files/folders (optional) |
| **Keyboard Navigation** | `↑`/`↓` navigate, `Enter` opens, `Space` selects |

#### File Tree Actions
| Action | Trigger | Effect |
|--------|---------|--------|
| Open file | `Enter` or double-click | Opens file in editor tab |
| Copy path | `Ctrl+Shift+C` | Copies full file path to clipboard |
| Copy relative | `Ctrl+C` | Copies relative path to clipboard |
| Rename | `F2` or context menu | Inline rename input |
| Delete | `Del` or context menu | Confirm dialog, then delete |
| New file | Context menu → New File | Inline input for filename |
| New folder | Context menu → New Folder | Inline input for folder name |
| Reveal in explorer | Context menu → Reveal | Opens system file manager |

#### File Tree + Agent Integration
```
When agent modifies a file:
  File tree shows (M) badge in real-time

When agent creates a file:
  File tree shows (A) badge

When agent deletes a file:
  File tree shows (D) badge (crossed out)

When agent is working:
  Pulsing dot next to file being modified
```

---

### 2. Diff Viewer

**Library**: `@pierre/diffs` (syntax-highlighted, multi-file, virtualized, worker-pooled)

#### Single File Diff

```
┌──────────────────────────────────────────────────────────────┐
│ 📄 src/components/Button.tsx                    (3 files)    │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  1  │ import React from 'react';                        │ │
│ │  2  │                                                    │ │
│ │  3 -│ interface ButtonProps {                            │ │
│ │  3 +│ interface ButtonProps extends React.HTMLAttributes │ │
│ │  4  │   variant?: 'primary' | 'secondary';              │ │
│ │  5 -│   onClick?: () => void;                           │ │
│ │  5 +│   onClick?: React.MouseEventHandler;              │ │
│ │  6  │ }                                                  │ │
│ │  7  │                                                    │ │
│ │  8 -│ export function Button({ variant, onClick }: ...) │ │
│ │  8 +│ export function Button({ variant, onClick, ...rest │ │
│ │  9 -│   return <button className={variant} onClick={...}│ │
│ │  9 +│   return <button {...rest} className={variant} ..  │ │
│ │ 10  │ }                                                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Previous Change] [Next Change]                              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  Summary: 2 additions, 2 deletions                       │ │
│ │  Files changed: Button.tsx, Input.tsx, helpers.ts        │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### Multi-File Diff (All Changes)

```
┌──────────────────────────────────────────────────────────────┐
│ 📄 All Changes (3 files)              [View: Unified|Split] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌── src/components/Button.tsx ─────────────────────────────┐ │
│ │ +import React from 'react';                              │ │
│ │ -interface ButtonProps {                                 │ │
│ │ +interface ButtonProps extends React.HTMLAttributes {     │ │
│ │    variant?: 'primary' | 'secondary';                    │ │
│ │ -  onClick?: () => void;                                 │ │
│ │ +  onClick?: React.MouseEventHandler;                    │ │
│ │  }                                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌── src/components/Input.tsx ──────────────────────────────┐ │
│ │  import React from 'react';                              │ │
│ │ +import { forwardRef } from 'react';                     │ │
│ │ -interface InputProps {                                   │ │
│ │ +interface InputProps extends React.InputHTMLAttributes {  │ │
│ │    label: string;                                         │ │
│ │ -  onChange?: (value: string) => void;                    │ │
│ │ +  onChange?: React.ChangeEventHandler;                    │ │
│ │  }                                                       │ │
│ │ -export function Input({ label, onChange }: InputProps) { │ │
│ │ +export const Input = forwardRef(({ label, onChange, ...  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌── src/utils/helpers.ts ──────────────────────────────────┐ │
│ │ +export function formatCurrency(amount: number): string { │ │
│ │ +  return new Intl.NumberFormat('en-US', {               │ │
│ │ +    style: 'currency',                                   │ │
│ │ +    currency: 'USD',                                     │ │
│ │ +  }).format(amount);                                     │ │
│ │ +}                                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Previous File] [Next File]                                  │
│ [Accept Change] [Reject Change]                              │
└──────────────────────────────────────────────────────────────┘
```

#### Diff Viewer Features
| Feature | Description |
|---------|-------------|
| **Syntax Highlighting** | Language-aware coloring (TypeScript, Python, etc.) |
| **Unified/Split View** | Toggle between unified and side-by-side |
| **Line Numbers** | Show line numbers on both sides |
| **Inline Comments** | Click a line to add a comment (for review) |
| **Accept/Reject** | Accept or reject individual changes |
| **Word Diff** | Highlight individual word changes within lines |
| **Fold/Unfold** | Collapse unchanged sections |
| **Navigation** | Jump between changes with arrow buttons |
| **File Tabs** | Switch between files in multi-file diff |
| **Copy** | Copy diff or full file to clipboard |

#### Diff Actions
| Action | Trigger | Effect |
|--------|---------|--------|
| Accept change | Click `+` button | Keep this change |
| Reject change | Click `-` button | Revert this change |
| Accept all | Button in header | Keep all changes |
| Reject all | Button in header | Revert all changes |
| Copy diff | `Ctrl+Shift+C` | Copy diff to clipboard |
| Copy file | Button | Copy full file content |
| Open file | Click filename | Open in editor tab |
| View file | Click filename | Show full file (not diff) |
| Previous change | Arrow button | Jump to previous change |
| Next change | Arrow button | Jump to next change |

---

### 3. Sub-Agent View in Folders

When the main agent spawns sub-agents, they appear in the file tree and have their own views.

#### Sub-Agent Folder Structure

```
Your project (main folder):
  my-project/
    src/
    tests/
    package.json

Sub-agent worktrees (in ~/.akakacode/worktrees/):
  my-project-catalog/     ← Sub-Agent 1 (catalog agent)
  my-project-checkout/    ← Sub-Agent 2 (checkout agent)
  my-project-auth/        ← Sub-Agent 3 (auth agent)
```

#### Sub-Agent Panel (Right Sidebar or Bottom Panel)

```
┌──────────────────────────────────────────────────────────────┐
│ Sub-Agents                                              [×] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 🟢 Sub-Agent 1: catalog-agent                                │
│    Status: In Progress                                       │
│    Worktree: ~/.akakacode/worktrees/my-project-catalog/      │
│    Task: "Build product catalog with images"                 │
│    Progress: 3/5 subtasks complete                           │
│    ┌────────────────────────────────────────────────────┐    │
│    │ [View Files] [View Diffs] [View Log] [Merge]      │    │
│    └────────────────────────────────────────────────────┘    │
│                                                              │
│ 🟢 Sub-Agent 2: checkout-agent                               │
│    Status: In Progress                                       │
│    Worktree: ~/.akakacode/worktrees/my-project-checkout/     │
│    Task: "Build checkout flow with Stripe"                   │
│    Progress: 2/4 subtasks complete                           │
│    ┌────────────────────────────────────────────────────┐    │
│    │ [View Files] [View Diffs] [View Log] [Merge]      │    │
│    └────────────────────────────────────────────────────┘    │
│                                                              │
│ 🟡 Sub-Agent 3: auth-agent                                   │
│    Status: Waiting (blocked by checkout-agent)               │
│    Worktree: ~/.akakacode/worktrees/my-project-auth/         │
│    Task: "Implement user authentication"                     │
│    Progress: 0/3 subtasks complete                           │
│    ┌────────────────────────────────────────────────────┐    │
│    │ [View Files] [View Diffs] [View Log] [Merge]      │    │
│    └────────────────────────────────────────────────────┘    │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│ [Merge All] [Merge Selected] [Cancel All]                    │
└──────────────────────────────────────────────────────────────┘
```

#### Sub-Agent File Tree View
When you click "View Files" on a sub-agent:
```
┌─────────────────────────────────────────────────┐
│ 📁 catalog-agent's Worktree            [🔍] [⋯]│
├─────────────────────────────────────────────────┤
│ 📁 src/                                        │
│   📁 components/                               │
│     📄 ProductCard.tsx             (A)         │
│     📄 ProductGrid.tsx             (A)         │
│     📄 ProductModal.tsx            (A)         │
│   📁 data/                                     │
│     📄 products.json              (A)         │
│   📄 index.ts                      (M)         │
│ 📄 package.json                    (M)         │
└─────────────────────────────────────────────────┘
```

#### Sub-Agent Diff View
When you click "View Diffs" on a sub-agent:
```
┌──────────────────────────────────────────────────────────────┐
│ 📄 catalog-agent's Changes (3 files)        [Merge to Main] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌── src/components/ProductCard.tsx ─────────────────────────┐│
│ │ +import React from 'react';                               ││
│ │ +import { formatCurrency } from '../utils/helpers';       ││
│ │ +                                                          ││
│ │ +interface Product {                                       ││
│ │ +  id: string;                                            ││
│ │ +  name: string;                                          ││
│ │ +  price: number;                                         ││
│ │ +  image: string;                                         ││
│ │ +}                                                        ││
│ │ +                                                          ││
│ │ +export function ProductCard({ product }: { product: Product }) { │
│ │ +  return (                                               ││
│ │ +    <div className="product-card">                       ││
│ │ +      <img src={product.image} alt={product.name} />     ││
│ │ +      <h3>{product.name}</h3>                             ││
│ │ +      <p>{formatCurrency(product.price)}</p>             ││
│ │ +    </div>                                               ││
│ │ +  );                                                     ││
│ │ +}                                                        ││
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Accept All] [Reject All] [Merge to Main]                    │
└──────────────────────────────────────────────────────────────┘
```

#### Sub-Agent Log View
When you click "View Log" on a sub-agent:
```
┌──────────────────────────────────────────────────────────────┐
│ 📄 catalog-agent's Log                                [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [14:32:01] Agent started                                     │
│ [14:32:02] Reading project structure...                      │
│ [14:32:05] Found 12 source files                             │
│ [14:32:06] Creating worktree...                              │
│ [14:32:08] Worktree created: ~/.akakacode/worktrees/my-project-catalog/ │
│ [14:32:09] Reading: src/index.ts                             │
│ [14:32:11] Reading: src/utils/helpers.ts                     │
│ [14:32:12] Planning catalog implementation...                │
│ [14:32:14] Creating: src/components/ProductCard.tsx          │
│ [14:32:18] Creating: src/components/ProductGrid.tsx          │
│ [14:32:22] Creating: src/components/ProductModal.tsx         │
│ [14:32:26] Creating: src/data/products.json                  │
│ [14:32:28] Modifying: src/index.ts                           │
│ [14:32:30] Committing changes...                             │
│ [14:32:32] ✓ All subtasks complete                           │
│ [14:32:33] Waiting for merge...                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 4. Plan/Task View (Kanban)

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 E-Commerce Website Plan                          [🔒 Lock]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Goal: Build complete e-commerce website with catalog,        │
│       checkout, and user auth.                               │
│                                                              │
│ Estimated Time: 8 hours  |  Status: In Progress (3/8 done)  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌── Backlog ──────┐ ┌── In Progress ────┐ ┌── Review ──────┐ │
│ │                  │ │                    │ │                │ │
│ │ 🔲 User Auth    │ │ 🟡 Checkout Flow   │ │ 🟢 Catalog     │ │
│ │    (M) 2h       │ │    (L) 3h          │ │    (S) 1h      │ │
│ │    Depends: auth │ │    Depends: none   │ │    Done        │ │
│ │                  │ │                    │ │                │ │
│ │ 🔲 Payment      │ │ 🟡 Email Notify    │ │                │ │
│ │    (L) 3h       │ │    (S) 1h          │ │                │ │
│ │    Depends: checkout │ │    Depends: checkout │ │                │ │
│ └──────────────────┘ └────────────────────┘ └────────────────┘ │
│                                                              │
│ ┌── Done ───────────────────────────────────────────────────┐│
│ │ ✅ Product Catalog     (S) 1h  [View] [Merge]            ││
│ │ ✅ Database Schema     (S) 1h  [View] [Merge]            ││
│ │ ✅ Project Structure   (S) 1h  [View] [Merge]            ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ [Export Plan] [View Dependencies] [View Timeline]            │
└──────────────────────────────────────────────────────────────┘
```

#### Plan View Features
| Feature | Description |
|---------|-------------|
| **Drag & Drop** | Drag tasks between columns |
| **Effort Estimates** | S/M/L/XL badges with hours |
| **Dependencies** | Show which tasks depend on which |
| **Progress** | X/Y done, percentage bar |
| **Lock/Unlock** | Lock plan before execution |
| **Export** | Export plan as markdown or JSON |
| **Timeline** | Gantt chart view of timeline |
| **Dependencies View** | Visual graph of task dependencies |

---

### 5. Terminal in Chat

Terminal output streams directly in the chat as agent runs commands.

```
┌──────────────────────────────────────────────────────────────┐
│ 💬 Chat with main-agent                               [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 👤 You                                                      │
│ Build a React component library with Button and Input        │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ 🤖 Agent                                                    │
│ I'll create a React component library. Let me start by       │
│ setting up the project structure.                            │
│                                                              │
│ ┌── Terminal ────────────────────────────────────────────────┐│
│ │ $ npm init -y                                             ││
│ │ Wrote to /home/user/project/package.json:                 ││
│ │ {                                                         ││
│ │   "name": "component-library",                            ││
│ │   "version": "1.0.0",                                     ││
│ │   "main": "index.js"                                      ││
│ │ }                                                         ││
│ │                                                           ││
│ │ $ npm install react typescript @types/react --save        ││
│ │ added 42 packages in 3.2s                                 ││
│ │                                                           ││
│ │ $ mkdir src/components                                    ││
│ │                                                           ││
│ │ $ cat > src/components/Button.tsx << 'EOF'               ││
│ │ import React from 'react';                                ││
│ │                                                           ││
│ │ interface ButtonProps {                                   ││
│ │   variant?: 'primary' | 'secondary';                     ││
│ │   onClick?: () => void;                                  ││
│ │   children: React.ReactNode;                             ││
│ │ }                                                         ││
│ │                                                           ││
│ │ export function Button({ variant = 'primary', onClick,   ││
│ │   children }: ButtonProps) {                              ││
│ │   return (                                                ││
│ │     <button className={`btn btn-${variant}`}             ││
│ │       onClick={onClick}>                                  ││
│ │       {children}                                          ││
│ │     </button>                                             ││
│ │   );                                                      ││
│ │ }                                                         ││
│ │ EOF                                                       ││
│ │                                                           ││
│ │ $ cat > src/components/Input.tsx << 'EOF'                ││
│ │ import React from 'react';                                ││
│ │                                                           ││
│ │ interface InputProps {                                    ││
│ │   label: string;                                         ││
│ │   onChange?: (value: string) => void;                     ││
│ │ }                                                         ││
│ │                                                           ││
│ │ export function Input({ label, onChange }: InputProps) {  ││
│ │   return (                                                ││
│ │     <div className="input-group">                         ││
│ │       <label>{label}</label>                              ││
│ │       <input onChange={(e) => onChange?.(e.target.value)} ││
│ │       />                                                 ││
│ │     </div>                                                ││
│ │   );                                                      ││
│ │ }                                                         ││
│ │ EOF                                                       ││
│ │                                                           ││
│ │ ✓ Created src/components/Button.tsx                       ││
│ │ ✓ Created src/components/Input.tsx                        ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Files Created ──────────────────────────────────────────┐│
│ │ ✅ src/components/Button.tsx                              ││
│ │ ✅ src/components/Input.tsx                               ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ Component library created! Both Button and Input components  │
│ are ready to use.                                            │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ 👤 You                                                      │
│ Make Button support disabled state                           │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ 🤖 Agent                                                    │
│ I'll update the Button component to support disabled state.  │
│                                                              │
│ ┌── File Change ────────────────────────────────────────────┐│
│ │ 📄 src/components/Button.tsx                              ││
│ │                                                           ││
│ │  import React from 'react';                               ││
│ │                                                           ││
│ │  interface ButtonProps {                                  ││
│ │    variant?: 'primary' | 'secondary';                    ││
│ │ -  onClick?: () => void;                                 ││
│ │ +  onClick?: () => void;                                 ││
│ │ +  disabled?: boolean;                                    ││
│ │    children: React.ReactNode;                            ││
│ │  }                                                        ││
│ │                                                           ││
│ │  export function Button({ variant = 'primary', onClick,  ││
│ │ -  children }: ButtonProps) {                             ││
│ │ +  disabled = false,                                      ││
│ │ +  children }: ButtonProps) {                             ││
│ │    return (                                               ││
│ │ -    <button className={`btn btn-${variant}`}            ││
│ │ -      onClick={onClick}>                                 ││
│ │ +    <button className={`btn btn-${variant}`}            ││
│ │ +      onClick={onClick}                                  ││
│ │ +      disabled={disabled}>                               ││
│ │        {children}                                         ││
│ │      </button>                                            ││
│ │    );                                                     ││
│ │  }                                                        ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ✓ Button now supports disabled state                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Terminal Streaming Features
| Feature | Description |
|---------|-------------|
| **Real-time output** | Terminal output streams as agent runs commands |
| **Command highlighting** | Commands shown in bold/color |
| **Exit codes** | Show ✓ (success) or ✗ (failure) after each command |
| **Copy command** | Click to copy command |
| **Re-run command** | Click to re-run a command |
| **Expand/Collapse** | Collapse long terminal output |
| **Search in output** | Search within terminal output |
| **Full screen** | Click to open terminal in full screen |

---

### 6. Agent Thoughts in Chat

Agent's thinking process shows in chat as it works.

```
┌──────────────────────────────────────────────────────────────┐
│ 💬 Chat with main-agent                               [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 👤 You                                                      │
│ Build a React component library with Button and Input        │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ 🤖 Agent                                                    │
│                                                              │
│ 💭 Thinking...                                               │
│ ┌── Thought ────────────────────────────────────────────────┐│
│ │ The user wants a React component library. I need to:     ││
│ │ 1. Set up project structure                              ││
│ │ 2. Create Button component                               ││
│ │ 3. Create Input component                                ││
│ │ 4. Export both from index                                ││
│ │                                                          ││
│ │ Let me check if there's an existing project...           ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 🔍 Reading: package.json                                     │
│ ┌── Read ───────────────────────────────────────────────────┐│
│ │ File: package.json (0.2 KB)                               ││
│ │ Content not shown (use --show to display)                 ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 📁 Reading directory: src/                                    │
│ ┌── Directory ──────────────────────────────────────────────┐│
│ │ Found 0 files in src/                                     ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 💭 Thinking...                                               │
│ ┌── Thought ────────────────────────────────────────────────┐│
│ │ No existing project. I'll create one from scratch.       ││
│ │ I'll use TypeScript and React with hooks.                ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ✏️ Writing: src/components/Button.tsx                         │
│ ┌── Write ──────────────────────────────────────────────────┐│
│ │ Wrote 256 bytes to src/components/Button.tsx              ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ✏️ Writing: src/components/Input.tsx                          │
│ ┌── Write ──────────────────────────────────────────────────┐│
│ │ Wrote 289 bytes to src/components/Input.tsx               ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 💭 Thinking...                                               │
│ ┌── Thought ────────────────────────────────────────────────┐│
│ │ Both components created. Let me verify the types are     ││
│ │ correct by reading them back.                            ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ 📖 Reading: src/components/Button.tsx                         │
│ ┌── Read ───────────────────────────────────────────────────┐│
│ │ import React from 'react';                               ││
│ │                                                           ││
│ │ interface ButtonProps {                                  ││
│ │   variant?: 'primary' | 'secondary';                    ││
│ │   onClick?: () => void;                                 ││
│ │ }                                                        ││
│ │ ...                                                      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ✓ Component library created!                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Agent Thoughts Features
| Feature | Description |
|---------|-------------|
| **Thought blocks** | Agent's reasoning shown in collapsible blocks |
| **Tool calls** | Show when agent calls tools (read, write, search) |
| **Tool results** | Show abbreviated results (expandable) |
| **Collapsible** | Click to expand/collapse thought blocks |
| **Timestamps** | Show when each thought occurred |
| **Duration** | Show how long each thought took |
| **Search** | Search within agent thoughts |
| **Filter** | Filter by thought type (read, write, search, think) |

---

### 7. Artifact Viewer

All artifacts (plans, tasks, diffs, logs) are viewable in a dedicated panel.

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Artifacts                                         [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [Plans] [Tasks] [Diffs] [Logs] [Files] [Sub-Agents]         │
│                                                              │
│ ┌── Plans ──────────────────────────────────────────────────┐│
│ │ ✅ E-Commerce Website Plan                    [View]      ││
│ │ ✅ Authentication System Plan                 [View]      ││
│ │ 🔲 Payment Integration Plan                  [View]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Tasks ──────────────────────────────────────────────────┐│
│ │ ✅ Create project structure                    [View]     ││
│ │ ✅ Set up TypeScript config                    [View]     ││
│ │ 🟡 Build Button component                     [View]     ││
│ │ 🟡 Build Input component                      [View]     ││
│ │ 🔲 Create tests                               [View]     ││
│ │ 🔲 Write documentation                        [View]     ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Diffs ──────────────────────────────────────────────────┐│
│ │ 📄 Button.tsx (3 additions, 2 deletions)     [View]      ││
│ │ 📄 Input.tsx (5 additions, 1 deletion)       [View]      ││
│ │ 📄 package.json (2 additions)                 [View]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Logs ───────────────────────────────────────────────────┐│
│ │ 📄 Main Agent Log (156 messages)              [View]      ││
│ │ 📄 catalog-agent Log (89 messages)            [View]      ││
│ │ 📄 checkout-agent Log (67 messages)           [View]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Files ──────────────────────────────────────────────────┐│
│ │ 📄 src/components/Button.tsx                  [View]      ││
│ │ 📄 src/components/Input.tsx                   [View]      ││
│ │ 📄 src/index.ts                               [View]      ││
│ │ 📄 package.json                               [View]      ││
│ │ 📄 tsconfig.json                              [View]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Sub-Agents ─────────────────────────────────────────────┐│
│ │ 🟢 catalog-agent (In Progress)                [View]      ││
│ │ 🟢 checkout-agent (In Progress)               [View]      ││
│ │ 🟡 auth-agent (Waiting)                       [View]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 8. Context Engineering: Token Usage & Compression

#### Context Usage Panel

```
┌──────────────────────────────────────────────────────────────┐
│ 📊 Context Usage                                     [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Model: Claude Sonnet 4  |  Max Tokens: 200,000              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ ████████████████████████░░░░░░░░░░░░░░░░░ 135K/200K (67%)││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ Token Breakdown:                                             │
│   System prompt:     8,000 (4%)                              │
│   Conversation:     45,000 (22%)                             │
│   Tool results:     32,000 (16%)                             │
│   File content:     28,000 (14%)                             │
│   KB context:       12,000 (6%)                              │
│   Agent thoughts:   10,000 (5%)                              │
│   ─────────────────────────────                              │
│   Total:           135,000 (67%)                             │
│                                                              │
│ Compression Status:                                          │
│   ✅ Last auto-summarize: 5 minutes ago                      │
│   ✅ Session memory: 23 messages compressed                  │
│   ✅ Old tool results: 12 results forgotten                  │
│   ⏳ Next check: 8 minutes                                  │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ [Summarize Now] [Forget Old Results] [View History]      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ Context Extension Techniques:                                │
│   🔍 RAG Search:     90% savings (12K → 1.2K tokens)       │
│   🗂️ Code Map:       80% savings (50K → 10K tokens)        │
│   💾 Session Memory:  70% savings (45K → 13.5K tokens)      │
│   📖 On-Demand Read:  85% savings (200K → 30K tokens)       │
│   📈 Progressive:     75% savings (80K → 20K tokens)        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Context Compression History

```
┌──────────────────────────────────────────────────────────────┐
│ 📜 Context Compression History                        [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [14:32:01] Session started (8K tokens)                       │
│ [14:45:12] Auto-summarize triggered (135K → 45K tokens)      │
│            Compressed 23 messages into summary                │
│            Savings: 90K tokens (67%)                          │
│ [14:58:23] Auto-summarize triggered (140K → 50K tokens)      │
│            Compressed 31 messages into summary                │
│            Savings: 90K tokens (64%)                          │
│ [15:11:34] Forgot old tool results (130K → 110K tokens)      │
│            Removed 12 old file reads                          │
│            Savings: 20K tokens (15%)                          │
│ [15:24:45] Auto-summarize triggered (145K → 55K tokens)      │
│            Compressed 28 messages into summary                │
│            Savings: 90K tokens (62%)                          │
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│ Total tokens saved: 290K (68% average compression)           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 9. Memory Viewer

```
┌──────────────────────────────────────────────────────────────┐
│ 🧠 Memory                                               [×] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [Episodic] [Semantic] [Procedural] [Search]                  │
│                                                              │
│ ┌── Episodic Memory ────────────────────────────────────────┐│
│ │ [14:32:01] User asked to build React component library    ││
│ │ [14:32:05] Created project structure                      ││
│ │ [14:32:12] Created Button component                       ││
│ │ [14:32:18] Created Input component                        ││
│ │ [14:45:10] User asked to add disabled state               ││
│ │ [14:45:15] Updated Button component                       ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Semantic Memory (Knowledge Graph) ──────────────────────┐│
│ │ Topics:                                                   ││
│ │   ├── React                                               ││
│ │   │   ├── Components → Function components preferred       ││
│ │   │   ├── Hooks → useState, useEffect, useRef             ││
│ │   │   └── TypeScript → Interface for props                ││
│ │   ├── Project                                              ││
│ │   │   ├── Structure → src/components/, src/utils/         ││
│ │   │   └── Config → TypeScript, React, ESLint              ││
│ │   └── User                                                 ││
│ │       ├── Style → Prefers functional components           ││
│ │       └── Patterns → Uses interfaces, not types           ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Procedural Memory ──────────────────────────────────────┐│
│ │ User Preferences:                                         ││
│ │   - Prefers functional components over class components   ││
│ │   - Uses TypeScript with strict mode                      ││
│ │   - Prefers named exports over default exports            ││
│ │   - Uses ESLint with airbnb config                        ││
│ │                                                          ││
│ │ Workflow Patterns:                                        ││
│ │   - Always create tests after components                  ││
│ │   - Use conventional commits (feat:, fix:, etc.)         ││
│ │   - Run lint before committing                           ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ [Search Memory] [Export Memory] [Clear Memory]               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 10. Audit Trail Viewer

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Audit Trail                                        [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [All] [Read] [Write] [Search] [Delete] [Reverted]           │
│                                                              │
│ ┌── Today ──────────────────────────────────────────────────┐│
│ │ [14:32:01] READ    package.json                           ││
│ │ [14:32:02] READ    src/index.ts                           ││
│ │ [14:32:03] WRITE   src/components/Button.tsx    (A)       ││
│ │ [14:32:04] WRITE   src/components/Input.tsx     (A)       ││
│ │ [14:32:05] READ    src/components/Button.tsx               ││
│ │ [14:45:01] READ    src/components/Button.tsx               ││
│ │ [14:45:02] WRITE   src/components/Button.tsx    (M)       ││
│ │ [14:58:01] READ    src/utils/helpers.ts                    ││
│ │ [14:58:02] WRITE   src/utils/helpers.ts         (M)       ││
│ │ [15:11:01] READ    src/components/Input.tsx                ││
│ │ [15:11:02] REVERT  src/components/Button.tsx    (R)       ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ──────────────────────────────────────────────────────────── │
│                                                              │
│ ┌── Yesterday ──────────────────────────────────────────────┐│
│ │ [09:15:01] READ    package.json                           ││
│ │ [09:15:02] READ    src/index.ts                           ││
│ │ [09:15:03] WRITE   src/components/Button.tsx    (A)       ││
│ │ [09:15:04] WRITE   src/components/Input.tsx     (A)       ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ Legend: (A) Added  (M) Modified  (D) Deleted  (R) Reverted  │
│                                                              │
│ [Export Audit] [Filter by Agent] [Filter by Date]            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 11. Trust Level & Bounded Autonomy

```
┌──────────────────────────────────────────────────────────────┐
│ 🔐 Agent Trust Level                                  [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Agent: main-agent                                            │
│ Current Trust Level: 3 (Limited Write)                       │
│ Approval History: 12 approved, 2 modified, 1 rejected       │
│                                                              │
│ ┌── Trust Levels ───────────────────────────────────────────┐│
│ │                                                          ││
│ │ Level 1: Drafts (Safest)                                 ││
│ │   ✅ Read files                                          ││
│ │   ✅ Search codebase                                     ││
│ │   ❌ Write files (asks permission)                       ││
│ │   ❌ Run commands (asks permission)                      ││
│ │                                                          ││
│ │ Level 2: Read-Only                                       ││
│ │   ✅ Read files                                          ││
│ │   ✅ Search codebase                                     ││
│ │   ✅ Create drafts (in separate folder)                  ││
│ │   ❌ Write files (asks permission)                       ││
│ │   ❌ Run commands (asks permission)                      ││
│ │                                                          ││
│ │ Level 3: Limited Write ← CURRENT                        ││
│ │   ✅ Read files                                          ││
│ │   ✅ Search codebase                                     ││
│ │   ✅ Write files (with approval)                         ││
│ │   ✅ Run safe commands (npm install, git status)         ││
│ │   ❌ Run dangerous commands (asks permission)            ││
│ │                                                          ││
│ │ Level 4: Full Write                                      ││
│ │   ✅ Read files                                          ││
│ │   ✅ Search codebase                                     ││
│ │   ✅ Write files (auto-approve)                          ││
│ │   ✅ Run most commands (auto-approve)                    ││
│ │   ❌ Run destructive commands (asks permission)          ││
│ │                                                          ││
│ │ Level 5: Autonomous (Riskiest)                           ││
│ │   ✅ Read files                                          ││
│ │   ✅ Search codebase                                     ││
│ │   ✅ Write files (auto-approve)                          ││
│ │   ✅ Run all commands (auto-approve)                     ││
│ │   ✅ Delete files (auto-approve)                         ││
│ │                                                          ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ [Upgrade Trust] [Downgrade Trust] [View History]             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 12. Feedback Loop Tracker

```
┌──────────────────────────────────────────────────────────────┐
│ 📈 Feedback Loop                                     [×]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Agent: main-agent                                            │
│ Overall Score: +18 (Positive)                                │
│                                                              │
│ ┌── Feedback History ───────────────────────────────────────┐│
│ │ [14:32:01] +2  Created Button component                   ││
│ │             Reason: User approved without changes         ││
│ │ [14:32:05] +1  Created Input component                    ││
│ │             Reason: User modified (added label prop)      ││
│ │ [14:45:01] +2  Added disabled state to Button             ││
│ │             Reason: User approved without changes         ││
│ │ [14:58:01] -1  Updated helpers.ts                         ││
│ │             Reason: User rejected (wrong format)          ││
│ │ [15:11:01] +2  Fixed helpers.ts format                    ││
│ │             Reason: User approved without changes         ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Learned Guidelines ─────────────────────────────────────┐│
│ │ ✅ Always use Intl.NumberFormat for currency              ││
│ │ ✅ Use named exports, not default exports                 ││
│ │ ✅ Add JSDoc comments to public functions                 ││
│ │ ❌ Don't use moment.js (use date-fns instead)            ││
│ │ ❌ Don't use class components (use functional)            ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ [View All Guidelines] [Reset Score] [Export Guidelines]      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 13. Main Layout (All Panels Together)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AkakaCode - main-agent                                              [─] [□] [×]│
├──────────────────────────────────────────────────────────────────────────────┤
│ [File] [Edit] [View] [Agent] [Tools] [Help]                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌── Sidebar ──────────────┐┌── Main Content ───────────────────────────────┐│
│ │                         ││                                                ││
│ │ 📁 File Tree            ││ ┌── Tabs ───────────────────────────────────┐ ││
│ │ 📋 Plans                ││ │ [Button.tsx] [Input.tsx] [helpers.ts] [+] │ ││
│ │ 🧠 Memory               ││ └──────────────────────────────────────────┘││
│ │ 📊 Context              ││                                                ││
│ │ 📋 Audit Trail          ││ ┌── Editor ──────────────────────────────────┐││
│ │ 📦 Artifacts            ││ │ import React from 'react';                │││
│ │ 🔐 Trust Level          ││ │                                            │││
│ │ 📈 Feedback             ││ │ interface ButtonProps {                   │││
│ │                         ││ │   variant?: 'primary' | 'secondary';     │││
│ │ ────────────────────────││ │   onClick?: () => void;                  │││
│ │ 🤖 Agents               ││ │   disabled?: boolean;                    │││
│ │   main-agent            ││ │   children: React.ReactNode;             │││
│ │   catalog-agent         ││ │ }                                        │││
│ │   checkout-agent        ││ │                                          │││
│ │   auth-agent            ││ │ export function Button({                 │││
│ │                         ││ │   variant = 'primary',                   │││
│ │ ────────────────────────││ │   onClick,                               │││
│ │ 📁 Worktrees            ││ │   disabled = false,                      │││
│ │   catalog/              ││ │   children                               │││
│ │   checkout/             ││ │ }: ButtonProps) {                        │││
│ │   auth/                 ││ │   return (                               │││
│ │                         ││ │     <button                             │││
│ │ ────────────────────────││ │       className={`btn btn-${variant}`}  │││
│ │ ⚙️ Settings             ││ │       onClick={onClick}                  │││
│ │                         ││ │       disabled={disabled}>               │││
│ │                         ││ │       {children}                        │││
│ │                         ││ │     </button>                           │││
│ │                         ││ │   );                                     │││
│ │                         ││ │ }                                        │││
│ └─────────────────────────┘└────────────────────────────────────────────────┘│
│                                                                              │
│ ┌── Bottom Panel ───────────────────────────────────────────────────────────┐│
│ │                                                                          ││
│ │ [💬 Chat] [💻 Terminal] [📦 Artifacts] [📊 Context] [📈 Feedback]       ││
│ │                                                                          ││
│ │ ┌── Chat ──────────────────────────────────────────────────────────────┐ ││
│ │ │                                                                     │ ││
│ │ │ 👤 You: Make Button support disabled state                          │ ││
│ │ │                                                                     │ ││
│ │ │ 🤖 Agent:                                                           │ ││
│ │ │ 💭 Thinking...                                                       │ ││
│ │ │ ┌── Thought ──────────────────────────────────────────────────────┐ ││
│ │ │ │ I'll update the Button component to support disabled state.     │ ││
│ │ │ │ I need to:                                                      │ ││
│ │ │ │ 1. Add disabled prop to interface                              │ ││
│ │ │ │ 2. Add disabled to function parameters                         │ ││
│ │ │ │ 3. Pass disabled to button element                             │ ││
│ │ │ └─────────────────────────────────────────────────────────────────┘ ││
│ │ │                                                                     │ ││
│ │ │ 📖 Reading: src/components/Button.tsx                               │ ││
│ │ │ ┌── Read ─────────────────────────────────────────────────────────┐ ││
│ │ │ │ import React from 'react';                                      │ ││
│ │ │ │ ...                                                             │ ││
│ │ │ └─────────────────────────────────────────────────────────────────┘ ││
│ │ │                                                                     │ ││
│ │ │ ✏️ Writing: src/components/Button.tsx                               │ ││
│ │ │ ┌── File Change ──────────────────────────────────────────────────┐ ││
│ │ │ │ 📄 src/components/Button.tsx                                    │ ││
│ │ │ │  import React from 'react';                                     │ ││
│ │ │ │                                                                 │ ││
│ │ │ │  interface ButtonProps {                                        │ ││
│ │ │ │    variant?: 'primary' | 'secondary';                          │ ││
│ │ │ │ -  onClick?: () => void;                                       │ ││
│ │ │ │ +  onClick?: () => void;                                       │ ││
│ │ │ │ +  disabled?: boolean;                                          │ ││
│ │ │ │    children: React.ReactNode;                                  │ ││
│ │ │ │  }                                                              │ ││
│ │ │ └─────────────────────────────────────────────────────────────────┘ ││
│ │ │                                                                     │ ││
│ │ │ ✓ Button now supports disabled state                               │ ││
│ │ │                                                                     │ ││
│ │ │ ───────────────────────────────────────────────────────────────────│ ││
│ │ │                                                                     │ ││
│ │ │ 💬 Type your message...                                     [Send] │ ││
│ │ └─────────────────────────────────────────────────────────────────────┘ ││
│ │                                                                          ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

*Last updated: 2026-07-17*
