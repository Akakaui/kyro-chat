# Kyro Chat — Architecture Document

**Date:** July 20, 2026  
**Phase:** 2 — Architecture  
**Status:** AWAITING APPROVAL (Gate)

---

## Table of Contents

1. [Stack Decision](#1-stack-decision)
2. [Data Model](#2-data-model)
3. [API Design](#3-api-design)
4. [Infrastructure Decisions](#4-infrastructure-decisions)
5. [Production-Hardening Considerations](#5-production-hardening-considerations)

---

## 1. Stack Decision

### 1.1 Framework + Runtime

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Frontend** | Next.js (React 19) | 15.3+ | Server components, App Router, streaming SSR for chat UI, Tailwind CSS v4 for styling, Zustand for state, TanStack Query for data fetching. Already wired and working. |
| **Backend** | Hono | 4.7+ | Lightweight, edge-ready, Web Standards API. Runs on Node.js (tsx for dev, compiled JS for prod). 20 route groups already implemented. |
| **Runtime** | Node.js 22 (LTS) | 22-slim (Docker) | Native addon support for `better-sqlite3`. Node 22 is current LTS with long-term support through 2027. |
| **Language** | TypeScript 5.8 | Strict mode | Full-stack type safety. Monorepo with `apps/api`, `apps/web`, `packages/*`. |

**Why Hono over Express/Fastify:** Hono provides Web Standard APIs (Request/Response), middleware composition via `app.use()`, built-in CORS/logger, and excellent TypeScript inference. It's lighter than Fastify and more modern than Express. The existing 20 route groups demonstrate the framework handles the workload well.

### 1.2 Database

| Component | Technology | Why |
|-----------|-----------|-----|
| **Primary DB** | SQLite via `better-sqlite3` 11.9+ | Zero-config, single-file, WAL mode for concurrent reads. Perfect for single-server deployment. No connection pooling needed. |
| **Vector Search** | `sqlite-vec` 0.1.4 | SQLite extension for vector similarity search. 384-dimensional embeddings stored and queried in-process. No separate vector DB needed. |
| **ORM/Query** | Raw SQL (parameterized) | Full control over queries. No ORM overhead. All queries already use parameterized statements (no SQL injection). |
| **Auth Store** | Supabase Auth (external) | JWT-based auth with Supabase as the identity provider. User IDs flow through `authMiddleware` and are used for tenant scoping. |

**Why SQLite over PostgreSQL:** The brief explicitly constrains to SQLite. For a single-server SaaS with moderate user counts, SQLite with WAL mode handles concurrent reads well. The `better-sqlite3` binding is synchronous (no async overhead) and performs at ~100K reads/sec. Migration to PostgreSQL would require rewriting all raw SQL queries but is feasible if scale demands it.

**Migration Strategy:** No migration framework. Schema changes use `ALTER TABLE ADD COLUMN` (safe in SQLite). Initial schema is defined in `apps/api/src/db/init.ts` with 14+ tables. For column additions, use `db.prepare('ALTER TABLE ... ADD COLUMN ...')` with `IF NOT EXISTS` guards. For complex migrations, write a one-off script in `apps/api/src/db/migrations/`.

### 1.3 Hosting / Infrastructure

| Component | Technology | Why |
|-----------|-----------|-----|
| **Deployment** | Single VPS (Docker Compose) | The brief constrains to single-server, no k8s/lambda. Docker Compose orchestrates API + browser containers. |
| **Browser** | KasmWeb Chrome 1.15.0 (Docker) | Isolated Chrome instances via VNC/noVNC. Port 6901. Used for web browsing agents. |
| **Code Sandbox** | E2B (cloud) | Sandboxed code execution via E2B SDK. Cloud-based isolation for agent-generated code. |
| **CDN/Edge** | Vercel (web static) or Nginx (self-hosted) | Next.js static export served via CDN for fast initial loads. API served directly from VPS. |

**Why this fits the project:** Kyro Chat is a developer-facing AI chatbot platform with agent orchestration, knowledge bases, code sandboxes, and browser automation. The single-server model with Docker Compose matches the brief's constraint. The architecture supports horizontal scaling by splitting API and web into separate containers behind a reverse proxy.

### 1.4 LLM Providers

| Provider | SDK | Models |
|----------|-----|--------|
| **OpenAI** | `@ai-sdk/openai` 1.2+ | GPT-4o, GPT-4o-mini, o1, o3 |
| **Anthropic** | `@ai-sdk/anthropic` 1.2+ | Claude Sonnet 4, Claude 3.5 Haiku |
| **Google** | `@ai-sdk/google` 1.2+ | Gemini 2.5 Flash, Gemini 2.5 Pro |

All providers are abstracted through Vercel AI SDK (`ai` 4.3+), which provides a unified streaming interface, tool calling, and structured output. The provider abstraction in `apps/api/src/agent/providers.ts` handles model selection, API key resolution, and error handling.

---

## 2. Data Model

### 2.1 Entity Relationship Diagram (Conceptual)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   users      │────<│ conversations│────<│  messages     │
│  (Supabase)  │     │  user_id FK  │     │ conv_id FK    │
└──────────────┘     └──────────────┘     └──────────────┘
       │
       ├────<┌──────────────┐     ┌──────────────┐
       │     │   agents     │────<│ agent_tools  │
       │     │  user_id FK  │     │ agent_id FK  │
       │     └──────────────┘     └──────────────┘
       │
       ├────<┌──────────────┐     ┌──────────────┐
       │     │knowledge_bases│───<│  kb_chunks   │
       │     │  user_id FK  │     │  kb_id FK    │
       │     └──────────────┘     │  (sqlite-vec)│
       │                          └──────────────┘
       ├────<┌──────────────┐     ┌──────────────┐
       │     │  api_keys    │     │ custom_apis  │
       │     │  user_id FK  │     │  user_id FK  │
       │     └──────────────┘     └──────────────┘
       │
       ├────<┌──────────────┐     ┌──────────────┐
       │     │  artifacts   │───<│artifact_shares│
       │     │  user_id FK  │     │ artifact_id  │
       │     └──────────────┘     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │   projects   │
       │     │  user_id FK  │
       │     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │ memory_entries│
       │     │  user_id FK  │
       │     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │scheduled_tasks│
       │     │  user_id FK  │
       │     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │browser_sessions│
       │     │  user_id FK  │
       │     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │  connectors  │
       │     │  user_id FK  │
       │     └──────────────┘
       │
       ├────<┌──────────────┐
       │     │ permissions  │
       │     │  user_id FK  │
       │     └──────────────┘
       │
       └────<┌──────────────┐
             │  usage_tracking│
             │  user_id FK  │
             └──────────────┘
```

### 2.2 Core Tables (14+)

| Table | Purpose | Key Fields | Indexes |
|-------|---------|------------|---------|
| `conversations` | Chat sessions | id, user_id, agent_id, title, created_at | user_id, agent_id |
| `messages` | Individual messages | id, conversation_id, role, content, created_at, tokens | conversation_id, created_at |
| `agents` | AI agent configs | id, user_id, name, system_prompt, model, is_sub_agent | user_id, name |
| `agent_tools` | Tool assignments per agent | id, agent_id, tool_type, tool_config | agent_id |
| `knowledge_bases` | RAG knowledge bases | id, user_id, name, description | user_id |
| `kb_chunks` | Vector-embedded chunks | id, kb_id, user_id, content, embedding (BLOB), metadata | kb_id, user_id (sqlite-vec) |
| `api_keys` | Encrypted API keys | id, user_id, provider, key_encrypted | user_id, provider |
| `projects` | Project containers | id, user_id, name, description | user_id |
| `artifacts` | Generated outputs | id, user_id, title, content, type, share_hash | user_id, share_hash |
| `memory_entries` | Agent memory | id, user_id, agent_id, content, embedding | user_id, agent_id |
| `scheduled_tasks` | Cron jobs | id, user_id, agent_id, cron_expr, last_run | user_id, agent_id |
| `browser_sessions` | Active browser sessions | id, user_id, container_id, vnc_port, status | user_id, status |
| `connectors` | Custom API connectors | id, user_id, name, base_url, api_key_encrypted | user_id |
| `permissions` | HITL permission grants | id, user_id, agent_id, tool_type, granted | user_id, agent_id |
| `usage_tracking` | Per-user usage counters | id, user_id, date, messages, tokens, browser_minutes | user_id, date (unique) |

### 2.3 Vector Search Strategy

- **Embedding Model:** `Xenova/all-MiniLM-L6-v2` (384 dimensions, runs locally via `@xenova/transformers`)
- **Storage:** `sqlite-vec` extension stores embeddings as BLOB in `kb_chunks.embedding`
- **Search:** Cosine similarity via `sqlite-vec` vector search operator
- **Chunking:** Text split into ~500 token chunks with overlap
- **Usage:** RAG retrieval in `apps/api/src/kb/vector.ts` — searchChunks returns top-K matches for query

### 2.4 Migration Strategy

- **No framework:** SQLite doesn't require a migration framework for single-server deployment
- **Pattern:** Run `ALTER TABLE ... ADD COLUMN` in `apps/api/src/db/init.ts` on startup
- **Guard:** Use `PRAGMA table_info(table_name)` to check if column exists before adding
- **Rollback:** Manual. For destructive changes, backup the `.db` file first
- **Testing:** Run `npm run db:init` locally before deploying schema changes

---

## 3. API Design

### 3.1 Endpoint Inventory (20 Route Groups)

All protected routes are mounted under `/api/*` and require JWT Bearer token authentication via `authMiddleware`.

| Route Group | Mount Path | Purpose | Auth Required |
|-------------|-----------|---------|---------------|
| `health` | `/health` | Health check, DB status | No |
| `auth` | `/auth/*` | Login, signup, password reset (IP rate limited) | No |
| `chat` | `/api/chat` | Streaming chat messages, conversations | Yes |
| `user` | `/api/user` | User profile, settings | Yes |
| `agent` | `/api/agents` | CRUD for AI agents | Yes |
| `kb` | `/api/kb` | Knowledge base management, upload, search | Yes |
| `artifacts` | `/api/artifacts` | Generated output management, sharing | Yes |
| `skills` | `/api/skills` | Skill registry and management | Yes |
| `scheduled` | `/api/scheduled` | Cron job management | Yes |
| `browser` | `/api/browser` | KasmWeb browser session control | Yes |
| `sandbox` | `/api/sandbox` | E2B code sandbox sessions | Yes |
| `email` | `/api/email` | SMTP send, IMAP polling, config | Yes |
| `memory` | `/api/memory` | Agent memory CRUD, vector search | Yes |
| `mcp` | `/api/mcp` | MCP server connections, tool discovery | Yes |
| `models` | `/api/models` | Model registry, usage limits | Yes |
| `projects` | `/api/projects` | Project management | Yes |
| `connectors` | `/api/connectors` | Custom API connectors, SSRF validation | Yes |
| `permissions` | `/api/permissions` | HITL permission grants/denials | Yes |
| `keys` | `/api/keys` | API key CRUD (encrypted storage) | Yes |
| `image` | `/api/image` | Image generation (DALL-E, Flux) | Yes |
| `billing` | `/api/billing` | Stripe checkout, portal, usage, webhooks | Yes |

### 3.2 Auth Strategy

**Current Implementation:**

```
Client → Bearer JWT (Supabase) → authMiddleware → decoded user → route handler
```

- **Provider:** Supabase Auth (external identity provider)
- **Token:** JWT Bearer token in `Authorization` header
- **Verification:** `supabase.auth.getUser(token)` — server-side validation with Supabase
- **User ID:** Extracted from JWT payload, passed to route handlers via `c.get('userId')`
- **Middleware:** `apps/api/src/middleware/auth.ts` — applies to all `/api/*` routes

**OAuth Consideration (from brief):** OAuth would require Supabase-side configuration only — no custom auth routes needed. Supabase supports Google, GitHub, Apple, and other OAuth providers out of the box. The current auth middleware is already compatible.

**Permission System:** HITL (Human-in-the-Look) permissions in `apps/api/src/routes/permissions.ts` and `apps/api/src/agent/orchestrator.ts`. Three-button model: Allow Once / Always / Deny. Permissions are scoped per user-agent-tool triple.

### 3.3 Rate Limiting Approach

| Endpoint | Rate Limit | Window | Implementation |
|----------|-----------|--------|----------------|
| `/auth/*` | 10 req/IP | 1 minute | In-memory `authLimit` middleware |
| `/api/chat` (messages) | 20 req/user | 1 minute | In-memory `chatRateLimit` middleware |
| `/api/chat` (tokens) | Model-specific | 4-hour sliding window | DB-backed `usage_tracking` table |
| Other endpoints | None | — | **Missing — security finding M-6** |

**Token Limits (from models.ts):**

| Model Family | Free Tier | Pro Tier |
|-------------|-----------|----------|
| GPT-4o | 10K tokens/4hr | 100K tokens/4hr |
| Claude Sonnet | 10K tokens/4hr | 100K tokens/4hr |
| Gemini Flash | 10K tokens/4hr | 100K tokens/4hr |
| GPT-4o-mini | 50K tokens/4hr | 500K tokens/4hr |

**Gap:** In-memory rate limiting doesn't survive server restarts. Security finding M-6 recommends adding rate limiting to all write endpoints and migrating to Redis for production.

### 3.4 SSE Streaming

Chat responses use Server-Sent Events (SSE) via Hono's streaming API:
- `POST /api/chat/conversations/:id/messages` returns an SSE stream
- Events include: `text-delta`, `tool-call`, `tool-result`, `error`, `done`
- Frontend uses Vercel AI SDK's `useChat` hook for automatic SSE consumption
- Multi-agent orchestration streams from sub-agents through the orchestrator

### 3.5 Error Response Format

```json
{
  "error": "Error message"
}
```

**Gap:** Error messages currently leak internal details in some routes (security finding M-1). Need a consistent `sanitizeError()` wrapper.

---

## 4. Infrastructure Decisions

### 4.1 Hosting Provider

| Choice | Recommendation | Reasoning |
|--------|---------------|-----------|
| **VPS** | Hetzner, DigitalOcean, or Linode | Cost-effective single-server hosting. Docker Compose deploys cleanly. $20-40/mo for 4 vCPU, 8GB RAM handles SQLite + Hono + Next.js + KasmWeb. |
| **Web Static** | Vercel (free tier) or Nginx on VPS | Next.js static export for fast global CDN. Alternatively, serve from Nginx on the same VPS for simplicity. |
| **Database** | SQLite on local disk | No separate DB service needed. Backup via `cp` or `sqlite3 .backup`. |
| **Storage** | Local filesystem + Docker volumes | Knowledge base uploads, artifacts, sandbox files stored locally. Docker volumes for KasmWeb persistence. |

### 4.2 CI/CD Approach

| Stage | Tool | Notes |
|-------|------|-------|
| **Lint** | ESLint (Next.js built-in) | `npm run lint` in web workspace |
| **Type Check** | TypeScript compiler | `tsc --noEmit` for API, Next.js type checking for web |
| **Test** | Vitest | 181 tests across 6 API + 2 web test files. Run `npm test`. |
| **Build** | `next build` (web) + `tsc` (API) | Sequential build: web first, then API |
| **Deploy** | Docker Compose on VPS | `docker compose build && docker compose up -d` |
| **Database** | `npm run db:init` | Run on deploy for schema migrations |

**Missing:** No CI/CD pipeline exists yet. Recommend GitHub Actions with:
1. On push to `main`: lint → typecheck → test → build → deploy
2. SSH deploy to VPS via `appleboy/ssh-action` or similar
3. Run `db:init` post-deploy for schema migrations

### 4.3 Monitoring Strategy

| Layer | Tool | What to Monitor |
|-------|------|-----------------|
| **Process** | Docker health checks | Container status, restart counts |
| **API** | Hono `logger()` middleware | Request/response logs (already enabled) |
| **Errors** | `console.error` + Sentry (recommended) | Uncaught exceptions, unhandled rejections |
| **Database** | SQLite WAL checkpoint monitoring | WAL file size, checkpoint frequency |
| **LLM Usage** | `usage_tracking` table | Token consumption per user per model |
| **Billing** | Stripe webhooks | Subscription status, payment failures |
| **Disk** | System monitoring (htop, df) | SQLite file growth, Docker image sizes |
| **Network** | Uptime monitor (UptimeRobot, BetterStack) | HTTP health endpoint polling |

**Gap:** No structured logging framework exists (security finding L-5). All logging is raw `console.log/error/warn`. Recommend migrating to `pino` for structured JSON logs with PII redaction.

### 4.4 Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side) |
| `API_KEY_ENCRYPTION_KEY` | Yes | 64-char hex string for AES-256-GCM encryption |
| `OPENAI_API_KEY` | Conditional | OpenAI provider |
| `ANTHROPIC_API_KEY` | Conditional | Anthropic provider |
| `GOOGLE_API_KEY` | Conditional | Google provider |
| `E2B_API_KEY` | Yes | E2B sandbox API key |
| `STRIPE_SECRET_KEY` | Yes | Stripe payment processing |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook HMAC verification |
| `FRONTEND_URL` | Yes | CORS origin (default: http://localhost:3000) |
| `PORT` | No | API server port (default: 3001) |

---

## 5. Production-Hardening Considerations

### 5.1 Security Hardening (from security-report.md)

The security audit identified **6 Critical** and **8 High** findings that must be resolved before production:

**Critical (must fix before launch):**

| ID | Finding | Fix | Effort |
|----|---------|-----|--------|
| C-1 | Dual encryption systems (CBC vs GCM) | Standardize on `lib/encryption.ts` (AES-256-GCM) | 1 day |
| C-2 | CBC without authentication tag | Migrate to GCM (part of C-1) | Included |
| C-3 | Weak key derivation via padding | Require 64-char hex key, fail fast | 0.5 day |
| C-4 | SSRF bypass in custom API tools | Extract `validateUrl` to shared module, apply everywhere | 1 day |
| C-5 | VNC password in URL query string | Use websocket path token instead | 0.5 day |
| C-6 | Email credentials stored as plaintext | Encrypt with `encryptApiKey` before DB storage | 0.5 day |

**High (fix in first production sprint):**

| ID | Finding | Fix | Effort |
|----|---------|-----|--------|
| H-1 | Sub-agent queries missing `user_id` scoping | Add `AND user_id = ?` to 4 queries | 0.5 day |
| H-2 | KB chunk search missing cross-tenant scoping | Add `AND user_id = ?` to vector search queries | 0.5 day |
| H-3 | API key sent to untrusted external service | Add user warning, make discovery optional | 0.5 day |
| H-4 | MCP server URL not validated for SSRF | Apply `validateUrl` to MCP connections | 0.5 day |
| H-5 | Browser container hardcoded port, raw Docker socket | Dynamic port allocation, security options | 1 day |
| H-6 | Message queries join without `user_id` | Add join-based ownership check | 0.5 day |
| H-7 | `getDecryptedApiKey` has no tenant scoping | Add `user_id` parameter | 0.5 day |
| H-8 | `browse_web` tool has no SSRF protection | Apply `validateUrl` to tool | 0.5 day |

### 5.2 Architecture Patterns Already in Place

| Pattern | Implementation | Status |
|---------|---------------|--------|
| **JWT Authentication** | Supabase Auth via `authMiddleware` | Working |
| **Parameterized SQL** | All queries use `?` placeholders | Working |
| **WAL Mode** | SQLite WAL for concurrent reads | Working |
| **SSE Streaming** | Hono streaming for chat responses | Working |
| **Multi-Agent Orchestration** | Primary agent delegates to sub-agents | Working |
| **HITL Permissions** | Three-button permission system | Working |
| **Vector Search** | sqlite-vec with local embeddings | Working |
| **Encrypted Secrets** | AES-256-GCM for API keys | Partial (dual system) |
| **Security Headers** | CSP, HSTS, X-Frame-Options | Working |
| **CORS** | Single-origin, credentials enabled | Working |

### 5.3 Architecture Gaps to Address

| Gap | Impact | Priority | Recommendation |
|-----|--------|----------|----------------|
| **No structured logging** | Debugging difficulty, no audit trail | High | Migrate `console.*` to `pino` with structured JSON output |
| **No rate limiting on write endpoints** | API abuse, resource exhaustion | High | Add `chatRateLimit`-style middleware to all POST/PUT/DELETE routes |
| **No dependency vulnerability scanning** | Known CVEs in dependencies | High | Add `npm audit` to CI, configure Dependabot |
| **No audit trail for sensitive operations** | Incident investigation gaps | Medium | Create `audit_log` table, log key/mcp/sandbox/browser operations |
| **In-memory session state** | Lost sessions on restart | Medium | Persist sandbox/browser sessions to DB, reconcile on startup |
| **No input size limits** | Resource exhaustion attacks | Medium | Add Zod schemas with max lengths to all request bodies |
| **No CI/CD pipeline** | Manual deploys, no quality gates | High | GitHub Actions: lint → typecheck → test → build → deploy |
| **No backup strategy** | Data loss risk | High | Daily `sqlite3 .backup` + upload to S3 or similar |

### 5.4 Scalability Considerations

| Dimension | Current | When to Upgrade | Upgrade Path |
|-----------|---------|-----------------|--------------|
| **Users** | Single-server SQLite | >100 concurrent users | Migrate to PostgreSQL + connection pooling |
| **Messages** | In-memory rate limits | >1000 msg/min sustained | Redis for rate limit counters |
| **Vector Search** | sqlite-vec (in-process) | >1M chunks | Pinecone, Qdrant, or pgvector |
| **Browser Sessions** | Single KasmWeb container | >5 concurrent sessions | Container-per-session with dynamic ports |
| **File Storage** | Local filesystem | >10GB uploads | S3-compatible object storage |
| **LLM Costs** | Per-user token limits | Revenue scaling | Stripe billing already integrated |

### 5.5 Deployment Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              VPS (Docker Compose)        │
                    │                                         │
  Client ───────>  │  ┌─────────────┐    ┌──────────────┐   │
  (Browser)        │  │   Nginx     │    │   KasmWeb    │   │
       │           │  │  (reverse   │───>│   Chrome     │   │
       │           │  │   proxy)    │    │   :6901      │   │
       │           │  └──────┬──────┘    └──────────────┘   │
       │           │         │                               │
       │           │  ┌──────┴──────┐    ┌──────────────┐   │
       │           │  │  Next.js    │    │    SQLite     │   │
       │           │  │  :3000      │    │  chatbot.db   │   │
       │           │  │  (static)   │    │  (WAL mode)   │   │
       │           │  └─────────────┘    └──────────────┘   │
       │           │                                         │
       │           │  ┌─────────────┐    ┌──────────────┐   │
       └──────────>│  │  Hono API   │───>│   E2B        │   │
                   │  │  :3001      │    │  (cloud)     │   │
                   │  └─────────────┘    └──────────────┘   │
                   └─────────────────────────────────────────┘
```

**Traffic Flow:**
1. Client requests hit Nginx (reverse proxy)
2. Static assets (`/_next/*`) → Next.js container
3. API requests (`/api/*`) → Hono API container
4. Browser sessions → KasmWeb container (VNC)
5. Code execution → E2B cloud sandbox
6. LLM requests → External providers (OpenAI, Anthropic, Google)

---

## Gate

**Status:** AWAITING APPROVAL

Before proceeding to Phase 3 (Build), the following must be confirmed:

1. **Stack decision:** Is the current stack (Hono + Next.js + SQLite + Supabase Auth) approved for production, or should we evaluate alternatives?
2. **Database:** Is SQLite acceptable for the target scale, or should we migrate to PostgreSQL now?
3. **Deployment target:** Is a single VPS with Docker Compose the intended production model?
4. **Security priorities:** Are the Critical findings (C-1 through C-6) accepted as must-fix before any production deployment?
5. **Brief scope:** Are the 7 work buckets in `brief.md` the approved scope for the refactor, or is there additional work to include?

**Please review and approve or request changes before I proceed to Phase 3.**
