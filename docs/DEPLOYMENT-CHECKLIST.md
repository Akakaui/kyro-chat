# Kyro Chat — Deploy Checklist

## Staging (VPS)

### Setup
- [ ] VPS (Ubuntu 22.04+, 4GB+ RAM)
- [ ] Node.js 22 installed (`node -v`)
- [ ] Docker installed (`docker ps`)
- [ ] PM2 installed (`pm2 -v`)
- [ ] Nginx installed (`nginx -v`)
- [ ] Domain DNS pointed to VPS IP
- [ ] Git deployed: `git clone https://github.com/Akakaui/kyro-chat.git`
- [ ] Environment file configured: `cp .env.example .env`
- [ ] `ENCRYPTION_KEY` set: `openssl rand -hex 32`
- [ ] At least one LLM API key set (OPENAI_API_KEY, etc.)
- [ ] `FRONTEND_URL` set to staging domain
- [ ] KasmWeb browser container running (port 6901)
- [ ] `VNC_PASSWORD` set (strong, random)

### Build & Run
- [ ] Install deps: `npm install`
- [ ] Build API: `cd apps/api && npx vitest run && cd ../..`
- [ ] Build Web: `cd apps/web && npx vitest run && cd ../..`
- [ ] Start with PM2: `pm2 start ecosystem.config.cjs`
- [ ] PM2 save + startup configured
- [ ] Nginx config placed in sites-available, symlinked, tested, reloaded
- [ ] SSL via Certbot: `sudo certbot --nginx -d staging-domain.com`
- [ ] HTTPS working
- [ ] Health check: `curl https://staging-domain.com/api/health`
- [ ] Frontend loads at https://staging-domain.com
- [ ] Login/signup works
- [ ] Chat sends and receives messages
- [ ] Docker: `docker ps` shows kasmweb/chrome running
- [ ] SSE streaming works (no buffering)

### Security Checks
- [ ] Ports 3000, 3001, 6901 not publicly exposed (UFW)
- [ ] UFW: only OpenSSH + Nginx Full allowed
- [ ] Nginx denies dotfiles (`location ~ /\.`)
- [ ] CSP header present in responses
- [ ] `VNC_PASSWORD` is not default value
- [ ] STRIPE_WEBHOOK_SECRET set in .env (if billing enabled)
- [ ] API_KEY_ENCRYPTION_KEY set (separate from ENCRYPTION_KEY)

---

## Production (VPS)

### Prerequisites
- [ ] Production domain DNS pointed to VPS IP
- [ ] Staging tested for 24+ hours
- [ ] Database backup strategy in place (daily cron)
- [ ] Monitoring plan in place

### Same as Staging + Extra
- [ ] All env vars set for production domain
- [ ] `NODE_ENV=production`
- [ ] `STRIPE_WEBHOOK_SECRET` set (billing)
- [ ] Stripe webhook endpoint configured in Stripe dashboard
- [ ] Rate limits tuned for expected traffic (limits.ts)
- [ ] PM2 memory limits reviewed (ecosystem.config.cjs)
- [ ] SSL: production domain cert obtained
- [ ] Nginx: HSTS preload ready (`Strict-Transport-Security`)
- [ ] Database backed up before first run
- [ ] Cron: daily backup + weekly cleanup

### Go-Live
- [ ] Smoke test all features:
  - [ ] Auth (Supabase or local)
  - [ ] Chat streaming (SSE)
  - [ ] MCP connectors add/remove
  - [ ] BYOK add/remove/validate
  - [ ] Model selection + model routing
  - [ ] Browser (noVNC)
  - [ ] Image generation (if BYOK key supports it)
  - [ ] Knowledge Base (RAG)
  - [ ] Artifacts create/share/remix
  - [ ] Settings (all sections)
  - [ ] Billing checkout + portal (if enabled)
- [ ] Run all tests: API (101) + Web (79)
- [ ] Monitor logs: `pm2 logs` for first hour

### Post-Launch
- [ ] Add uptime monitoring (e.g., UptimeRobot, BetterStack)
- [ ] Add error tracking (e.g., Sentry)
- [ ] Set up log rotation
- [ ] Schedule weekly DB health check
