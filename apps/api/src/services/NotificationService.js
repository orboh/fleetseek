/**
 * Notification Service
 * Handles creation, listing, and read-marking of notifications
 */

const { queryOne, queryAll } = require('../config/database');

/**
 * Map a DB notification row to a camelCase JS object
 * @param {Object} row
 * @returns {Object}
 */
function mapRow(row) {
  return {
    id: row.id,
    type: row.type,
    refId: row.ref_id,
    refType: row.ref_type,
    read: row.read_at !== null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    actorName: row.actor_name,
    actorDisplayName: row.actor_display_name,
  };
}

class NotificationService {
  /**
   * Create a notification.
   * Skips self-notifications (when recipientId === actorId).
   *
   * @param {Object} params
   * @param {string} params.recipientId
   * @param {string} params.actorId
   * @param {string} params.type  - 'upvote' | 'comment' | 'follow'
   * @param {string|null} params.refId
   * @param {string|null} params.refType - 'episode' | 'comment' | 'robot'
   * @returns {Promise<Object|null>}
   */
  static async create({ recipientId, actorId, type, refId = null, refType = null }) {
    if (recipientId === actorId) return null;

    const row = await queryOne(
      `INSERT INTO notifications (recipient_id, actor_id, type, ref_id, ref_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, recipient_id, actor_id, type, ref_id, ref_type, read_at, created_at`,
      [recipientId, actorId, type, refId, refType]
    );

    return row;
  }

  /**
   * Same as create() but swallows errors so it never breaks the caller.
   *
   * @param {Object} params
   * @returns {Promise<Object|null>}
   */
  static async createSafe(params) {
    try {
      return await NotificationService.create(params);
    } catch (e) {
      console.warn('NotificationService.createSafe error:', e.message);
      return null;
    }
  }

  /**
   * List notifications for a recipient with cursor-based pagination.
   *
   * @param {Object} params
   * @param {string} params.recipientId
   * @param {string|null} params.cursor  - ISO timestamp of the last seen notification
   * @param {number} params.limit
   * @returns {Promise<{ notifications: Object[], nextCursor: string|null, unreadCount: number }>}
   */
  static async list({ recipientId, cursor = null, limit = 20 }) {
    const fetchLimit = limit + 1;

    let rows;
    if (cursor) {
      rows = await queryAll(
        `SELECT n.id, n.type, n.ref_id, n.ref_type, n.read_at, n.created_at,
                a.name AS actor_name, a.display_name AS actor_display_name
         FROM notifications n
         JOIN agents a ON n.actor_id = a.id
         WHERE n.recipient_id = $1
           AND n.created_at < $2
         ORDER BY n.created_at DESC
         LIMIT $3`,
        [recipientId, cursor, fetchLimit]
      );
    } else {
      rows = await queryAll(
        `SELECT n.id, n.type, n.ref_id, n.ref_type, n.read_at, n.created_at,
                a.name AS actor_name, a.display_name AS actor_display_name
         FROM notifications n
         JOIN agents a ON n.actor_id = a.id
         WHERE n.recipient_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2`,
        [recipientId, fetchLimit]
      );
    }

    let nextCursor = null;
    if (rows.length > limit) {
      rows = rows.slice(0, limit);
      const lastRow = rows[rows.length - 1];
      nextCursor = lastRow.created_at instanceof Date
        ? lastRow.created_at.toISOString()
        : lastRow.created_at;
    }

    const unreadRow = await queryOne(
      `SELECT COUNT(*) FROM notifications
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [recipientId]
    );
    const unreadCount = unreadRow ? parseInt(unreadRow.count, 10) : 0;

    return {
      notifications: rows.map(mapRow),
      nextCursor,
      unreadCount,
    };
  }

  /**
   * Mark all unread notifications as read for a recipient.
   *
   * @param {Object} params
   * @param {string} params.recipientId
   * @returns {Promise<{ count: number }>}
   */
  static async markAllRead({ recipientId }) {
    const rows = await queryAll(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE recipient_id = $1 AND read_at IS NULL
       RETURNING id`,
      [recipientId]
    );

    return { count: rows.length };
  }
}

module.exports = NotificationService;
