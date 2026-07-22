# Kyro Chat: Production Deployment Guide (Coolify + VPS)

This guide walks you through deploying the entire Kyro Chat multi-agent architecture to a self-hosted VPS using Coolify.

## 1. Server Prerequisites
- **VPS Provider**: Hetzner, DigitalOcean, or AWS EC2.
- **OS**: Ubuntu 22.04 LTS (or 24.04).
- **Hardware**: Minimum 4 vCPUs, 8GB RAM (16GB+ recommended since you are running DBs, Redis, MinIO, Next.js, Hono, and KasmWeb containers).
- **Root Access**: SSH access to your server.

## 2. Install Coolify
SSH into your fresh Ubuntu server and run the official Coolify installation script:
```bash
curl -fsSL https://get.coollabs.io/coolify/install.sh | bash
```
Once complete, visit `http://<your-server-ip>:8000` to create your admin account and onboard.

## 3. Configure Infrastructure Services
Inside the Coolify dashboard, navigate to **Resources > + New** to spin up your backend services.

### A. PostgreSQL (with pgvector)
1. Add a **PostgreSQL** service.
2. In the setup, you must ensure the `pgvector` extension is installed. If Coolify's default Postgres image doesn't include it, change the Docker image to `pgvector/pgvector:pg16` in the Coolify service settings.
3. Once running, copy the internal connection string.

### B. Redis
1. Add a **Redis** database service.
2. No special configuration needed. Copy the internal Redis URL.

### C. S3 / Object Storage (MinIO)
1. Add a **MinIO** service via Coolify's one-click templates.
2. Create a bucket named `kyro-artifacts`.
3. Copy the S3 Endpoint URL, Access Key, and Secret Key.

## 4. Deploying the Kyro Chat App
In Coolify, create a new **Project** and add a resource from your Git Repository.

### The Backend (Hono API)
1. Choose **Nixpacks** or **Dockerfile** for the buildpack.
2. Set the build directory to `/apps/api` (if using a monorepo).
3. Set the start command to `npm run start`.
4. **Environment Variables**:
   - `POSTGRES_URL`: `<your-coolify-postgres-internal-url>`
   - `REDIS_URL`: `<your-coolify-redis-internal-url>`
   - `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
   - `E2B_API_KEY`: For your cloud sandboxes.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - LLM API Keys (`ANTHROPIC_API_KEY`, etc.)

### The Frontend (Next.js)
1. Add another service from your Git Repo.
2. Set build directory to `/apps/web`.
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: `<your-coolify-hono-domain>`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 5. Reverse Proxy & Domains
- Coolify uses Traefik automatically.
- Go to the **Settings** for your Next.js and Hono services and bind your custom domains (e.g., `chat.kyro.com` for web, `api.kyro.com` for the backend).
- Coolify will automatically provision SSL/TLS certificates via Let's Encrypt.

## 6. KasmWeb (Browser Agents)
To allow agents to browse the web safely, you can spin up an isolated headless Chrome container using the `kasmweb/chrome` Docker image in Coolify. Your Hono backend will communicate with it via Puppeteer/Playwright using the VNC/Websocket port exposed internally.
