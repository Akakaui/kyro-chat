import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || 'postgresql://postgres:password@localhost:5432/chatbot';
    pool = new Pool({
      connectionString,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
    });

    pool.query('SELECT 1')
      .then(() => console.log('✅ PostgreSQL connected successfully'))
      .catch((err: unknown) => {
        console.error('❌ PostgreSQL connection failed:', err);
        process.exit(1);
      });
  }
  return pool;
}

async function initDb() {
  try {
    console.log('🐘 PostgreSQL database initialization starting...');
    const pool = getPool();
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
    `);

    console.log('✅ PostgreSQL database schema created successfully');
  } catch (error) {
    console.error('❌ PostgreSQL database initialization failed:', error);
    throw error;
  }
}

export { getPool, initDb };
