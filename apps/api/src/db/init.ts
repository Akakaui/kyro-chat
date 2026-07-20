import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb() {
  const db = getDb();

  db.exec(`
    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT,
      agent_id TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Agents table
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('primary', 'sub', 'both')),
      description TEXT,
      system_prompt TEXT,
      model TEXT,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 4096,
      skills TEXT,
      permissions TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Knowledge Base chunks
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      source_file TEXT,
      content TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Skills
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      is_builtin INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Artifacts
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('html', 'pdf', 'markdown', 'code')),
      title TEXT,
      content TEXT NOT NULL,
      share_hash TEXT UNIQUE,
      share_expires_at INTEGER,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    -- Scheduled Tasks
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Sandbox sessions
    CREATE TABLE IF NOT EXISTS sandbox_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      container_id TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    -- Memory entries
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'context', 'event')),
      content TEXT NOT NULL,
      embedding BLOB,
      importance REAL DEFAULT 0.5,
      created_at INTEGER DEFAULT (unixepoch()),
      last_accessed_at INTEGER
    );

    -- MCP Connections
    CREATE TABLE IF NOT EXISTS mcp_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'none' CHECK(auth_type IN ('none', 'oauth', 'api_key', 'bearer')),
      access_token TEXT,
      api_key TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected',
      tools_json TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Email logs
    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
      to_address TEXT,
      from_address TEXT,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Model usage tracking (per user, per model, per 4hr window)
    CREATE TABLE IF NOT EXISTS model_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      tokens_limit INTEGER NOT NULL,
      window_start INTEGER NOT NULL,
      window_end INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Sub-agent chats (nested under parent conversations)
    CREATE TABLE IF NOT EXISTS sub_agent_chats (
      id TEXT PRIMARY KEY,
      parent_conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      title TEXT,
      model TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (parent_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Sandbox duration preferences
    CREATE TABLE IF NOT EXISTS sandbox_durations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      duration_hours INTEGER DEFAULT 24,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Custom API connectors
    CREATE TABLE IF NOT EXISTS custom_apis (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT,
      api_key_encrypted TEXT,
      base_url TEXT,
      endpoints TEXT,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'discovering', 'ready', 'error')),
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Per-tool permissions
    CREATE TABLE IF NOT EXISTS tool_permissions (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('builtin', 'mcp', 'custom_api')),
      permission TEXT NOT NULL DEFAULT 'ask' CHECK(permission IN ('allow', 'ask', 'deny')),
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(tool_name, source, user_id)
    );

    -- Global permission defaults
    CREATE TABLE IF NOT EXISTS tool_permission_globals (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK(source_type IN ('builtin', 'mcp', 'custom_api')),
      permission TEXT NOT NULL DEFAULT 'ask' CHECK(permission IN ('allow', 'ask', 'deny')),
      user_id TEXT NOT NULL,
      UNIQUE(source_type, user_id)
    );

    -- API Keys (encrypted provider keys)
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      name TEXT,
      encrypted_key TEXT NOT NULL,
      is_valid INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      last_used_at INTEGER
    );

    -- Index on api_keys
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

    -- Projects (lightweight containers)
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Agent-KB permission mapping
    CREATE TABLE IF NOT EXISTS agent_kb_permissions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kb_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'deny' CHECK(permission IN ('allow', 'ask', 'deny')),
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(agent_id, kb_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_user ON kb_chunks(user_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_user ON memory_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_connections_user ON mcp_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_share_hash ON artifacts(share_hash);
    CREATE INDEX IF NOT EXISTS idx_model_usage_user ON model_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_model_usage_window ON model_usage(user_id, model_id, window_start);
    CREATE INDEX IF NOT EXISTS idx_sub_agent_chats_parent ON sub_agent_chats(parent_conversation_id);
    CREATE INDEX IF NOT EXISTS idx_sandbox_durations_user ON sandbox_durations(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_kb_permissions_agent ON agent_kb_permissions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_kb_permissions_kb ON agent_kb_permissions(kb_id);
  `);

  // ---------- Migration: add project_id to conversations ----------
  const convCols = db.prepare(`PRAGMA table_info(conversations)`).all() as any[];
  const convColNames = new Set(convCols.map((c: any) => c.name));
  if (!convColNames.has('project_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN project_id TEXT REFERENCES projects(id)`);
  }

  // ---------- Migration: add project_id to kb_chunks ----------
  const kbCols = db.prepare(`PRAGMA table_info(kb_chunks)`).all() as any[];
  const kbColNames = new Set(kbCols.map((c: any) => c.name));
  if (!kbColNames.has('project_id')) {
    db.exec(`ALTER TABLE kb_chunks ADD COLUMN project_id TEXT REFERENCES projects(id)`);
  }

  // ---------- Migration: add kb_id to kb_chunks for KB grouping ----------
  if (!kbColNames.has('kb_id')) {
    db.exec(`ALTER TABLE kb_chunks ADD COLUMN kb_id TEXT`);
  }

  // ---------- Migration: add starred + archived columns to conversations ----------
  if (!convColNames.has('starred')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN starred INTEGER DEFAULT 0`);
  }
  if (!convColNames.has('archived')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN archived INTEGER DEFAULT 0`);
  }

  // ---------- Migration: add chunk_index to kb_chunks ----------
  if (!kbColNames.has('chunk_index')) {
    db.exec(`ALTER TABLE kb_chunks ADD COLUMN chunk_index INTEGER DEFAULT 0`);
  }

  // ---------- Migration: add E2B columns to artifacts ----------
  const artifactCols = db.prepare(`PRAGMA table_info(artifacts)`).all() as any[];
  const existingCols = new Set(artifactCols.map((c: any) => c.name));

  if (!existingCols.has('sandbox_id')) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN sandbox_id TEXT`);
  }
  if (!existingCols.has('share_url')) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN share_url TEXT`);
  }
  if (!existingCols.has('sandbox_expires_at')) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN sandbox_expires_at INTEGER`);
  }

  // ---------- Migration: add e2b_id to sandbox_sessions ----------
  const sandboxCols = db.prepare(`PRAGMA table_info(sandbox_sessions)`).all() as any[];
  const sandboxColNames = new Set(sandboxCols.map((c: any) => c.name));
  if (!sandboxColNames.has('e2b_id')) {
    db.exec(`ALTER TABLE sandbox_sessions ADD COLUMN e2b_id TEXT`);
  }
  if (!sandboxColNames.has('template')) {
    db.exec(`ALTER TABLE sandbox_sessions ADD COLUMN template TEXT DEFAULT 'node'`);
  }

  // ---------- Migration: MCP Connector full config columns ----------
  const mcpCols = db.prepare(`PRAGMA table_info(mcp_connections)`).all() as any[];
  const mcpColNames = new Set(mcpCols.map((c: any) => c.name));
  if (!mcpColNames.has('transport_mode')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN transport_mode TEXT DEFAULT 'remote'`);
  }
  if (!mcpColNames.has('timeout')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN timeout INTEGER DEFAULT 5000`);
  }
  if (!mcpColNames.has('headers')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN headers TEXT`);
  }
  if (!mcpColNames.has('oauth_client_id')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN oauth_client_id TEXT`);
  }
  if (!mcpColNames.has('oauth_client_secret')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN oauth_client_secret TEXT`);
  }
  if (!mcpColNames.has('oauth_scopes')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN oauth_scopes TEXT`);
  }
  if (!mcpColNames.has('oauth_redirect_uri')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN oauth_redirect_uri TEXT`);
  }
  if (!mcpColNames.has('env_vars')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN env_vars TEXT`);
  }
  if (!mcpColNames.has('enabled')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN enabled INTEGER DEFAULT 1`);
  }
  if (!mcpColNames.has('config_json')) {
    db.exec(`ALTER TABLE mcp_connections ADD COLUMN config_json TEXT`);
  }

  // ---------- Gap 6: Generated images table ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      message_id TEXT,
      provider TEXT NOT NULL,
      model TEXT,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL,
      size TEXT DEFAULT '1024x1024',
      revised_prompt TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generated_images_user ON generated_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_generated_images_conversation ON generated_images(conversation_id);
  `);

  // ---------- Gap 7: Subscriptions table ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'pro', 'enterprise')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'canceled', 'past_due', 'trialing')),
      current_period_start INTEGER,
      current_period_end INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  `);

  // ---------- Gap 7: Usage tracking table ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      period_start INTEGER,
      period_end INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_tracking(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_tracking(period_start, period_end);
  `);

  console.log('Database initialized successfully');
}

// Run directly
if (process.argv[1] && process.argv[1].includes('init')) {
  initDb();
}
