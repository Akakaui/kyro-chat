#!/bin/bash
set -e

echo "🔧 Setting up Kyro Chat development environment..."

# Start PostgreSQL
sudo service postgresql start
sleep 2

# Start Redis
sudo service redis-server start

# Setup PostgreSQL
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'password';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE chatbot;" 2>/dev/null || true
sudo -u postgres psql -d chatbot -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# Install pgvector if not available
if ! sudo -u postgres psql -d chatbot -c "SELECT 1 FROM pg_extension WHERE extname='vector'" 2>/dev/null | grep -q 1; then
  echo "📦 Installing pgvector..."
  sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-16-pgvector 2>/dev/null || true
  sudo -u postgres psql -d chatbot -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
fi

# Install pnpm if needed
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@latest
fi

# Install dependencies
cd /workspaces/kyro-chat
pnpm install 2>/dev/null || pnpm install --force
pnpm approve-builds better-sqlite3 esbuild sharp 2>/dev/null || true

# Fix timestamp defaults for PostgreSQL compatibility
sed -i 's/EXTRACT(EPOCH FROM NOW) \* 1000/0/g' apps/api/src/db/init.ts 2>/dev/null || true

# Initialize database
export POSTGRES_URL=postgresql://postgres:password@localhost:5432/chatbot
npx tsx apps/api/src/db/init.ts 2>/dev/null || true

# Fix scheduled_tasks table
sudo -u postgres psql -d chatbot -c "
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'one_time',
  cron_expression TEXT,
  cron_expr TEXT,
  scheduled_at INTEGER,
  last_run INTEGER,
  payload TEXT,
  project_id TEXT,
  permission_override INTEGER DEFAULT 0,
  email_notification INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  next_run INTEGER
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(user_id, role_id)
);
" 2>/dev/null || true

# Create .env
cat > .env << 'ENVEOF'
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
POSTGRES_URL=postgresql://postgres:password@localhost:5432/chatbot
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
E2B_API_KEY=
API_KEY_ENCRYPTION_KEY=fc384a15784ce45ceb55f16fd0deac6a3ba3f147038e523c5c2a97286280fa33
ENCRYPTION_KEY=fc384a15784ce45ceb55f16fd0deac6a3ba3f147038e523c5c2a97286280fa33
REDIS_URL=redis://localhost:6379
ENVEOF

# Start API server
export POSTGRES_URL=postgresql://postgres:password@localhost:5432/chatbot
export REDIS_URL=redis://localhost:6379
export API_KEY_ENCRYPTION_KEY=fc384a15784ce45ceb55f16fd0deac6a3ba3f147038e523c5c2a97286280fa33
export ENCRYPTION_KEY=fc384a15784ce45ceb55f16fd0deac6a3ba3f147038e523c5c2a97286280fa33
export PORT=3001
export FRONTEND_URL=http://localhost:3000
nohup npx tsx apps/api/src/server.ts > /tmp/api.log 2>&1 &
echo "API starting on port 3001..."

# Wait for API
sleep 5

# Start Web server
export NEXT_PUBLIC_API_URL=http://localhost:3001
cd apps/web
nohup npx next dev --port 3000 > /tmp/web.log 2>&1 &
echo "Web starting on port 3000..."

sleep 5

echo ""
echo "✅ Kyro Chat is ready!"
echo "   Web UI:  http://localhost:3000"
echo "   API:     http://localhost:3001"
echo ""
