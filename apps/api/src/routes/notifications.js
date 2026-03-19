/**
 * Notification Routes
 * GET  /api/v1/notifications         - list notifications for authenticated agent
 * POST /api/v1/notifications/read-all - mark all notifications as read
 */

const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const NotificationService = require('../services/NotificationService');

// GET /api/v1/notifications
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await NotificationService.list({
      recipientId: req.agent.id,
      cursor: cursor || null,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/notifications/read-all
router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    const result = await NotificationService.markAllRead({ recipientId: req.agent.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
