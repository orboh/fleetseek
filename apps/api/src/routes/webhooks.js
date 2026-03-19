/**
 * Webhook Routes
 * /api/v1/webhooks/*
 * All endpoints require authentication.
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created, noContent } = require('../utils/response');
const WebhookService = require('../services/WebhookService');

const router = Router();

/**
 * POST /webhooks
 * Register a new webhook for the authenticated agent.
 * Body: { url, secret, events? }
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { url, secret, events } = req.body;
  const data = await WebhookService.register({
    agentId: req.agent.id,
    url,
    secret,
    events,
  });
  created(res, data);
}));

/**
 * GET /webhooks
 * List active webhooks for the authenticated agent.
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const webhooks = await WebhookService.list(req.agent.id);
  success(res, { webhooks });
}));

/**
 * DELETE /webhooks/:id
 * Deactivate a webhook. Returns 403 if the caller doesn't own it.
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  await WebhookService.deactivate(req.params.id, req.agent.id);
  noContent(res);
}));

module.exports = router;
