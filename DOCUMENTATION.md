# Kyro Chat Documentation

## 1. System Overview

Kyro Chat is a self-hosted, multi-agent AI chat platform built for developers. It offers orchestration, E2B cloud-based sandboxing, KasmWeb isolated browser execution, and RAG knowledge bases.

## 2. Technology Stack

- **Frontend**: Next.js 15+ (App Router), React 19, Tailwind CSS v4, Zustand.
- **Backend API**: Hono (Node.js runtime).
- **Database**: PostgreSQL (self-hosted).
- **Vector Database**: `pgvector` extension natively inside PostgreSQL.
- **Authentication**: Supabase Auth.
- **Payment Processing**: Stripe.
- **Cache / Rate Limiting**: Redis (self-hosted).
- **Storage**: S3 API-compatible storage (self-hosted via Coolify).

## 3. Infrastructure & Deployment (Coolify)

The entire system is designed to be deployed on a single VPS using [Coolify](https://coolify.io).

### Services
- **Hono API Container**: Main backend serving `/api/*`.
- **Next.js Web Container**: Frontend static & SSR delivery.
- **PostgreSQL Container**: Primary operational database and vector store (`pgvector`).
- **Redis Container**: Rate limiting, caching, and task queues.
- **MinIO / S3 Container**: Blob storage for artifacts, avatars, and file uploads.
- **KasmWeb Chrome Container**: Headless Chrome sessions for browser-automation agents.

### External Services
- **E2B Sandboxes**: Cloud-hosted sandboxes for secure code execution.
- **Supabase**: Hosted identity and authentication provider.

## 4. Agent Orchestration & Tool Calling

### How Agents Call Tools
Kyro uses Native Tool Calling (Function Calling) provided by modern LLMs (Claude, GPT-4).
1. The orchestrator injects a JSON schema of available tools into the system prompt.
2. The AI decides when to call a tool based on the user's intent.
3. The API halts the stream, executes the tool (e.g., executing code in E2B, searching the web, querying `pgvector`), and feeds the result back to the model seamlessly.

### Subagent Architecture
- **Delegation**: A Primary Agent can spawn multiple Subagents simultaneously to tackle parallel tasks.
- **Asynchronous Awaiting**: The main agent puts its stream on hold while waiting for subagents to report back with their findings.
- **Scoping**: Subagents can be instantiated with their own specific system prompts, tools, and subset of Knowledge Bases.

## 5. UI & Media Capabilities

- **Browser Integration**: Agents automate Chrome securely on the backend (KasmWeb). The UI streams a VNC iframe or Live Screenshots to the user in real-time, meaning the user *can* watch the agent browse.
- **Screenshots & Images**: Agents can capture screenshots or generate images (via external Image Gen APIs like Midjourney/DALL-E) and present them in the chat.
- **Carousels**: If the agent returns multiple images (e.g., a design storyboard or UI progression), the frontend markdown parser converts them into interactive sliding carousels.

## 6. Access Control & Context Scopes (Permissions)

Kyro's architecture supports highly granular permissions:
- **Global Knowledge Base**: A user toggle in settings allows specific KBs to automatically inject context globally across all chats.
- **Project Scope**: Users assign Custom Instructions to specific Project Folders. When an agent enters that folder/context, it automatically adopts those instructions.
- **Agent KB Assignment**: Users can assign specific Knowledge Bases to individual agents. 
- **Tool Approvals (HITL)**: Before destructive actions, the orchestrator triggers a Human-in-the-Loop permission prompt on the frontend.

## 7. Security Model

- **Authentication**: JWT Bearer tokens verified via Supabase on all protected `/api` routes.
- **Sandboxing**: Code execution happens strictly in remote E2B cloud environments. The host server does not execute agent code.
- **Browser Isolation**: Browsing happens in isolated KasmWeb Docker containers.
- **SSRF Prevention**: All outbound requests (web browsing, MCP connections) go through a strict DNS-resolving validator that blocks localhost and private IP ranges.
- **Encryption**: API keys and external service credentials are encrypted at rest using AES-256-GCM.
