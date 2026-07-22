import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/chatbot.db');

let db: any;
let pgPool: Pool | null = null;

let usePostgreSQLCache: boolean | null = null;

function usePostgreSQL(): boolean {
  if (usePostgreSQLCache !== null) return usePostgreSQLCache;
  usePostgreSQLCache = process.env.POSTGRES_URL !== undefined || 
         process.env.POSTGRES_HOST !== undefined ||
         process.env.USE_POSTGRES === 'true';
  return usePostgreSQLCache;
}

function getPgPoolWrapper(): Pool {
  if (!pgPool && usePostgreSQL()) {
    const poolConfig = {
      connectionString: process.env.POSTGRES_URL ||
        `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'chatbot'}${process.env.POSTGRES_SSL === 'true' ? '?ssl=true' : ''}`,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000'),
    };
    
    pgPool = new Pool(poolConfig);
    
    pgPool.query('SELECT 1')
      .then(() => console.log('✅ PostgreSQL connected successfully'))
      .catch((err: unknown) => {
        console.error('❌ PostgreSQL connection failed:', err);
        console.log('⚠️  Falling back to SQLite');
        pgPool = null;
      });
  }
  
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Set POSTGRES_URL or POSTGRES_HOST environment variables to use PostgreSQL');
  }
  
  return pgPool;
}

function getDb() {
  if (usePostgreSQL()) {
    return getPgPoolWrapper();
  } else {
    if (!db) {
      try {
        const Database = require('better-sqlite3');
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.log('💾 SQLite database initialized');
      } catch (error) {
        console.error('❌ Failed to initialize SQLite:', error);
        throw error;
      }
    }
    return db;
  }
}

async function initPgDb() {
  try {
    console.log('🐘 PostgreSQL database initialization starting...');
    const pool = getPgPoolWrapper();
    console.log('✅ PostgreSQL connection established');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        model TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT,
        agent_id TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

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
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT,
        source_file TEXT,
        content TEXT NOT NULL,
        embedding BYTEA,
        metadata TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

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
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS sub_agent_chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        conversation_id TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS mcp_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('mcp', 'api')),
        url TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('connected', 'disconnected')),
        auth_type TEXT,
        tools TEXT,
        description TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS sandbox_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sandbox_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'exited', 'failed')),
        sandbox_url TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        exited_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        expires_at INTEGER,
        last_used INTEGER
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('stripe', 'paypal')),
        subscription_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'past_due', 'canceled')),
        current_period_end INTEGER,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS usage_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        usage_count INTEGER DEFAULT 1,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('sent', 'draft', 'archived')),
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        sent_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS email_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('gmail', 'outlook', 'icloud')),
        status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS auth_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        attempt_time INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        success INTEGER NOT NULL CHECK(success IN (0, 1)),
        failure_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      -- RBAC tables
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT FALSE,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        PRIMARY KEY (role_id, permission)
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL,
        role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by TEXT,
        assigned_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        expires_at INTEGER,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        event_type TEXT NOT NULL,
        category TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        action TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_log_category ON audit_log(category);

      -- IP reputation tracking
      CREATE TABLE IF NOT EXISTS ip_reputation (
        ip_address TEXT PRIMARY KEY,
        score INTEGER DEFAULT 0,
        failed_attempts INTEGER DEFAULT 0,
        blocked_until INTEGER,
        last_seen INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );
    `);

    console.log('✅ PostgreSQL database schema created successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ PostgreSQL database initialization failed:', error);
    throw error;
  }
}

export function initDb() {
  if (usePostgreSQL()) {
    console.log('🐘 PostgreSQL initialization requested');
    return initPgDb().catch(err => {
      console.error('❌ PostgreSQL initialization failed:', err);
      console.log('⚠️  Falling back to SQLite');
    });
  } else {
    console.log('💾 SQLite initialization (legacy mode)');
    return Promise.resolve();
  }
}

/**
 * Get the PostgreSQL connection pool.
 * Throws an error if PostgreSQL is not configured.
 */
export function getPgPool(): Pool {
  if (!usePostgreSQL()) {
    throw new Error(
      'PostgreSQL is not configured. Set POSTGRES_URL or POSTGRES_HOST environment variables.'
    );
  }
  return getPgPoolWrapper();
}

/**
 * Check if PostgreSQL is available and connected.
 */
export function isPostgreSQLAvailable(): boolean {
  return usePostgreSQL() && pgPool !== null;
}

export { getDb };
