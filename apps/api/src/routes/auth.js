/**
 * Auth Routes — X (Twitter) OAuth
 * POST /auth/x — exchange X access token for a FleetSeek API key
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');
const AgentService = require('../services/AgentService');
const { BadRequestError, UnauthorizedError } = require('../utils/errors');

const router = Router();

router.post('/x', asyncHandler(async (req, res) => {
  const { access_token } = req.body;

  if (!access_token || typeof access_token !== 'string') {
    throw new BadRequestError('access_token is required');
  }

  const xRes = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url',
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!xRes.ok) {
    throw new UnauthorizedError('Invalid X access token');
  }

  const { data: xUser } = await xRes.json();

  const { apiKey, agent } = await AgentService.findOrCreateByTwitterId({
    twitterId: xUser.id,
    twitterHandle: xUser.username,
    displayName: xUser.name,
    avatarUrl: xUser.profile_image_url ?? null,
  });

  success(res, { api_key: apiKey, agent });
}));

module.exports = router;
