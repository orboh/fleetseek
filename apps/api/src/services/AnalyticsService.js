/**
 * AnalyticsService
 * Task benchmarks, robot comparison, and trend analysis.
 */

const { queryAll } = require('../config/database');
const { BadRequestError } = require('../utils/errors');

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

class AnalyticsService {
  /**
   * Get benchmark ranking for a specific task.
   * Ranks robots by success rate on the given task.
   *
   * @param {Object} opts
   * @param {string} opts.taskName - Task to benchmark (required)
   * @param {number} [opts.minEpisodes=3] - Minimum episodes to qualify
   * @returns {Promise<{ task_name: string, robots: Object[] }>}
   */
  static async getBenchmarks({ taskName, minEpisodes = 3 }) {
    if (!taskName) throw new BadRequestError('task_name is required');

    const robots = await queryAll(
      `SELECT
         a.id          AS agent_id,
         a.name        AS robot_name,
         a.display_name AS robot_display_name,
         r.model       AS robot_model,
         COUNT(*)::int                                          AS total_episodes,
         COUNT(*) FILTER (WHERE e.success = true)::int         AS success_count,
         ROUND(
           COUNT(*) FILTER (WHERE e.success = true)::numeric
           / NULLIF(COUNT(*), 0),
           4
         )                                                      AS success_rate,
         ROUND(AVG(e.completion_rate)::numeric, 4)             AS avg_completion_rate
       FROM episodes e
       JOIN posts p ON e.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       LEFT JOIN robots r ON r.agent_id = a.id
       WHERE e.task_name = $1
       GROUP BY a.id, a.name, a.display_name, r.model
       HAVING COUNT(*) >= $2
       ORDER BY success_rate DESC, avg_completion_rate DESC`,
      [taskName, minEpisodes]
    );

    return { task_name: taskName, robots };
  }

  /**
   * Compare aggregate statistics for multiple robots.
   *
   * @param {string[]} agentIds - Agent IDs to compare (1–5)
   * @returns {Promise<{ robots: Object[] }>}
   */
  static async compareRobots(agentIds) {
    if (!agentIds || agentIds.length === 0) {
      throw new BadRequestError('ids must be a non-empty array');
    }
    if (agentIds.length > 5) {
      throw new BadRequestError('ids must contain at most 5 entries');
    }

    // Build parameterised placeholder list: $1, $2, ...
    const placeholders = agentIds.map((_, i) => `$${i + 1}`).join(', ');

    // Query 1: aggregate stats per agent
    const stats = await queryAll(
      `SELECT
         a.id          AS agent_id,
         a.name        AS robot_name,
         a.display_name AS robot_display_name,
         r.model       AS robot_model,
         COUNT(*)::int                                          AS total_episodes,
         COUNT(*) FILTER (WHERE e.success = true)::int         AS success_count,
         ROUND(
           COUNT(*) FILTER (WHERE e.success = true)::numeric
           / NULLIF(COUNT(*), 0),
           4
         )                                                      AS success_rate,
         ROUND(AVG(e.completion_rate)::numeric, 4)             AS avg_completion_rate
       FROM episodes e
       JOIN posts p ON e.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       LEFT JOIN robots r ON r.agent_id = a.id
       WHERE a.id IN (${placeholders})
       GROUP BY a.id, a.name, a.display_name, r.model
       ORDER BY success_rate DESC`,
      agentIds
    );

    // Query 2: top tasks per agent
    const tasks = await queryAll(
      `SELECT
         a.id          AS agent_id,
         e.task_name,
         COUNT(*)::int                                        AS count,
         COUNT(*) FILTER (WHERE e.success = true)::int       AS success_count
       FROM episodes e
       JOIN posts p ON e.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       WHERE a.id IN (${placeholders})
       GROUP BY a.id, e.task_name
       ORDER BY a.id, count DESC`,
      agentIds
    );

    // Group top tasks by agent_id (max 5 each)
    const tasksByAgent = {};
    for (const row of tasks) {
      if (!tasksByAgent[row.agent_id]) tasksByAgent[row.agent_id] = [];
      if (tasksByAgent[row.agent_id].length < 5) {
        tasksByAgent[row.agent_id].push({
          task_name: row.task_name,
          count: row.count,
          success_count: row.success_count,
        });
      }
    }

    const robots = stats.map(s => ({
      ...s,
      top_tasks: tasksByAgent[s.agent_id] || [],
    }));

    return { robots };
  }

  /**
   * Get time-series trend data for a task category.
   *
   * @param {Object} opts
   * @param {string} opts.category - Task category prefix (required)
   * @param {string} [opts.period='7d'] - '7d' | '30d' | '90d'
   * @returns {Promise<{ category: string, period: string, period_days: number, data: Object[] }>}
   */
  static async getTrends({ category, period = '7d' }) {
    if (!category) throw new BadRequestError('category is required');
    if (!PERIOD_DAYS[period]) {
      throw new BadRequestError('period must be one of 7d, 30d, 90d');
    }

    const periodDays = PERIOD_DAYS[period];

    const data = await queryAll(
      `SELECT
         DATE_TRUNC('day', e.created_at)                        AS day,
         COUNT(*)::int                                           AS total,
         COUNT(*) FILTER (WHERE e.success = true)::int          AS success_count,
         ROUND(AVG(e.completion_rate)::numeric, 4)              AS avg_completion_rate
       FROM episodes e
       WHERE e.task_category LIKE $1
         AND e.created_at >= NOW() - ($2 * INTERVAL '1 day')
       GROUP BY DATE_TRUNC('day', e.created_at)
       ORDER BY day ASC`,
      [category + '%', periodDays]
    );

    return { category, period, period_days: periodDays, data };
  }
}

module.exports = AnalyticsService;
