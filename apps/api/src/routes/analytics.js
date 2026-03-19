/**
 * Analytics Routes
 * /api/v1/analytics/*
 * Public read — no auth required.
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');
const AnalyticsService = require('../services/AnalyticsService');

const router = Router();

/**
 * GET /analytics/benchmarks?task_name=X&min_episodes=N
 * Returns ranked robot list for the given task.
 */
router.get('/benchmarks', asyncHandler(async (req, res) => {
  const taskName = req.query.task_name;
  const minEpisodes = req.query.min_episodes ? parseInt(req.query.min_episodes, 10) : 3;
  const data = await AnalyticsService.getBenchmarks({ taskName, minEpisodes });
  success(res, data);
}));

/**
 * GET /analytics/robots/compare?ids=uuid1,uuid2
 * Returns aggregate stats and top tasks for each robot.
 */
router.get('/robots/compare', asyncHandler(async (req, res) => {
  const ids = req.query.ids
    ? req.query.ids.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const data = await AnalyticsService.compareRobots(ids);
  success(res, data);
}));

/**
 * GET /analytics/trends?category=X&period=7d
 * Returns time-series episode data for a task category.
 */
router.get('/trends', asyncHandler(async (req, res) => {
  const { category, period } = req.query;
  const data = await AnalyticsService.getTrends({ category, period });
  success(res, data);
}));

module.exports = router;
