/**
 * Experience Routes
 * /api/v1/experiences/*
 *
 * Handles both SkillExperience (type:"skill") and
 * DebugExperience (type:"debug_note") via the shared `experiences` table.
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { queryOne, queryAll, transaction } = require('../config/database');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { generateExperienceId } = require('../utils/id');

const router = Router();

const VALID_OUTCOMES = ['success', 'failure', 'partial', 'skipped'];

/**
 * POST /experiences
 * Create a new Experience (skill or debug_note).
 * Requires API key authentication.
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const {
    type,
    title,
    description,
    tags,
    applicability,
    provenance,
    data,
    visibility = 'public'
  } = req.body;

  if (!type || !['skill', 'debug_note'].includes(type)) {
    throw new BadRequestError(
      'type must be "skill" or "debug_note"',
      'INVALID_TYPE',
      'Provide type as "skill" for successful motions or "debug_note" for failure recoveries'
    );
  }

  if (!title) {
    throw new BadRequestError('title is required');
  }

  const id = generateExperienceId();

  // Initial trust_signals scaffold
  const initialTrustSignals = {
    applications: { total: 0, successful: 0, failed: 0 },
    upvotes: 0,
    downvotes: 0
  };

  const experience = await queryOne(
    `INSERT INTO experiences (
       id, type, robot_id, title, description, tags,
       applicability, provenance, data, visibility,
       trust_signals, trust_score, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, 0, 'candidate', NOW(), NOW()
     )
     RETURNING *`,
    [
      id,
      type,
      req.agent.id,
      title,
      description || null,
      tags || null,
      JSON.stringify(applicability || {}),
      JSON.stringify(provenance || {}),
      JSON.stringify(data || {}),
      visibility,
      JSON.stringify(initialTrustSignals)
    ]
  );

  created(res, { experience });
}));

/**
 * GET /experiences/:id
 * Retrieve a single Experience by ID.
 * No authentication required.
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const experience = await queryOne(
    `SELECT * FROM experiences WHERE id = $1`,
    [req.params.id]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  success(res, { experience });
}));

/**
 * POST /experiences/search
 * Search experiences with optional text query, type filter, and tag filter.
 * Ordered by trust_score DESC.
 * Body: { query?, type?, tags?, limit? }
 */
router.post('/search', asyncHandler(async (req, res) => {
  // Note: /search must be declared before /:id so it is not caught by the param route.
  const { query: textQuery, type, tags, limit = 20 } = req.body;

  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (textQuery) {
    conditions.push(
      `(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
    );
    params.push(`%${textQuery}%`);
    paramIndex++;
  }

  if (type) {
    if (!['skill', 'debug_note'].includes(type)) {
      throw new BadRequestError('type must be "skill" or "debug_note"');
    }
    conditions.push(`type = $${paramIndex}`);
    params.push(type);
    paramIndex++;
  }

  if (tags && Array.isArray(tags) && tags.length > 0) {
    // tags column is stored as JSONB; match any tag using the ? operator
    conditions.push(`tags::jsonb ?| $${paramIndex}::text[]`);
    params.push(tags);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(safeLimit);

  const experiences = await queryAll(
    `SELECT * FROM experiences
     ${whereClause}
     ORDER BY trust_score DESC
     LIMIT $${paramIndex}`,
    params
  );

  success(res, { experiences, count: experiences.length });
}));

/**
 * POST /experiences/:id/intent_to_apply
 * Record a robot's intent to apply this experience before actually running it.
 * Requires API key authentication.
 * Body: (none required; robot identified via auth token)
 */
router.post('/:id/intent_to_apply', requireAuth, asyncHandler(async (req, res) => {
  const experienceId = req.params.id;

  const experience = await queryOne(
    `SELECT id FROM experiences WHERE id = $1`,
    [experienceId]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  const application = await queryOne(
    `INSERT INTO experience_applications (
       experience_id, robot_id, intent_at, outcome, created_at
     ) VALUES ($1, $2, NOW(), NULL, NOW())
     RETURNING *`,
    [experienceId, req.agent.id]
  );

  created(res, { application });
}));

/**
 * POST /experiences/:id/applications
 * Report the outcome of applying an experience.
 * Requires API key authentication.
 * Body: { outcome, outcome_notes?, session_id? }
 * outcome must be one of: 'success', 'failure', 'partial', 'skipped'
 */
router.post('/:id/applications', requireAuth, asyncHandler(async (req, res) => {
  const experienceId = req.params.id;
  const { outcome, outcome_notes, session_id } = req.body;

  if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
    throw new BadRequestError(
      `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`,
      'INVALID_OUTCOME'
    );
  }

  const experience = await queryOne(
    `SELECT id, trust_signals FROM experiences WHERE id = $1`,
    [experienceId]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  const result = await transaction(async (client) => {
    // Insert application record
    const application = (
      await client.query(
        `INSERT INTO experience_applications (
           experience_id, robot_id, outcome, outcome_notes, session_id,
           intent_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [experienceId, req.agent.id, outcome, outcome_notes || null, session_id || null]
      )
    ).rows[0];

    // Update trust_signals counters
    const signals = experience.trust_signals || {
      applications: { total: 0, successful: 0, failed: 0 }
    };
    if (!signals.applications) {
      signals.applications = { total: 0, successful: 0, failed: 0 };
    }

    signals.applications.total += 1;
    if (outcome === 'success') {
      signals.applications.successful += 1;
    } else if (outcome === 'failure') {
      signals.applications.failed += 1;
    }

    const total = signals.applications.total;
    const successful = signals.applications.successful;
    const newTrustScore = total > 0 ? (successful / total) * 100 : 0;

    await client.query(
      `UPDATE experiences
       SET trust_signals = $1, trust_score = $2, updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(signals), newTrustScore, experienceId]
    );

    return application;
  });

  created(res, { application: result });
}));

module.exports = router;
