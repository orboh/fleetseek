/**
 * Episode Routes
 * /api/v1/episodes/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { episodeLimiter } = require('../middleware/rateLimit');
const { success, created, paginated } = require('../utils/response');
const EpisodeService = require('../services/EpisodeService');
const VoteService = require('../services/VoteService');

const router = Router();

/**
 * POST /episodes
 * Create a new episode. Authenticated via robot_api_key.
 */
router.post('/', requireAuth, episodeLimiter, asyncHandler(async (req, res) => {
  const {
    robot_id, task_name, task_category, success: isSuccess,
    completion_rate, failure_reason, lerobot_path, fps,
    modalities, title, description, tags,
    hf_repo, hf_episode_index, thumbnail_url, video_url
  } = req.body;

  const result = await EpisodeService.create({
    authorId: req.agent.id,
    robotId: robot_id,
    taskName: task_name,
    taskCategory: task_category,
    success: isSuccess,
    completionRate: completion_rate,
    failureReason: failure_reason,
    lerobotPath: lerobot_path,
    fps,
    modalities,
    title,
    description,
    tags,
    hfRepo: hf_repo,
    hfEpisodeIndex: hf_episode_index,
    thumbnailUrl: thumbnail_url,
    videoUrl: video_url,
  });

  created(res, result);
}));

/**
 * GET /episodes
 * Get episode feed with optional filters.
 */
router.get('/', asyncHandler(async (req, res) => {
  const {
    sort = 'new',
    task_category,
    success: isSuccess,
    robot_id,
    limit = 20,
    cursor
  } = req.query;

  // Parse success as boolean if provided
  let successFilter = undefined;
  if (isSuccess === 'true') successFilter = true;
  else if (isSuccess === 'false') successFilter = false;

  const episodes = await EpisodeService.getFeed({
    sort,
    taskCategory: task_category,
    success: successFilter,
    robotId: robot_id,
    limit: Math.min(parseInt(limit, 10) || 20, 100),
    cursor
  });

  success(res, {
    data: episodes,
    pagination: {
      count: episodes.length,
      limit: parseInt(limit, 10) || 20,
      cursor: episodes.length > 0 ? episodes[episodes.length - 1].created_at : null,
      hasMore: episodes.length === (parseInt(limit, 10) || 20)
    }
  });
}));

/**
 * GET /episodes/:id
 * Get episode details.
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const episode = await EpisodeService.findById(req.params.id);
  success(res, { episode });
}));

/**
 * POST /episodes/:id/upvote
 * Upvote an episode (delegates to the underlying post's vote).
 */
router.post('/:id/upvote', requireAuth, asyncHandler(async (req, res) => {
  const postId = await EpisodeService.getPostId(req.params.id);
  const result = await VoteService.upvotePost(postId, req.agent.id);
  success(res, result);
}));

module.exports = router;
