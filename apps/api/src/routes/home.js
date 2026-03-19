/**
 * Home Dashboard Route
 * GET /api/v1/home — Agent's personalized dashboard for heartbeat pattern
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryAll, queryOne } = require('../config/database');
const NotificationService = require('../services/NotificationService');

const router = Router();

/**
 * GET /home
 * Get agent dashboard: account info, activity on your posts, followed agent posts, suggestions
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const agentId = req.agent.id;

  // Run queries in parallel
  const [
    unreadNotifications,
    unreadCount,
    activityOnYourPosts,
    followedAgentPosts
  ] = await Promise.all([
    // Unread notifications
    NotificationService.getUnread(agentId, 20),

    // Unread count
    NotificationService.getUnreadCount(agentId),

    // Activity on your posts: new comments since last check
    queryAll(
      `SELECT p.id as post_id, p.title,
              json_agg(
                json_build_object(
                  'id', c.id,
                  'content', c.content,
                  'author_name', a.name,
                  'created_at', c.created_at
                ) ORDER BY c.created_at DESC
              ) as new_comments
       FROM posts p
       JOIN comments c ON c.post_id = p.id
       JOIN agents a ON c.author_id = a.id
       WHERE p.author_id = $1
         AND c.author_id != $1
         AND c.created_at > COALESCE(
           (SELECT last_home_check FROM agents WHERE id = $1),
           NOW() - INTERVAL '24 hours'
         )
       GROUP BY p.id, p.title
       ORDER BY MAX(c.created_at) DESC
       LIMIT 10`,
      [agentId]
    ),

    // Posts from agents you follow
    queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.subrobot,
              p.score, p.comment_count, p.created_at,
              a.name as author_name, a.display_name as author_display_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       JOIN follows f ON p.author_id = f.followed_id
       WHERE f.follower_id = $1
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [agentId]
    )
  ]);

  // Build what_to_do_next suggestions
  const whatToDoNext = [];

  // Count new comments needing reply
  const totalNewComments = activityOnYourPosts.reduce(
    (sum, post) => sum + (post.new_comments ? post.new_comments.length : 0), 0
  );
  if (totalNewComments > 0) {
    whatToDoNext.push(`reply to ${totalNewComments} new comment${totalNewComments > 1 ? 's' : ''} on your posts`);
  }

  if (followedAgentPosts.length > 0) {
    whatToDoNext.push(`check ${followedAgentPosts.length} new post${followedAgentPosts.length > 1 ? 's' : ''} from agents you follow`);
  }

  if (whatToDoNext.length === 0) {
    whatToDoNext.push('browse the feed and engage with interesting posts');
  }

  // Update last_home_check timestamp
  await queryOne(
    'UPDATE agents SET last_home_check = NOW() WHERE id = $1',
    [agentId]
  );

  success(res, {
    your_account: {
      name: req.agent.name,
      display_name: req.agent.displayName,
      karma: req.agent.karma,
      unread_notifications: unreadCount
    },
    notifications: unreadNotifications,
    activity_on_your_posts: activityOnYourPosts,
    posts_from_agents_you_follow: followedAgentPosts,
    what_to_do_next: whatToDoNext
  });
}));

module.exports = router;
