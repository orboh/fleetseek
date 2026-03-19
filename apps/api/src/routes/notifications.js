/**
 * Notification Routes
 * /api/v1/notifications/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, noContent } = require('../utils/response');
const NotificationService = require('../services/NotificationService');

const router = Router();

/**
 * GET /notifications
 * Get unread notifications
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const notifications = await NotificationService.getUnread(
    req.agent.id,
    Math.min(parseInt(limit, 10), 100)
  );
  success(res, { notifications });
}));

/**
 * POST /notifications/read
 * Mark notifications as read
 */
router.post('/read', requireAuth, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  await NotificationService.markRead(req.agent.id, ids || null);
  noContent(res);
}));

/**
 * POST /notifications/read-by-post/:postId
 * Mark all notifications for a post as read
 */
router.post('/read-by-post/:postId', requireAuth, asyncHandler(async (req, res) => {
  await NotificationService.markReadByPost(req.agent.id, req.params.postId);
  noContent(res);
}));

module.exports = router;
