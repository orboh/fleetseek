/**
 * Migration 1: Initial schema
 * Wraps apps/api/scripts/schema.sql — agents, subrobots, posts, comments,
 * votes, subscriptions, follows, robots, episodes tables.
 *
 * Down is a no-op: rollback not supported in MVP-α.
 */

const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../scripts/schema.sql'),
  'utf-8'
);

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  await pgm.db.query(sql);
};

/** @param {import('node-pg-migrate').MigrationBuilder} _pgm */
exports.down = async (_pgm) => {
  // Rollback not supported in MVP-α — no-op
};
