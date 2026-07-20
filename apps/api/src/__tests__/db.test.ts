import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// We use a fresh in-memory DB for each test to avoid UNIQUE constraint issues.

function createFreshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function runInitSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      project_id TEXT REFERENCES projects(id),
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
      created_at INTEGER DEFAULT (unixepoch()),
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
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      source_file TEXT,
      content TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      project_id TEXT REFERENCES projects(id),
      kb_id TEXT,
      chunk_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createFreshDb();
    runInitSchema(db);
  });

  describe('core tables', () => {
    it('should create conversations table with all required columns', () => {
      const cols = db.prepare('PRAGMA table_info(conversations)').all() as any[];
      const names = new Set(cols.map((c: any) => c.name));
      expect(names.has('id')).toBe(true);
      expect(names.has('user_id')).toBe(true);
      expect(names.has('title')).toBe(true);
      expect(names.has('model')).toBe(true);
      expect(names.has('created_at')).toBe(true);
      expect(names.has('updated_at')).toBe(true);
      expect(names.has('project_id')).toBe(true);
    });

    it('should create messages table with all required columns', () => {
      const cols = db.prepare('PRAGMA table_info(messages)').all() as any[];
      const names = new Set(cols.map((c: any) => c.name));
      expect(names.has('id')).toBe(true);
      expect(names.has('conversation_id')).toBe(true);
      expect(names.has('role')).toBe(true);
      expect(names.has('content')).toBe(true);
      expect(names.has('agent_id')).toBe(true);
    });

    it('should create agents table', () => {
      const cols = db.prepare('PRAGMA table_info(agents)').all() as any[];
      const names = new Set(cols.map((c: any) => c.name));
      expect(names.has('id')).toBe(true);
      expect(names.has('name')).toBe(true);
      expect(names.has('type')).toBe(true);
      expect(names.has('system_prompt')).toBe(true);
    });

    it('should create kb_chunks table', () => {
      const cols = db.prepare('PRAGMA table_info(kb_chunks)').all() as any[];
      const names = new Set(cols.map((c: any) => c.name));
      expect(names.has('id')).toBe(true);
      expect(names.has('content')).toBe(true);
      expect(names.has('embedding')).toBe(true);
    });

    it('should create projects table', () => {
      const cols = db.prepare('PRAGMA table_info(projects)').all() as any[];
      const names = new Set(cols.map((c: any) => c.name));
      expect(names.has('id')).toBe(true);
      expect(names.has('name')).toBe(true);
      expect(names.has('user_id')).toBe(true);
    });
  });

  describe('migration columns (starred, archived, chunk_index)', () => {
    it('should have starred column on conversations with default 0', () => {
      const cols = db.prepare('PRAGMA table_info(conversations)').all() as any[];
      const col = cols.find((c: any) => c.name === 'starred');
      expect(col).toBeDefined();
      expect(col.dflt_value).toBe('0');
    });

    it('should have archived column on conversations with default 0', () => {
      const cols = db.prepare('PRAGMA table_info(conversations)').all() as any[];
      const col = cols.find((c: any) => c.name === 'archived');
      expect(col).toBeDefined();
      expect(col.dflt_value).toBe('0');
    });

    it('should have chunk_index column on kb_chunks with default 0', () => {
      const cols = db.prepare('PRAGMA table_info(kb_chunks)').all() as any[];
      const col = cols.find((c: any) => c.name === 'chunk_index');
      expect(col).toBeDefined();
      expect(col.dflt_value).toBe('0');
    });

    it('should have kb_id column on kb_chunks', () => {
      const cols = db.prepare('PRAGMA table_info(kb_chunks)').all() as any[];
      const col = cols.find((c: any) => c.name === 'kb_id');
      expect(col).toBeDefined();
    });

    it('should have project_id column on kb_chunks', () => {
      const cols = db.prepare('PRAGMA table_info(kb_chunks)').all() as any[];
      const col = cols.find((c: any) => c.name === 'project_id');
      expect(col).toBeDefined();
    });
  });

  describe('foreign key constraints', () => {
    it('should enforce messages -> conversations FK with CASCADE', () => {
      const fks = db.prepare('PRAGMA foreign_key_list(messages)').all() as any[];
      expect(fks.length).toBeGreaterThan(0);
      const convFk = fks.find((fk: any) => fk.table === 'conversations');
      expect(convFk).toBeDefined();
      expect(convFk.on_delete).toBe('CASCADE');
    });
  });

  describe('role check constraint', () => {
    it('should accept valid roles (user, assistant, system, tool)', () => {
      for (const role of ['user', 'assistant', 'system', 'tool']) {
        // Fresh setup for each since we need to insert
        const localDb = createFreshDb();
        runInitSchema(localDb);
        localDb.exec("INSERT INTO conversations (id, user_id) VALUES ('c1', 'u1')");
        expect(() => {
          localDb.prepare(
            `INSERT INTO messages (id, conversation_id, role, content) VALUES ('m-${role}', 'c1', ?, 'hello')`
          ).run(role);
        }).not.toThrow();
        localDb.close();
      }
    });

    it('should reject invalid roles', () => {
      db.exec("INSERT INTO conversations (id, user_id) VALUES ('c2', 'u1')");
      expect(() => {
        db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES ('m1', 'c2', 'invalid_role', 'hello')").run();
      }).toThrow();
    });
  });

  describe('conversation CRUD', () => {
    it('should insert and retrieve a conversation', () => {
      db.prepare("INSERT INTO conversations (id, user_id, title, model) VALUES ('c3', 'u1', 'Test', 'gpt-4o')").run();
      const row = db.prepare("SELECT * FROM conversations WHERE id = 'c3'").get() as any;
      expect(row.title).toBe('Test');
      expect(row.model).toBe('gpt-4o');
    });

    it('should cascade delete messages when conversation is deleted', () => {
      db.prepare("INSERT INTO conversations (id, user_id, title) VALUES ('c4', 'u1', 'Test')").run();
      db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES ('m-c4', 'c4', 'user', 'hi')").run();
      // Verify message exists
      let msg = db.prepare("SELECT * FROM messages WHERE id = 'm-c4'").get();
      expect(msg).toBeDefined();
      // Delete conversation
      db.prepare("DELETE FROM conversations WHERE id = 'c4'").run();
      // Message should be cascade-deleted
      msg = db.prepare("SELECT * FROM messages WHERE id = 'm-c4'").get();
      expect(msg).toBeUndefined();
    });
  });
});