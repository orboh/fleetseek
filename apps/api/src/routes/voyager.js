/**
 * Voyager Routes
 * /api/v1/voyager/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, noContent } = require('../utils/response');
const { BadRequestError } = require('../utils/errors');
const { createRedisClient } = require('../lib/redisClient');
const config = require('../config');
const VoyagerStatusService = require('../services/VoyagerStatusService');

const router = Router();

// Lazy Redis singleton for voyager status writes/reads
let _redis = null;
let _redisInitialized = false;

async function getRedis() {
  if (_redisInitialized) return _redis;
  _redisInitialized = true;
  _redis = await createRedisClient(config.redis && config.redis.url);
  return _redis;
}

/**
 * GET /voyager/status
 * Returns live status of all Voyager bots.
 * No auth required — read-only ops dashboard.
 */
router.get('/status', asyncHandler(async (req, res) => {
  const redis = await getRedis();
  const data = await VoyagerStatusService.getStatus(redis);
  success(res, data);
}));

/**
 * POST /voyager/heartbeat
 * Record a live heartbeat from a Voyager bot.
 * Requires robot API key authentication.
 */
router.post('/heartbeat', requireAuth, asyncHandler(async (req, res) => {
  const { robot_id, current_task, current_iteration, skills_count, mc_connected } = req.body;

  if (!robot_id) {
    throw new BadRequestError('robot_id is required');
  }

  const redis = await getRedis();
  await VoyagerStatusService.recordHeartbeat(redis, {
    robotId: robot_id,
    currentTask: current_task ?? null,
    currentIteration: current_iteration ?? null,
    skillsCount: skills_count ?? null,
    mcConnected: Boolean(mc_connected),
    reportedAt: new Date().toISOString(),
  });

  noContent(res);
}));

module.exports = router;
