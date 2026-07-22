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

## 4. Knowledge Base (RAG) Architecture

- **Embedder Model**: `@xenova/transformers` using `Xenova/all-MiniLM-L6-v2` (384 dimensions).
- **Vector Store**: `pgvector` extension within PostgreSQL.
- **Pipeline**:
  1. Text is chunked with 200-character overlaps.
  2. Embeddings are generated in-process via Xenova.
  3. Vectors are stored in `kb_chunks.embedding` using the `vector(384)` type.
  4. Search is executed via cosine distance (`<=>`) operators directly in SQL.

## 5. Security Model

- **Authentication**: JWT Bearer tokens verified via Supabase on all protected `/api` routes.
- **Sandboxing**: Code execution happens strictly in remote E2B cloud environments. The host server does not execute agent code.
- **Browser Isolation**: Browsing happens in isolated KasmWeb Docker containers.
- **SSRF Prevention**: All outbound requests (web browsing, MCP connections) go through a strict DNS-resolving validator that blocks localhost and private IP ranges.
- **Encryption**: API keys and external service credentials are encrypted at rest using AES-256-GCM.
