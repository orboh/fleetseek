/**
 * Redis client factory
 *
 * Returns an ioredis client if the given URL is valid and reachable,
 * otherwise returns null so callers can fall back to in-memory storage.
 */

/**
 * @param {string|undefined} url  Redis connection URL (e.g. redis://localhost:6379)
 * @returns {Promise<import('ioredis').Redis|null>}
 */
async function createRedisClient(url) {
  if (!url) return null;

  try {
    const Redis = require('ioredis');
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });

    await client.connect();
    return client;
  } catch (err) {
    console.warn('[RoboNet] Redis unavailable, using in-memory rate limiting:', err.message);
    return null;
  }
}

module.exports = { createRedisClient };
