import { Pool } from 'pg';
import { getDb as getSQLiteDb } from './init.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PostgreSQL connection configuration
const poolConfig = {
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
};

// PostgreSQL connection pool
const pool = new Pool(poolConfig);

export async function migrateToPostgreSQL() {
  try {
    console.log('🔄 Starting SQLite → PostgreSQL migration...');

    // Check if PostgreSQL is configured
    if (!process.env.POSTGRES_URL) {
      console.log('⚠️  POSTGRES_URL not set. Skipping PostgreSQL migration.');
      return { success: false, message: 'POSTGRES_URL not set' };
    }

    // Test PostgreSQL connection
    try {
      await pool.query('SELECT 1 as test');
      console.log('✅ PostgreSQL connection established');
    } catch (error: unknown) {
      console.log('❌ PostgreSQL connection failed:', error instanceof Error ? error.message : String(error));
      return { success: false, error: 'PostgreSQL connection failed' };
    }

    // Create database if it doesn't exist
    try {
      await pool.query('CREATE DATABASE IF NOT EXISTS chatbot');
      console.log('✅ Database created or verified');
    } catch (error: unknown) {
      console.log('❌ Failed to create database:', error instanceof Error ? error.message : String(error));
      return { success: false, error: 'Failed to create database' };
    }

    // Connect to the chatbot database
    const chatbotPool = new Pool({
      ...poolConfig,
      database: 'chatbot',
    });

    // Read SQLite schema
    const sqliteDb = getSQLiteDb();
    const schema = await getSQLiteSchema();

    // Apply schema to PostgreSQL
    for (const [tableName, createStatement] of Object.entries(schema)) {
      try {
        console.log(`📋 Creating table: ${tableName}`);
        await chatbotPool.query(createStatement);
        console.log(`✅ Table created: ${tableName}`);
      } catch (error: unknown) {
        console.log(`⚠️  Table already exists or failed to create ${tableName}:`, error instanceof Error ? error.message : String(error));
      }
    }

    await chatbotPool.end();
    await pool.end();

    console.log('\n🎉 Migration completed successfully!');
    return { success: true, message: 'Migration completed successfully' };
  } catch (error: unknown) {
    await pool.end();
    console.log('❌ Migration failed:', error instanceof Error ? error.message : String(error));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getSQLiteSchema(): Promise<Record<string, string>> {
  const db = getSQLiteDb();
  const schema: Record<string, string> = {};

  try {
    // Get all tables
    const tables = await db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    for (const table of tables) {
      try {
        const row: Record<string, unknown> | undefined = await db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table.name) as Record<string, unknown> | undefined;
        if (row && typeof row.sql === 'string') {
          schema[table.name] = row.sql;
        }
      } catch (error: unknown) {
        console.log(`⚠️  Failed to get schema for ${table.name}:`, error instanceof Error ? error.message : String(error));
      }
    }

    return schema;
  } catch (error: unknown) {
    console.log('❌ Failed to get SQLite schema:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}
