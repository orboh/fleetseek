/**
 * VoyagerStatusService
 * Aggregates live heartbeat status (Redis) and episode history (PostgreSQL)
 * for all registered Voyager bots.
 */

const { queryAll, queryOne } = require('../config/database');

const HEARTBEAT_TTL = 300; // seconds
const REDIS_KEY_PREFIX = 'voyager:status:';

class VoyagerStatusService {
  /**
   * Get live status of all Voyager bots.
   * Reads live state from Redis (TTL-based alive check) and last episode from PostgreSQL.
   * Gracefully degrades to all-offline if Redis is unavailable.
   *
   * @param {import('ioredis').Redis|null} redis
   * @returns {Promise<{ bots: Object[], queried_at: string }>}
   */
  static async getStatus(redis) {
    // 1. Find all registered Voyager bots (graceful degradation if DB unavailable)
    let bots = [];
    try {
      bots = await queryAll(
        `SELECT r.id AS robot_id, a.name, a.display_name
         FROM robots r
         JOIN agents a ON r.agent_id = a.id
         WHERE r.model = 'voyager-minecraft'
         ORDER BY a.name`,
        []
      );
    } catch { /* DB unavailable — return empty bot list */ }

    // 2. Get last episode per bot from PostgreSQL (in parallel)
    let lastEpisodes = bots.map(() => null);
    try {
      lastEpisodes = await Promise.all(
        bots.map(bot =>
          queryOne(
            `SELECT id, title, success, created_at
             FROM episodes
             WHERE robot_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [bot.robot_id]
          ).catch(() => null)
        )
      );
    } catch { /* DB unavailable */ }

    // 3. Fetch live statuses from Redis (graceful degradation if unavailable)
    const redisStatuses = {};
    if (redis) {
      try {
        const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
        if (keys.length > 0) {
          const values = await redis.mget(...keys);
          keys.forEach((key, i) => {
            if (values[i]) {
              try {
                const data = JSON.parse(values[i]);
                redisStatuses[data.robot_id] = data;
              } catch { /* skip malformed entries */ }
            }
          });
        }
      } catch { /* Redis unavailable — all bots appear offline */ }
    }

    // 4. Merge DB + Redis into response
    const botStatuses = bots.map((bot, i) => {
      const live = redisStatuses[bot.robot_id] || null;
      const ep = lastEpisodes[i];
      return {
        robot_id: bot.robot_id,
        name: bot.name,
        alive: Boolean(live),
        mc_connected: live ? Boolean(live.mc_connected) : null,
        current_task: live ? (live.current_task ?? null) : null,
        current_iteration: live ? (live.current_iteration ?? null) : null,
        skills_count: live ? (live.skills_count ?? null) : null,
        last_heartbeat: live ? (live.reported_at ?? null) : null,
        last_episode: ep
          ? { id: ep.id, title: ep.title, success: ep.success, created_at: ep.created_at }
          : null,
      };
    });

    return {
      bots: botStatuses,
      queried_at: new Date().toISOString(),
    };
  }

  /**
   * Record a live heartbeat for a Voyager bot.
   * Writes SET voyager:status:<robot_id> <json> EX 300 to Redis.
   * Silently succeeds if Redis is null or unavailable.
   *
   * @param {import('ioredis').Redis|null} redis
   * @param {Object} payload
   * @param {string} payload.robotId
   * @param {string|null} payload.currentTask
   * @param {number|null} payload.currentIteration
   * @param {number|null} payload.skillsCount
   * @param {boolean} payload.mcConnected
   * @param {string} payload.reportedAt
   */
  static async recordHeartbeat(redis, { robotId, currentTask, currentIteration, skillsCount, mcConnected, reportedAt }) {
    if (!redis) return;
    try {
      const value = JSON.stringify({
        robot_id: robotId,
        current_task: currentTask ?? null,
        current_iteration: currentIteration ?? null,
        skills_count: skillsCount ?? null,
        mc_connected: mcConnected,
        reported_at: reportedAt,
      });
      await redis.set(`${REDIS_KEY_PREFIX}${robotId}`, value, 'EX', HEARTBEAT_TTL);
    } catch { /* fire-and-forget: Redis failure must not affect the bot */ }
  }
}

module.exports = VoyagerStatusService;
