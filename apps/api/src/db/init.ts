import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

let pgPool: Pool | null = null;

function getPgPoolWrapper(): Pool {
  if (!pgPool) {
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
        process.exit(1);
      });
  }
  return pgPool;
}

export function getDb() {
  const pool = getPgPoolWrapper();
  return {
    prepare: (sql: string) => {
      // Convert SQLite ? to Postgres $1, $2, etc.
      let i = 1;
      const pgSql = sql.replace(/\?/g, () => `$${i++}`);
      
      return {
        get: async (...args: any[]) => {
          const res = await pool.query(pgSql, args);
          return res.rows[0];
        },
        all: async (...args: any[]) => {
          const res = await pool.query(pgSql, args);
          return res.rows;
        },
        run: async (...args: any[]) => {
          await pool.query(pgSql, args);
          return { changes: 1 };
        }
      };
    }
  };
}

export async function initDb() {
  try {
    console.log('🐘 PostgreSQL database initialization starting...');
    const pool = getPgPoolWrapper();

    // Enable pgvector
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        model TEXT,
        project_id TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        starred INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0
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
        is_sub_agent INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        agent_id TEXT,
        source_file TEXT,
        content TEXT NOT NULL,
        embedding vector(384),
        metadata TEXT,
        chunk_index INTEGER,
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
        custom_instructions TEXT,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
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

      CREATE TABLE IF NOT EXISTS custom_apis (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_encrypted TEXT
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
      
      CREATE TABLE IF NOT EXISTS browser_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        container_id TEXT NOT NULL,
        vnc_port INTEGER,
        novnc_port INTEGER,
        password TEXT,
        persistent INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        encrypted_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT,
        custom_model TEXT,
        is_valid INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000),
        expires_at INTEGER,
        last_used_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS usage_tracking (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        usage_count INTEGER DEFAULT 1,
        date TEXT,
        messages INTEGER DEFAULT 0,
        tokens INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        browser_minutes INTEGER DEFAULT 0,
        period_start INTEGER,
        period_end INTEGER,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)
      );

      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT,
        content TEXT NOT NULL,
        embedding vector(384)
      );

      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT,
        cron_expr TEXT,
        last_run INTEGER
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT,
        tool_type TEXT,
        granted INTEGER
      );

      CREATE TABLE IF NOT EXISTS tool_permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        source TEXT,
        permission TEXT,
        UNIQUE(tool_name, source, user_id)
      );

      CREATE TABLE IF NOT EXISTS agent_kb_permissions (
        kb_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        permission TEXT,
        PRIMARY KEY (kb_id, agent_id)
      );
    `);

    // ── Migrations for existing tables ────────────────────────────────────
    const migrations = [
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS base_url TEXT`,
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS custom_model TEXT`,
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_valid INTEGER DEFAULT 1`,
      `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS updated_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW) * 1000)`,
    ];
    for (const sql of migrations) {
      await pool.query(sql).catch(() => {});
    }

    console.log('✅ PostgreSQL database schema created successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ PostgreSQL database initialization failed:', error);
    throw error;
  }
}

export function getPgPool(): Pool {
  return getPgPoolWrapper();
}

export function isPostgreSQLAvailable(): boolean {
  return pgPool !== null;
}
