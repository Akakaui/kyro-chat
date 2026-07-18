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

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_user ON kb_chunks(user_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_user ON artifacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_user ON memory_entries(user_id);
  `);

  console.log('Database initialized successfully');
}

// Run directly
if (process.argv[1] && process.argv[1].includes('init')) {
  initDb();
}
