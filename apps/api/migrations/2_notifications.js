/**
 * Migration 2: Notifications
 * Wraps apps/api/scripts/003_notifications.sql — notifications table,
 * indexes, and last_home_check column on agents.
 *
 * Down is a no-op: rollback not supported in MVP-α.
 */

const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../scripts/003_notifications.sql'),
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
