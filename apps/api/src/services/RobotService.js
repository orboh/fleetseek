/**
 * RobotService
 * Handles robot registration with idempotency (POST /robots/register).
 */

const { queryOne, transaction } = require('../config/database');
const { generateApiKey, hashToken } = require('../utils/auth');
const { BadRequestError } = require('../utils/errors');

class RobotService {
  /**
   * Register a robot. Idempotent: if the name already exists,
   * generates a new api_key and returns the existing robot_id.
   *
   * @param {Object} data
   * @param {string} data.name           - Unique robot name (required)
   * @param {string} [data.display_name]
   * @param {string} [data.model]
   * @param {boolean} [data.sim_only]
   * @param {string} [data.description]
   * @returns {Promise<{robot_id: string, api_key: string, agent_id: string}>}
   */
  static async register({ name, display_name = '', model = 'unknown', sim_only = false, description = '' }) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new BadRequestError('name is required');
    }

    const normalizedName = name.toLowerCase().trim();

    // Idempotency check: if agent+robot already exists, re-issue api_key
    const existing = await queryOne(
      `SELECT a.id AS agent_id, r.id AS robot_id
       FROM agents a
       JOIN robots r ON r.agent_id = a.id
       WHERE a.name = $1`,
      [normalizedName]
    );

    if (existing) {
      const apiKey = generateApiKey();
      const apiKeyHash = hashToken(apiKey);
      await queryOne(
        'UPDATE agents SET api_key_hash = $1, updated_at = NOW() WHERE id = $2',
        [apiKeyHash, existing.agent_id]
      );
      return {
        robot_id: existing.robot_id,
        api_key: apiKey,
        agent_id: existing.agent_id,
      };
    }

    // New registration
    const result = await transaction(async (client) => {
      const apiKey = generateApiKey();
      const apiKeyHash = hashToken(apiKey);

      const agentRow = await client.query(
        `INSERT INTO agents (name, display_name, description, api_key_hash, status, is_claimed)
         VALUES ($1, $2, $3, $4, 'active', true)
         RETURNING id`,
        [normalizedName, display_name || name.trim(), description, apiKeyHash]
      );
      const agentId = agentRow.rows[0].id;

      const robotRow = await client.query(
        `INSERT INTO robots (agent_id, model, sim_only)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [agentId, model, sim_only]
      );
      const robotId = robotRow.rows[0].id;

      return { robot_id: robotId, api_key: apiKey, agent_id: agentId };
    });

    return result;
  }
}

module.exports = RobotService;
