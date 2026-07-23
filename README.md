# Kyro Chat

Intelligent Agent Platform — a production-grade, multi-provider AI agent system with sandbox execution, streaming, and a dark-obsidian UI.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Coolify (VPS)                        │
│                                                             │
│  ┌──────────────────────┐     ┌──────────────────────────┐  │
│  │     Next.js Web      │     │      Hono API Server     │  │
│  │     (Port 3000)      │────▶│      (Port 3001)         │  │
│  │                      │     │                          │  │
│  │  • Chat UI           │     │  • Auth (Supabase JWT)   │  │
│  │  • Settings          │     │  • Agent Orchestrator    │  │
│  │  • Artifacts         │     │  • Tool Execution        │  │
│  │  • Sandbox Browser   │     │  • BYOK Key Management   │  │
│  └──────────────────────┘     │  • Sandbox (E2B)         │  │
│                               │  • S3 Storage            │  │
│                               └──────────────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PostgreSQL   │  │    Redis     │  │     MinIO (S3)   │  │
│  │  (built-in)  │  │  (built-in)  │  │   (built-in)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Supabase   │  │    Sentry    │  │       E2B        │  │
│  │   (Auth)     │  │  (Errors)    │  │   (Sandbox)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4, Zustand, Radix UI, Framer Motion |
| Backend | Hono (Node.js), AI SDK (Vercel), PostgreSQL, Redis, MinIO |
| Auth | Supabase (JWT + OAuth) |
| Sandbox | E2B (cloud code execution) |
| Billing | Stripe |
| Monitoring | Sentry |
| Deployment | Docker + Coolify |

## Project Structure

```
kyro-chat/
├── apps/
│   ├── api/                    # Hono backend
│   │   ├── src/
│   │   │   ├── agent/          # LLM orchestrator + providers
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── providers.ts
│   │   │   │   └── types.ts
│   │   │   ├── db/             # PostgreSQL schema + migrations
│   │   │   ├── routes/         # API routes (chat, keys, models, auth, etc.)
│   │   │   ├── services/       # Auth, RBAC, Redis, S3, Sentry, Stripe
│   │   │   ├── middleware/     # Rate limiting, CSRF, CORS
│   │   │   ├── tools/          # Sandbox tools (read/write/execute)
│   │   │   └── server.ts       # Entry point
│   │   └── Dockerfile
│   └── web/                    # Next.js frontend
│       ├── components/
│       │   ├── chat/           # ChatMessage, ChatInput, QuestionForm, MessageActions
│       │   ├── artifacts/      # ArtifactPanel, ArtifactPill, ArtifactBottomSheet
│       │   ├── agents/         # AgentPanel (right sidebar)
│       │   ├── panels/         # SlidePanel (hamburger nav)
│       │   ├── models/         # ModelsPage, ModelPicker, ModelUsageBar
│       │   └── settings/       # 12 settings tabs
│       ├── app/                # Next.js App Router pages
│       ├── lib/                # API client, utils
│       ├── hooks/              # useChatStreaming, useChatScroll
│       ├── contexts/           # React contexts
│       └── Dockerfile
├── docker-compose.yml          # Two-service deployment
├── .env.example                # Dev env template
├── .env.production             # Production env template
└── package.json                # Monorepo root
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL (or Coolify's built-in)
- Supabase project (auth only)
- E2B API key ([e2b.dev](https://e2b.dev))

### Local Development

```bash
git clone https://github.com/Akakaui/kyro-chat.git
cd kyro-chat

# Install dependencies
pnpm install

# Copy env template
cp .env.example .env
# Edit .env with your keys

