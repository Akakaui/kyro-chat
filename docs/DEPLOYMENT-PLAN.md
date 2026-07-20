# Kyro Chat — VPS Deployment Plan

## Architecture Overview

```
Internet → Nginx (443) → PM2 (port 3000: web, 3001: api) → KasmWeb (port 6901: browser)
                            ↕
                       SQLite (local disk)
                       Supabase (optional, for auth)
```

## Prerequisites

- VPS running Ubuntu 22.04+ (4GB RAM minimum, 8GB recommended)
- Domain name pointed at VPS IP
- Root or sudo access
- Supabase project (optional, for auth)

---

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker (for KasmWeb browser)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install PM2
sudo npm install -g pm2

# Install nginx
sudo apt install -y nginx

# Install build deps (for better-sqlite3)
sudo apt install -y python3 make g++
```

## Step 2: Clone & Build

```bash
cd /home/ubuntu
git clone <your-repo-url> kyro-chat
cd kyro-chat

# Install all deps
npm install

# Build API
cd apps/api && npm run build && cd ../..

# Build Web
cd apps/web && npm run build && cd ../..
```

## Step 3: Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with production values:

```bash
# Required
ENCRYPTION_KEY=<64-char-hex-string>
# Generate with: openssl rand -hex 32

# Supabase (if using auth)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# LLM API keys (at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# E2B (optional)
E2B_API_KEY=e2b_...

# Frontend URL (your domain)
FRONTEND_URL=https://yourdomain.com

# VNC password for browser service
VNC_PASSWORD=<strong-random-password>
```

**Critical**: The `ENCRYPTION_KEY` must be exactly 64 hex characters. Generate with:
```bash
openssl rand -hex 32
```

## Step 4: Configure PM2

The `ecosystem.config.cjs` is already in the repo. Update env vars:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Follow the output to enable on boot
```

## Step 5: Start KasmWeb Browser Service

```bash
docker run -d \
  --name kyro-browser \
  --restart unless-stopped \
  -p 6901:6901 \
  -e VNC_PASSWORD=<same-as-.env> \
  -e KASM_DISABLE_AUTH=1 \
  kasmweb/chrome:1.15.0
```

## Step 6: Nginx Configuration

Create `/etc/nginx/sites-available/kyro-chat`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL (use certbot — see Step 7)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Next.js frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Hono API
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        client_max_body_size 100k;
    }

    # VNC browser access (restrict to auth or local)
    location /browser/ {
        proxy_pass http://127.0.0.1:6901/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Deny dotfiles
    location ~ /\. {
        deny all;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/kyro-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 7: SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Select redirect HTTP → HTTPS
```

Auto-renewal is set up by default. Verify with:
```bash
sudo certbot renew --dry-run
```

## Step 8: Initialize Database

```bash
cd /home/ubuntu/kyro-chat
npx tsx apps/api/src/db/init.ts
```

This creates the SQLite database with all tables and migrations.

## Step 9: Verify Everything

```bash
# Check PM2 processes
pm2 status

# Check Docker
docker ps

# Check Nginx
sudo systemctl status nginx

# Test API
curl -s http://localhost:3001/api/health

# Test Web
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Test via Nginx (from another machine)
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com

# Run tests
npm run test
```

## Step 10: Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

**Do NOT expose ports 3000, 3001, or 6901 publicly** — they are only accessed via nginx.

---

## Ongoing Operations

### Deploy updates
```bash
cd /home/ubuntu/kyro-chat
git pull
npm install
cd apps/api && npm run build && cd ../..
cd apps/web && npm run build && cd ../..
pm2 restart all
```

Or use the deploy script:
```bash
./deploy.sh deploy
```

### View logs
```bash
pm2 logs
# Or specific app:
pm2 logs kyro-api
pm2 logs kyro-web
```

### Database backups
```bash
# Backup SQLite
cp /home/ubuntu/kyro-chat/data/kyro.db /home/ubuntu/kyro-chat/backups/kyro-$(date +%Y%m%d).db

# Cron job for daily backups
echo "0 2 * * * cp /home/ubuntu/kyro-chat/data/kyro.db /home/ubuntu/kyro-chat/backups/kyro-\$(date +\%Y\%m\%d).db" | crontab -
```

### Monitor disk/memory
```bash
pm2 monit
```

---

## Supabase Setup (Optional)

If using Supabase for auth:

1. Create a Supabase project at supabase.com
2. In the SQL editor, run the schema from `apps/api/src/db/init.ts` (or let the app auto-migrate)
3. Enable Email auth in Authentication → Providers
4. Copy URL and keys to `.env`
5. The frontend reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_KEY` | Yes | 64-char hex key for encrypting API keys |
| `FRONTEND_URL` | Yes | Your public URL (https://yourdomain.com) |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `OPENAI_API_KEY` | One required | OpenAI API key |
| `ANTHROPIC_API_KEY` | One required | Anthropic API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | One required | Google AI API key |
| `E2B_API_KEY` | No | E2B sandbox API key |
| `VNC_PASSWORD` | No | Browser VNC password |

---

## Troubleshooting

**API won't start**: Check `pm2 logs kyro-api` — usually missing ENCRYPTION_KEY or DB not initialized.

**SSE streaming breaks**: Ensure nginx has `proxy_buffering off` and `proxy_read_timeout 300s` on `/api/`.

**VNC won't connect**: Check Docker is running, port 6901 is not publicly exposed, and the path token format is correct.

**Build fails**: Run `npm run build` in both `apps/api` and `apps/web` separately to isolate errors.
