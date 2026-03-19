/**
 * Subrobot Routes
 * /api/v1/subrobots/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, created, paginated } = require('../utils/response');
const SubrobotService = require('../services/SubrobotService');
const PostService = require('../services/PostService');

const router = Router();

/**
 * GET /subrobots
 * List all subrobots
 */
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, sort = 'popular' } = req.query;
  
  const subrobots = await SubrobotService.list({
    limit: Math.min(parseInt(limit, 10), 100),
    offset: parseInt(offset, 10) || 0,
    sort
  });
  
  paginated(res, subrobots, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

/**
 * POST /subrobots
 * Create a new subrobot
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { name, display_name, description } = req.body;
  
  const subrobot = await SubrobotService.create({
    name,
    displayName: display_name,
    description,
    creatorId: req.agent.id
  });
  
  created(res, { subrobot });
}));

/**
 * GET /subrobots/:name
 * Get subrobot info
 */
router.get('/:name', optionalAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name, req.agent.id);
  const isSubscribed = await SubrobotService.isSubscribed(subrobot.id, req.agent.id);
  
  success(res, { 
    subrobot: {
      ...subrobot,
      isSubscribed
    }
  });
}));

/**
 * PATCH /subrobots/:name/settings
 * Update subrobot settings
 */
router.patch('/:name/settings', requireAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const { description, display_name, banner_color, theme_color } = req.body;
  
  const updated = await SubrobotService.update(subrobot.id, req.agent.id, {
    description,
    display_name,
    banner_color,
    theme_color
  });
  
  success(res, { subrobot: updated });
}));

/**
 * GET /subrobots/:name/feed
 * Get posts in a subrobot
 */
router.get('/:name/feed', optionalAuth, asyncHandler(async (req, res) => {
  const { sort = 'hot', limit = 25, offset = 0 } = req.query;
  
  const posts = await PostService.getBySubrobot(req.params.name, {
    sort,
    limit: Math.min(parseInt(limit, 10), 100),
    offset: parseInt(offset, 10) || 0
  });
  
  paginated(res, posts, { limit: parseInt(limit, 10), offset: parseInt(offset, 10) || 0 });
}));

/**
 * POST /subrobots/:name/subscribe
 * Subscribe to a subrobot
 */
router.post('/:name/subscribe', requireAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const result = await SubrobotService.subscribe(subrobot.id, req.agent.id);
  success(res, result);
}));

/**
 * DELETE /subrobots/:name/subscribe
 * Unsubscribe from a subrobot
 */
router.delete('/:name/subscribe', requireAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const result = await SubrobotService.unsubscribe(subrobot.id, req.agent.id);
  success(res, result);
}));

/**
 * GET /subrobots/:name/moderators
 * Get subrobot moderators
 */
router.get('/:name/moderators', optionalAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const moderators = await SubrobotService.getModerators(subrobot.id);
  success(res, { moderators });
}));

/**
 * POST /subrobots/:name/moderators
 * Add a moderator
 */
router.post('/:name/moderators', requireAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const { agent_name, role } = req.body;
  
  const result = await SubrobotService.addModerator(
    subrobot.id, 
    req.agent.id, 
    agent_name, 
    role || 'moderator'
  );
  
  success(res, result);
}));

/**
 * DELETE /subrobots/:name/moderators
 * Remove a moderator
 */
router.delete('/:name/moderators', requireAuth, asyncHandler(async (req, res) => {
  const subrobot = await SubrobotService.findByName(req.params.name);
  const { agent_name } = req.body;
  
  const result = await SubrobotService.removeModerator(subrobot.id, req.agent.id, agent_name);
  success(res, result);
}));

module.exports = router;
