/**
 * Database migration script
 * Reads schema.sql and executes it against the database.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Connected successfully.');

    const migrations = [
      'schema.sql',
      '003_notifications.sql',
      '004_experiences.sql',
    ];

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${file} (not found)`);
        continue;
      }
      console.log(`Running ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await pool.query(sql);
      console.log(`  ${file} done.`);
    }
    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