# Start dev servers (API :3001, Web :3000)
pnpm run dev
```

### Production (Coolify)

See the deployment guide below. The short version:

1. Provision a VPS (4 vCPU / 8 GB+ RAM recommended)
2. Install Coolify on the VPS
3. Create a new project → Docker Compose → paste `docker-compose.yml`
4. Add environment variables (see `.env.production`)
5. Point your domain DNS to the VPS
6. Enable SSL via Coolify's built-in Let's Encrypt

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `E2B_API_KEY` | E2B sandbox API key (server won't start without it) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `API_KEY_ENCRYPTION_KEY` | 64-char key for encrypting stored API keys |

### Optional (Server-Side LLM Keys)

These provide default models for all users. Users can override with their own keys via Settings → API Keys.

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI (GPT-4o, o1, etc.) |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google (Gemini) |

### Optional (Infrastructure)

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection string (falls back to in-memory) |
| `DATABASE_URL` | PostgreSQL connection string |
| `S3_ENDPOINT` | S3-compatible storage endpoint |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | S3 bucket name |
| `STRIPE_SECRET_KEY` | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `SENTRY_DSN` | Sentry DSN for error tracking |

### Client-Side (Next.js)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (exposed to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (exposed to browser) |
| `NEXT_PUBLIC_APP_URL` | App URL for OAuth redirects |

## Features

### Multi-Provider BYOK (Bring Your Own Key)

Users can connect **any** LLM provider from Settings → API Keys. No frontend restrictions — every provider works from the backend.

**Natively supported (with default URLs):**
- OpenAI, Anthropic, Google (native SDK)

**OpenAI-compatible (custom base URL):**
- OpenRouter, DeepSeek, Groq, Together AI, Fireworks, Mistral, Qwen/Alibaba, Ollama, and any custom endpoint

When adding a key, users enter:
1. Provider name (auto-detected from key prefix or selected manually)
2. API key
3. Base URL (auto-populated for known providers, editable for Ollama/Custom)
4. Optional: custom model name

### Sandbox Execution

Code runs in E2B cloud sandboxes — isolated, ephemeral VMs with full internet access.

- `execute_command` — run shell commands
- `write_file` / `read_file` — file I/O
- `list_directory` — browse filesystem
- Auto-creates new sandbox per conversation
- Configurable timeout (default 60s)

### Agents

- **General** — default agent, all tools
- **Code Specialist** — expert code review + refactor
- **Research Agent** — web search + analysis
- Custom agents via Settings → Agents

### Chat Interface

- Real-time streaming with Server-Sent Events
- Model + Agent pills in input area
- Ghost/Incognito mode for new chats (first message only)
- Artifact detection (code, markdown, CSV, HTML rendered inline)
- Artifact pill (mobile) with slide-up bottom sheet
- Message actions: Copy, Like, Dislike, Regenerate
- Permission request modals for sandbox tools

### Artifacts

Lightweight content objects auto-detected from agent responses:
- **Code** — syntax-highlighted with copy
- **Documents** — markdown, CSV, plain text
- **HTML/CSS** — live preview
- **Sandbox** — temporary auto-expiring previews

### Settings (12 Tabs)

1. **General** — app name, language, theme, timezone
2. **Account & Billing** — profile, subscription, Stripe
3. **Capabilities** — toggle features on/off
4. **Agents** — create/edit/delete agents
5. **Skills** — install/configure agent skills
6. **Connectors & MCP** — external integrations
7. **Email Settings** — IMAP/SMTP config
8. **Memory** — conversation memory settings
9. **Knowledge Base** — file upload, indexing
10. **Scheduled Tasks** — cron-based agent tasks
11. **Appearance** — theme customization
12. **Archive** — archived conversations

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `POST` | `/auth/login` | No | Email/password login |
| `POST` | `/auth/signup` | No | Email/password signup |
| `POST` | `/chat` | Yes | Streaming chat |
| `GET` | `/keys` | Yes | List API keys |
| `POST` | `/keys` | Yes | Create API key |
| `POST` | `/keys/:id/validate` | Yes | Validate a key |
| `GET` | `/keys/providers` | No | List supported providers |
| `GET` | `/models` | Yes | List available models |
| `POST` | `/storage/upload` | Yes | Upload file to S3 |

## Scripts

```bash
# Development
pnpm run dev          # Start both API + Web
pnpm run dev:api      # API only (port 3001)
pnpm run dev:web      # Web only (port 3000)

# Build
pnpm run build        # Build both

# Database
pnpm run db:init      # Initialize PostgreSQL schema

# Tests
pnpm run test         # Run all tests
pnpm run test:api     # API tests only
pnpm run test:web     # Web tests only
```

## Git Workflow

- **`master`** — production branch (default), auto-deploys via Coolify
- **`develop`** — feature branch, merge to master when ready

## Security

- API keys encrypted at rest with AES-256-GCM
- Supabase JWT authentication
- CSRF protection on all state-changing endpoints
- Rate limiting (100 req/min per IP)
- Input sanitization (XSS, SQL injection)
- E2B sandbox isolation (no local code execution)
- Sentry error tracking

## License

Private — All rights reserved.
