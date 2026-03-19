/**
 * Rate limiting middleware
 *
 * Uses in-memory storage by default.
 * When REDIS_URL is set and reachable, uses Redis (sliding window via sorted sets)
 * for distributed deployments.  Falls back to in-memory on connection failure.
 */

const config = require('../config');
const { RateLimitError } = require('../utils/errors');

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------

const storage = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 3600000; // 1 hour
  for (const [key, entries] of storage.entries()) {
    const filtered = entries.filter(e => e.timestamp >= cutoff);
    if (filtered.length === 0) {
      storage.delete(key);
    } else {
      storage.set(key, filtered);
    }
  }
}, 300000).unref(); // unref so the interval doesn't keep the process alive in tests

// ---------------------------------------------------------------------------
// Redis client (lazy init)
// ---------------------------------------------------------------------------

/** @type {import('ioredis').Redis|null} */
let redisClient = null;
let redisInitialized = false;

async function ensureRedis() {
  if (redisInitialized) return;
  redisInitialized = true;
  const url = config.redis && config.redis.url;
  if (!url) return;
  const { createRedisClient } = require('../lib/redisClient');
  redisClient = await createRedisClient(url);
}

// ---------------------------------------------------------------------------
// Core rate-limit logic
// ---------------------------------------------------------------------------

/**
 * Check and consume a rate limit slot (in-memory).
 *
 * @param {string} key
 * @param {{ max: number, window: number }} limit  window in seconds
 * @returns {{ allowed: boolean, remaining: number, limit: number, resetAt: Date, retryAfter: number }}
 */
function checkLimit(key, limit) {
  const now = Date.now();
  const windowStart = now - (limit.window * 1000);

  let entries = storage.get(key) || [];
  entries = entries.filter(e => e.timestamp >= windowStart);

  const count = entries.length;
  const allowed = count < limit.max;
  const remaining = Math.max(0, limit.max - count - (allowed ? 1 : 0));

  let resetAt;
  let retryAfter = 0;

  if (entries.length > 0) {
    const oldest = Math.min(...entries.map(e => e.timestamp));
    resetAt = new Date(oldest + (limit.window * 1000));
    retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
  } else {
    resetAt = new Date(now + (limit.window * 1000));
  }

  if (allowed) {
    entries.push({ timestamp: now });
    storage.set(key, entries);
  }

  return {
    allowed,
    remaining,
    limit: limit.max,
    resetAt,
    retryAfter: allowed ? 0 : retryAfter,
  };
}

/**
 * Check and consume a rate limit slot (Redis, sliding window via sorted set).
 *
 * @param {string} key
 * @param {{ max: number, window: number }} limit
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, resetAt: Date, retryAfter: number }>}
 */
async function checkLimitRedis(key, limit) {
  const now = Date.now();
  const windowStart = now - (limit.window * 1000);
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, limit.window + 1);
  const results = await pipeline.exec();

  const count = results[2][1]; // ZCARD result
  const allowed = count <= limit.max;

  if (!allowed) {
    await redisClient.zrem(key, member);
  }

  const remaining = Math.max(0, limit.max - count);

  // Estimate reset from the oldest member in the window
  let resetAt;
  let retryAfter = 0;
  const oldest = await redisClient.zrange(key, 0, 0, 'WITHSCORES');
  if (oldest.length >= 2) {
    const oldestTs = parseInt(oldest[1], 10);
    resetAt = new Date(oldestTs + (limit.window * 1000));
    retryAfter = allowed ? 0 : Math.ceil((resetAt.getTime() - now) / 1000);
  } else {
    resetAt = new Date(now + (limit.window * 1000));
  }

  return {
    allowed,
    remaining: allowed ? remaining - 1 : 0,
    limit: limit.max,
    resetAt,
    retryAfter,
  };
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function getKey(req, limitType) {
  const identifier = req.token || req.ip || 'anonymous';
  return `rl:${limitType}:${identifier}`;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * @param {string} limitType
 * @param {{ skip?: Function, keyGenerator?: Function, message?: string }} [options]
 * @returns {Function} Express middleware
 */
function rateLimit(limitType = 'requests', options = {}) {
  const limit = config.rateLimits[limitType];
  if (!limit) throw new Error(`Unknown rate limit type: ${limitType}`);

  const {
    skip = () => false,
    keyGenerator = (req) => getKey(req, limitType),
    message = 'Rate limit exceeded',
  } = options;

  return async (req, res, next) => {
    try {
      if (await Promise.resolve(skip(req))) return next();

      await ensureRedis();

      const key = await Promise.resolve(keyGenerator(req));
      const result = redisClient
        ? await checkLimitRedis(key, limit)
        : checkLimit(key, limit);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        throw new RateLimitError(message, result.retryAfter);
      }

      req.rateLimit = result;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// Pre-built limiters
// ---------------------------------------------------------------------------

const requestLimiter = rateLimit('requests');
const postLimiter = rateLimit('posts', { message: 'You can only post once every 30 minutes' });
const commentLimiter = rateLimit('comments', { message: 'Too many comments, slow down' });
const episodeLimiter = rateLimit('episodes', { message: 'Too many episode posts, slow down' });

// ---------------------------------------------------------------------------
// Test helpers (only for use in tests)
// ---------------------------------------------------------------------------

function _clearStorageForTest() {
  storage.clear();
}

function _setRedisClientForTest(client) {
  redisClient = client;
  redisInitialized = true;
}

module.exports = {
  rateLimit,
  checkLimit,
  requestLimiter,
  postLimiter,
  commentLimiter,
  episodeLimiter,
  _clearStorageForTest,
  _setRedisClientForTest,
};
