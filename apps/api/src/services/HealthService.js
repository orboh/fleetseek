/**
 * HealthService
 * Checks DB and Redis connectivity for the health endpoint.
 */

const db = require('../config/database');

/**
 * @param {import('ioredis').Redis|null} redis
 * @returns {Promise<{ status: 'ok'|'degraded'|'error', db: string, redis: string, timestamp: string }>}
 */
async function check(redis) {
  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    const ok = await db.healthCheck();
    if (!ok) dbStatus = 'unavailable';
  } catch {
    dbStatus = 'unavailable';
  }

  if (!redis) {
    redisStatus = 'unavailable';
  } else {
    try {
      await redis.ping();
    } catch {
      redisStatus = 'unavailable';
    }
  }

  let status = 'ok';
  if (dbStatus === 'unavailable') {
    status = 'error';
  } else if (redisStatus === 'unavailable') {
    status = 'degraded';
  }

  return {
    status,
    db: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { check };
