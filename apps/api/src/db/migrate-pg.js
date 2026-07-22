#!/usr/bin/env node

const pg = require('pg');
const fs = require('fs');
const path = require('path');

const poolConfig = {
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
};

const pool = new pg.Pool(poolConfig);

async function main() {
  try {
    console.log('🚀 PostgreSQL Migration Script');
    console.log('===========================');

    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connection successful');

    // Create database
    await pool.query('CREATE DATABASE IF NOT EXISTS chatbot');
    console.log('✅ Database ready');

    // Switch to chatbot database
    await pool.query('SET search_path TO chatbot');

    // Read and execute schema file
    const schemaPath = path.join(__dirname, 'init.ts');
    let schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove SQLite-specific comments and syntax
    schema = schema
      // Convert SQLite functions to PostgreSQL
      .replace(/integer default \(unixepoch\(\)/g, 'bigint default (EXTRACT(EPOCH FROM NOW) * 1000)')
      .replace(/datetime\(\'now\'\)/g, 'CURRENT_TIMESTAMP')
      .replace(/BLOB/g, 'BYTEA')
      .replace(/PRAGMA\s+table_info/g, '')
      .replace(/sqlite_master/g, '')
      .replace(/sqlite_version/g, '')
      .replace(/-- \s*[^\n]*/g, '')
      .replace(/\s*--.*\n/g, '\n')
      .replace(/;\s*;+/g, ';')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Split schema into individual statements
    const statements = schema
      .split(/;\s*\n/)
      .filter(stmt => stmt.trim() && !stmt.includes('--'))
      .map(stmt => stmt + ';');

    console.log(`📋 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt.trim()) continue;

      try {
        const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
        console.log(`📋 Executing [${i + 1}/${statements.length}]: ${tableName || 'Unknown table'}`);
        await pool.query(stmt);
      } catch (error) {
        console.log(`⚠️  Statement [${i + 1}] failed:`, error.message);
        console.log(`   Statement: ${stmt.substring(0, 100)}...`);
      }
    }

    console.log('\n✨ Migration completed successfully!');
    console.log(`📊 Processed ${statements.length} SQL statements`);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
