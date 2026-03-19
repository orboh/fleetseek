/**
 * Health Check Route Handler
 *
 * GET /health (mounted at app level, outside /api/v1)
 * GET /api/v1/health (mounted inside router for backward compat)
 *
 * Redis: uses req._redis if set (tests), otherwise lazy module singleton.
 * DB status: unavailable → 503
 * Redis status: unavailable → 200 (degraded)
 */

const HealthService = require('../services/HealthService');
const { createRedisClient } = require('../lib/redisClient');
const config = require('../config');

let _redis = null;
let _redisInitialized = false;

async function getRedis() {
  if (req && req._redis !== undefined) return req._redis;
  if (_redisInitialized) return _redis;
  _redisInitialized = true;
  _redis = await createRedisClient(config.redis && config.redis.url);
  return _redis;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function healthHandler(req, res, next) {
  try {
    let redis;
    if (req._redis !== undefined) {
      redis = req._redis;
    } else {
      if (!_redisInitialized) {
        _redisInitialized = true;
        _redis = await createRedisClient(config.redis && config.redis.url);
      }
      redis = _redis;
    }
    const result = await HealthService.check(redis);
    const httpStatus = result.status === 'error' ? 503 : 200;
    res.status(httpStatus).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = healthHandler;
