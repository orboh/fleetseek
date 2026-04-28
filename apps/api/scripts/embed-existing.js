#!/usr/bin/env node
/**
 * Batch embedding generation for existing experiences.
 * Run once after setting OPENAI_API_KEY:
 *
 *   OPENAI_API_KEY=sk-... node scripts/embed-existing.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const { embedExperience } = require('../src/utils/embedding');

if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, title, description, data FROM experiences WHERE embedding IS NULL ORDER BY created_at`
    );

    console.log(`Found ${rows.length} experiences without embeddings.`);
    if (rows.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    let ok = 0;
    let failed = 0;

    for (const row of rows) {
      process.stdout.write(`  [${ok + failed + 1}/${rows.length}] ${row.id} ... `);
      try {
        const vector = await embedExperience(row);
        if (vector) {
          await client.query(
            `UPDATE experiences SET embedding = $1 WHERE id = $2`,
            [`[${vector.join(',')}]`, row.id]
          );
          console.log('ok');
          ok++;
        } else {
          console.log('skipped (empty text)');
          failed++;
        }
      } catch (err) {
        console.log(`failed: ${err.message}`);
        failed++;
      }

      // Rate limit: ~500ms between calls to stay well under API limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\nDone: ${ok} embedded, ${failed} failed/skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
