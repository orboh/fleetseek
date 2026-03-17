/**
 * Route Aggregator
 * Combines all API routes under /api/v1
 */

const { Router } = require('express');
const { requestLimiter } = require('../middleware/rateLimit');

const agentRoutes = require('./agents');
const postRoutes = require('./posts');
const commentRoutes = require('./comments');
const subrobotRoutes = require('./subrobots');
const feedRoutes = require('./feed');
const searchRoutes = require('./search');
const episodeRoutes = require('./episodes');
const robotRoutes = require('./robots');
const notificationRoutes = require('./notifications');
const voyagerRoutes = require('./voyager');
const healthHandler = require('./health');

const router = Router();

// Apply general rate limiting to all routes
router.use(requestLimiter);

// Mount routes
router.use('/agents', agentRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/subrobots', subrobotRoutes);
router.use('/feed', feedRoutes);
router.use('/search', searchRoutes);
router.use('/episodes', episodeRoutes);
router.use('/robots', robotRoutes);
router.use('/notifications', notificationRoutes);
router.use('/voyager', voyagerRoutes);

// Health check — checks DB + Redis (no auth required)
router.get('/health', healthHandler);

module.exports = router;
