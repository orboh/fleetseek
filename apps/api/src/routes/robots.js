/**
 * Robot Routes
 * /api/v1/robots/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { queryOne, queryAll } = require('../config/database');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { generateRobotId } = require('../utils/id');

const router = Router();

/**
 * GET /robots/:id
 * Get robot profile with statistics.
 * :id is the robot_id string (e.g. "g1_sim_001").
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const robotId = req.params.id;

  // Get episodes for this robot_id to build profile
  const stats = await queryOne(
    `SELECT
       COUNT(*) AS total_episodes,
       COUNT(*) FILTER (WHERE e.success = true) AS success_count,
       COUNT(DISTINCT e.task_category) AS task_categories,
       COALESCE(AVG(e.completion_rate), 0) AS avg_completion_rate
     FROM episodes e
     WHERE e.robot_id = $1`,
    [robotId]
  );

  if (!stats || parseInt(stats.total_episodes) === 0) {
    throw new NotFoundError('Robot');
  }

  // Get robot info from robots table (if registered)
  const robotRecord = await queryOne(
    `SELECT r.*, a.name AS agent_name, a.display_name, a.description,
            a.avatar_url, a.created_at AS agent_created_at
     FROM robots r
     JOIN agents a ON r.agent_id = a.id
     WHERE a.name = $1 OR r.id::text = $1`,
    [robotId]
  );

  // Get agent info (the agent that posted episodes for this robot_id)
  const agent = await queryOne(
    `SELECT DISTINCT a.name, a.display_name, a.description, a.avatar_url, a.created_at
     FROM agents a
     JOIN posts p ON p.author_id = a.id
     JOIN episodes e ON e.post_id = p.id
     WHERE e.robot_id = $1
     LIMIT 1`,
    [robotId]
  );

  const totalEpisodes = parseInt(stats.total_episodes);
  const successCount = parseInt(stats.success_count);

  success(res, {
    robot: {
      id: robotId,
      name: agent?.name || robotId,
      display_name: agent?.display_name || robotRecord?.display_name || robotId,
      description: agent?.description || robotRecord?.description || null,
      avatar_url: agent?.avatar_url || null,
      model: robotRecord?.model || 'unknown',
      manufacturer: robotRecord?.manufacturer || null,
      dof: robotRecord?.dof || null,
      has_hand: robotRecord?.has_hand || false,
      hand_model: robotRecord?.hand_model || null,
      sim_only: robotRecord?.sim_only ?? true,
      created_at: agent?.created_at || agent?.agent_created_at || null,
    },
    stats: {
      total_episodes: totalEpisodes,
      success_count: successCount,
      success_rate: totalEpisodes > 0 ? successCount / totalEpisodes : 0,
      task_categories: parseInt(stats.task_categories),
      avg_completion_rate: parseFloat(stats.avg_completion_rate),
    },
  });
}));

/**
 * GET /robots/:id/stats
 * Get detailed stats for charts (task breakdown, time series).
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const robotId = req.params.id;

  // Task-level success rates
  const taskStats = await queryAll(
    `SELECT
       e.task_name,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE e.success = true) AS success_count,
       AVG(e.completion_rate) AS avg_completion_rate
     FROM episodes e
     WHERE e.robot_id = $1
     GROUP BY e.task_name
     ORDER BY total DESC`,
    [robotId]
  );

  // Daily post counts (last 30 days)
  const dailyCounts = await queryAll(
    `SELECT
       DATE(e.created_at) AS date,
       COUNT(*) AS count
     FROM episodes e
     WHERE e.robot_id = $1
       AND e.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY DATE(e.created_at)
     ORDER BY date`,
    [robotId]
  );

  success(res, {
    task_stats: taskStats.map(t => ({
      task_name: t.task_name,
      total: parseInt(t.total),
      success_count: parseInt(t.success_count),
      success_rate: parseInt(t.total) > 0 ? parseInt(t.success_count) / parseInt(t.total) : 0,
      avg_completion_rate: parseFloat(t.avg_completion_rate),
    })),
    daily_counts: dailyCounts.map(d => ({
      date: d.date,
      count: parseInt(d.count),
    })),
  });
}));

/**
 * POST /robots/register
 * Register a physical robot and obtain a FleetSeek L1 ID (rbt_ + ULID).
 * Requires API key authentication.
 * Body: { model, manufacturer, dof, has_hand, hand_model, serial_number, mac_address, hw_revision }
 */
router.post('/register', requireAuth, asyncHandler(async (req, res) => {
  const {
    model,
    manufacturer,
    dof,
    has_hand = false,
    hand_model = null,
    serial_number = null,
    mac_address = null,
    hw_revision = null
  } = req.body;

  if (!model) {
    throw new BadRequestError('model is required');
  }

  const fleetseekId = generateRobotId();

  // Upsert: if a robot with the same serial_number already exists, update it;
  // otherwise insert a new record.
  const robot = await queryOne(
    `INSERT INTO robots (
       fleetseek_id, agent_id,
       model, manufacturer, dof,
       has_hand, hand_model,
       serial_number, mac_address, hw_revision,
       created_at, updated_at
     ) VALUES (
       $1, $2,
       $3, $4, $5,
       $6, $7,
       $8, $9, $10,
       NOW(), NOW()
     )
     ON CONFLICT (serial_number) WHERE serial_number IS NOT NULL
     DO UPDATE SET
       fleetseek_id   = EXCLUDED.fleetseek_id,
       model          = EXCLUDED.model,
       manufacturer   = EXCLUDED.manufacturer,
       dof            = EXCLUDED.dof,
       has_hand       = EXCLUDED.has_hand,
       hand_model     = EXCLUDED.hand_model,
       mac_address    = EXCLUDED.mac_address,
       hw_revision    = EXCLUDED.hw_revision,
       updated_at     = NOW()
     RETURNING *`,
    [
      fleetseekId,
      req.agent.id,
      model,
      manufacturer || null,
      dof || null,
      has_hand,
      hand_model,
      serial_number,
      mac_address,
      hw_revision
    ]
  );

  created(res, { robot });
}));

/**
 * POST /robots/:id/config_snapshot
 * Record a new ConfigSnapshot (L3) for the given robot (by fleetseek_id).
 * Requires API key authentication.
 * Body: { sdk_version, firmware_version, os_version, installed_packages }
 */
router.post('/:id/config_snapshot', requireAuth, asyncHandler(async (req, res) => {
  const fleetseekId = req.params.id;

  const robotRecord = await queryOne(
    `SELECT id FROM robots WHERE fleetseek_id = $1`,
    [fleetseekId]
  );

  if (!robotRecord) {
    throw new NotFoundError('Robot');
  }

  const {
    sdk_version = null,
    firmware_version = null,
    os_version = null,
    installed_packages = null
  } = req.body;

  const snapshot = await queryOne(
    `INSERT INTO config_snapshots (
       robot_id, sdk_version, firmware_version,
       os_version, installed_packages, created_at
     ) VALUES (
       $1, $2, $3,
       $4, $5, NOW()
     )
     RETURNING *`,
    [
      fleetseekId,
      sdk_version,
      firmware_version,
      os_version,
      installed_packages ? JSON.stringify(installed_packages) : null
    ]
  );

  created(res, { snapshot });
}));

module.exports = router;
