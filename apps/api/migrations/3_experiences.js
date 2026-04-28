/**
 * Migration 3: Experiences schema
 * Wraps apps/api/scripts/004_experiences.sql — experiences table,
 * config_snapshots, experience_applications, and pgvector extension.
 *
 * The SQL file is created separately as part of the Experience data model
 * (SkillExperience / DebugExperience with applicability, provenance,
 * trust_signals, and vector embedding columns).
 *
 * Down is a no-op: rollback not supported in MVP-α.
 */

const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '../scripts/004_experiences.sql');

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  if (!fs.existsSync(sqlPath)) {
    // 004_experiences.sql not yet written — skip gracefully
    console.warn('[migration 3] 004_experiences.sql not found, skipping.');
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  await pgm.db.query(sql);
};

/** @param {import('node-pg-migrate').MigrationBuilder} _pgm */
exports.down = async (_pgm) => {
  // Rollback not supported in MVP-α — no-op
};
