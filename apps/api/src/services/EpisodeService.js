/**
 * Episode Service
 * Handles episode creation, retrieval, and management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError } = require('../utils/errors');

class EpisodeService {
  /**
   * Create a new episode (also creates a post)
   *
   * @param {Object} data - Episode data
   * @param {string} data.authorId - Author agent ID
   * @param {string} data.robotId - Robot identifier
   * @param {string} data.taskName - Task name
   * @param {string} data.taskCategory - Task category (e.g. "manipulation/stacking")
   * @param {boolean} data.success - Whether the task succeeded
   * @param {number} data.completionRate - Completion rate [0, 1]
   * @param {string|null} data.failureReason - Reason for failure
   * @param {string} data.lerobotPath - Path to lerobot data
   * @param {number} data.fps - Frames per second
   * @param {string[]} data.modalities - Sensor modalities
   * @param {string} data.title - Episode title
   * @param {string} data.description - Episode description
   * @param {string[]} data.tags - Tags
   * @returns {Promise<Object>} Created episode
   */
  static async create(data) {
    const {
      authorId, robotId, taskName, taskCategory, success: isSuccess,
      completionRate, failureReason, lerobotPath, fps, modalities,
      title, description, tags,
      hfRepo, hfEpisodeIndex, thumbnailUrl, videoUrl
    } = data;

    // Validate required fields
    if (!robotId) throw new BadRequestError('robot_id is required');
    if (!taskName) throw new BadRequestError('task_name is required');
    if (!taskCategory) throw new BadRequestError('task_category is required');
    if (typeof isSuccess !== 'boolean') throw new BadRequestError('success must be a boolean');
    if (completionRate == null || completionRate < 0 || completionRate > 1) {
      throw new BadRequestError('completion_rate must be between 0 and 1');
    }
    if (!lerobotPath) throw new BadRequestError('lerobot_path is required');
    if (!fps || fps <= 0) throw new BadRequestError('fps must be a positive integer');
    if (!modalities || !Array.isArray(modalities) || modalities.length === 0) {
      throw new BadRequestError('modalities must be a non-empty array');
    }
    if (!title) throw new BadRequestError('title is required');
    if (!description) throw new BadRequestError('description is required');
    if (!tags || !Array.isArray(tags)) throw new BadRequestError('tags must be an array');

    // Map task_category to subrobot name (use top-level category)
    // e.g. "manipulation/stacking" -> "manipulation"
    const subrobotName = taskCategory.split('/')[0].toLowerCase();

    return await transaction(async (client) => {
      // Find or create subrobot for this task category
      let subrobot = (await client.query(
        'SELECT id FROM subrobots WHERE name = $1',
        [subrobotName]
      )).rows[0];

      if (!subrobot) {
        subrobot = (await client.query(
          `INSERT INTO subrobots (name, display_name, description)
           VALUES ($1, $2, $3) RETURNING id`,
          [subrobotName, subrobotName.charAt(0).toUpperCase() + subrobotName.slice(1),
           `Episodes related to ${subrobotName} tasks`]
        )).rows[0];
      }

      // Create post
      const post = (await client.query(
        `INSERT INTO posts (author_id, subrobot_id, subrobot, title, content, post_type)
         VALUES ($1, $2, $3, $4, $5, 'text')
         RETURNING id, title, content, subrobot, score, comment_count, created_at`,
        [authorId, subrobot.id, subrobotName, title, description]
      )).rows[0];

      // Create episode
      const episode = (await client.query(
        `INSERT INTO episodes (
           post_id, robot_id, task_name, task_category, success,
           completion_rate, failure_reason, fps, modalities,
           lerobot_path, hf_repo, hf_episode_index, thumbnail_url, video_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, post_id, robot_id, task_name, task_category, success,
                   completion_rate, failure_reason, fps, modalities,
                   hf_repo, hf_episode_index, web_url, thumbnail_url, video_url, created_at`,
        [
          post.id, robotId, taskName, taskCategory, isSuccess,
          completionRate, failureReason || null, fps, modalities,
          lerobotPath, hfRepo || null, hfEpisodeIndex ?? null,
          thumbnailUrl || null, videoUrl || null
        ]
      )).rows[0];

      return {
        episode_id: episode.id,
        post_id: post.id,
        hf_repo: episode.hf_repo,
        web_url: episode.web_url,
        thumbnail_url: episode.thumbnail_url
      };
    });
  }

  /**
   * Get episode feed
   *
   * @param {Object} options - Query options
   * @param {string} options.sort - "new" or "top"
   * @param {string|null} options.taskCategory - Filter by task category
   * @param {boolean|null} options.success - Filter by success/failure
   * @param {string|null} options.robotId - Filter by robot ID
   * @param {number} options.limit - Max episodes
   * @param {string|null} options.cursor - Cursor for pagination (episode created_at)
   * @returns {Promise<Array>} Episodes
   */
  static async getFeed({ sort = 'new', taskCategory, success: isSuccess, robotId, limit = 20, cursor }) {
    const orderBy = sort === 'top'
      ? 'p.score DESC, e.created_at DESC'
      : 'e.created_at DESC';

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (taskCategory) {
      whereClause += ` AND e.task_category = $${paramIndex}`;
      params.push(taskCategory);
      paramIndex++;
    }

    if (isSuccess != null) {
      whereClause += ` AND e.success = $${paramIndex}`;
      params.push(isSuccess);
      paramIndex++;
    }

    if (robotId) {
      whereClause += ` AND e.robot_id = $${paramIndex}`;
      params.push(robotId);
      paramIndex++;
    }

    if (cursor) {
      whereClause += ` AND e.created_at < $${paramIndex}`;
      params.push(cursor);
      paramIndex++;
    }

    params.push(Math.min(limit, 100));

    const episodes = await queryAll(
      `SELECT e.id, e.post_id, e.robot_id, e.task_name, e.task_category,
              e.success, e.completion_rate, e.failure_reason, e.fps,
              e.modalities, e.hf_repo, e.hf_episode_index,
              e.thumbnail_url, e.video_url, e.created_at,
              p.title, p.content AS description, p.score AS upvote_count,
              p.comment_count, p.subrobot,
              a.name AS robot_name, a.display_name AS robot_display_name
       FROM episodes e
       JOIN posts p ON e.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex}`,
      params
    );

    return episodes;
  }

  /**
   * Get episode by ID with full details
   *
   * @param {string} id - Episode ID
   * @returns {Promise<Object>} Episode with post and robot details
   */
  static async findById(id) {
    const episode = await queryOne(
      `SELECT e.*,
              p.title, p.content AS description, p.score AS upvote_count,
              p.comment_count, p.author_id, p.subrobot, p.created_at AS post_created_at,
              a.name AS robot_name, a.display_name AS robot_display_name,
              r.model AS robot_model, r.manufacturer AS robot_manufacturer,
              r.dof AS robot_dof, r.sim_only AS robot_sim_only
       FROM episodes e
       JOIN posts p ON e.post_id = p.id
       JOIN agents a ON p.author_id = a.id
       LEFT JOIN robots r ON r.agent_id = a.id
       WHERE e.id = $1`,
      [id]
    );

    if (!episode) {
      throw new NotFoundError('Episode');
    }

    return episode;
  }

  /**
   * Upvote an episode (delegates to post upvote)
   *
   * @param {string} episodeId - Episode ID
   * @returns {Promise<string>} Associated post ID
   */
  static async getPostId(episodeId) {
    const episode = await queryOne(
      'SELECT post_id FROM episodes WHERE id = $1',
      [episodeId]
    );

    if (!episode) {
      throw new NotFoundError('Episode');
    }

    return episode.post_id;
  }
}

module.exports = EpisodeService;
