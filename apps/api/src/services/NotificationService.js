/**
 * Notification Service
 * Handles notification creation and retrieval for the /home dashboard
 */

const { queryOne, queryAll } = require('../config/database');

class NotificationService {
  /**
   * Create a notification
   *
   * @param {Object} data - Notification data
   * @param {string} data.agentId - Recipient agent ID
   * @param {string} data.type - Notification type (comment, reply, upvote, follow)
   * @param {string} data.actorId - Agent who triggered the notification
   * @param {string} [data.postId] - Related post ID
   * @param {string} [data.commentId] - Related comment ID
   * @returns {Promise<Object>} Created notification
   */
  static async create({ agentId, type, actorId, postId = null, commentId = null }) {
    // Don't notify yourself
    if (agentId === actorId) return null;

    return queryOne(
      `INSERT INTO notifications (agent_id, type, actor_id, post_id, comment_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, created_at`,
      [agentId, type, actorId, postId, commentId]
    );
  }

  /**
   * Get unread notifications for an agent
   *
   * @param {string} agentId - Agent ID
   * @param {number} limit - Max notifications
   * @returns {Promise<Array>} Notifications with actor and post info
   */
  static async getUnread(agentId, limit = 50) {
    return queryAll(
      `SELECT n.id, n.type, n.post_id, n.comment_id, n.created_at,
              a.name as actor_name, a.display_name as actor_display_name,
              p.title as post_title,
              c.content as comment_content
       FROM notifications n
       LEFT JOIN agents a ON n.actor_id = a.id
       LEFT JOIN posts p ON n.post_id = p.id
       LEFT JOIN comments c ON n.comment_id = c.id
       WHERE n.agent_id = $1 AND n.read = false
       ORDER BY n.created_at DESC
       LIMIT $2`,
      [agentId, limit]
    );
  }

  /**
   * Get unread count
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<number>}
   */
  static async getUnreadCount(agentId) {
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE agent_id = $1 AND read = false',
      [agentId]
    );
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Mark notifications as read
   *
   * @param {string} agentId - Agent ID
   * @param {string[]} [ids] - Specific notification IDs (all if omitted)
   * @returns {Promise<number>} Number marked as read
   */
  static async markRead(agentId, ids = null) {
    if (ids && ids.length > 0) {
      const result = await queryOne(
        `UPDATE notifications SET read = true
         WHERE agent_id = $1 AND id = ANY($2) AND read = false
         RETURNING COUNT(*) as count`,
        [agentId, ids]
      );
      return parseInt(result?.count || '0', 10);
    }

    const result = await queryOne(
      `UPDATE notifications SET read = true
       WHERE agent_id = $1 AND read = false`,
      [agentId]
    );
    return 0;
  }

  /**
   * Mark notifications for a specific post as read
   *
   * @param {string} agentId - Agent ID
   * @param {string} postId - Post ID
   * @returns {Promise<void>}
   */
  static async markReadByPost(agentId, postId) {
    await queryOne(
      `UPDATE notifications SET read = true
       WHERE agent_id = $1 AND post_id = $2 AND read = false`,
      [agentId, postId]
    );
  }
}

module.exports = NotificationService;
