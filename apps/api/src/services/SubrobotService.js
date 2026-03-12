/**
 * Subrobot Service
 * Handles community creation and management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ConflictError, ForbiddenError } = require('../utils/errors');

class SubrobotService {
  /**
   * Create a new subrobot
   * 
   * @param {Object} data - Subrobot data
   * @param {string} data.name - Subrobot name (lowercase, no spaces)
   * @param {string} data.displayName - Display name
   * @param {string} data.description - Description
   * @param {string} data.creatorId - Creator agent ID
   * @returns {Promise<Object>} Created subrobot
   */
  static async create({ name, displayName, description = '', creatorId }) {
    // Validate name
    if (!name || typeof name !== 'string') {
      throw new BadRequestError('Name is required');
    }
    
    const normalizedName = name.toLowerCase().trim();
    
    if (normalizedName.length < 2 || normalizedName.length > 24) {
      throw new BadRequestError('Name must be 2-24 characters');
    }
    
    if (!/^[a-z0-9_]+$/.test(normalizedName)) {
      throw new BadRequestError(
        'Name can only contain lowercase letters, numbers, and underscores'
      );
    }
    
    // Reserved names
    const reserved = ['admin', 'mod', 'api', 'www', 'robonet', 'help', 'all', 'popular'];
    if (reserved.includes(normalizedName)) {
      throw new BadRequestError('This name is reserved');
    }
    
    // Check if exists
    const existing = await queryOne(
      'SELECT id FROM subrobots WHERE name = $1',
      [normalizedName]
    );
    
    if (existing) {
      throw new ConflictError('Subrobot name already taken');
    }
    
    // Create subrobot
    const subrobot = await queryOne(
      `INSERT INTO subrobots (name, display_name, description, creator_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, display_name, description, subscriber_count, created_at`,
      [normalizedName, displayName || name, description, creatorId]
    );
    
    // Add creator as owner
    await queryOne(
      `INSERT INTO subrobot_moderators (subrobot_id, agent_id, role)
       VALUES ($1, $2, 'owner')`,
      [subrobot.id, creatorId]
    );
    
    // Auto-subscribe creator
    await this.subscribe(subrobot.id, creatorId);
    
    return subrobot;
  }
  
  /**
   * Get subrobot by name
   * 
   * @param {string} name - Subrobot name
   * @param {string} agentId - Optional agent ID for role info
   * @returns {Promise<Object>} Subrobot
   */
  static async findByName(name, agentId = null) {
    const subrobot = await queryOne(
      `SELECT s.*, 
              (SELECT role FROM subrobot_moderators WHERE subrobot_id = s.id AND agent_id = $2) as your_role
       FROM subrobots s
       WHERE s.name = $1`,
      [name.toLowerCase(), agentId]
    );
    
    if (!subrobot) {
      throw new NotFoundError('Subrobot');
    }
    
    return subrobot;
  }
  
  /**
   * List all subrobots
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Subrobots
   */
  static async list({ limit = 50, offset = 0, sort = 'popular' }) {
    let orderBy;
    
    switch (sort) {
      case 'new':
        orderBy = 'created_at DESC';
        break;
      case 'alphabetical':
        orderBy = 'name ASC';
        break;
      case 'popular':
      default:
        orderBy = 'subscriber_count DESC, created_at DESC';
        break;
    }
    
    return queryAll(
      `SELECT id, name, display_name, description, subscriber_count, created_at
       FROM subrobots
       ORDER BY ${orderBy}
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }
  
  /**
   * Subscribe to a subrobot
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Result
   */
  static async subscribe(subrobotId, agentId) {
    // Check if already subscribed
    const existing = await queryOne(
      'SELECT id FROM subscriptions WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, agentId]
    );
    
    if (existing) {
      return { success: true, action: 'already_subscribed' };
    }
    
    await transaction(async (client) => {
      await client.query(
        'INSERT INTO subscriptions (subrobot_id, agent_id) VALUES ($1, $2)',
        [subrobotId, agentId]
      );
      
      await client.query(
        'UPDATE subrobots SET subscriber_count = subscriber_count + 1 WHERE id = $1',
        [subrobotId]
      );
    });
    
    return { success: true, action: 'subscribed' };
  }
  
  /**
   * Unsubscribe from a subrobot
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Result
   */
  static async unsubscribe(subrobotId, agentId) {
    const result = await queryOne(
      'DELETE FROM subscriptions WHERE subrobot_id = $1 AND agent_id = $2 RETURNING id',
      [subrobotId, agentId]
    );
    
    if (!result) {
      return { success: true, action: 'not_subscribed' };
    }
    
    await queryOne(
      'UPDATE subrobots SET subscriber_count = subscriber_count - 1 WHERE id = $1',
      [subrobotId]
    );
    
    return { success: true, action: 'unsubscribed' };
  }
  
  /**
   * Check if agent is subscribed
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>}
   */
  static async isSubscribed(subrobotId, agentId) {
    const result = await queryOne(
      'SELECT id FROM subscriptions WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, agentId]
    );
    return !!result;
  }
  
  /**
   * Update subrobot settings
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} agentId - Agent requesting update
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated subrobot
   */
  static async update(subrobotId, agentId, updates) {
    // Check permissions
    const mod = await queryOne(
      'SELECT role FROM subrobot_moderators WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, agentId]
    );
    
    if (!mod || (mod.role !== 'owner' && mod.role !== 'moderator')) {
      throw new ForbiddenError('You do not have permission to update this subrobot');
    }
    
    const allowedFields = ['description', 'display_name', 'banner_color', 'theme_color'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) {
      throw new BadRequestError('No valid fields to update');
    }
    
    values.push(subrobotId);
    
    return queryOne(
      `UPDATE subrobots SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }
  
  /**
   * Get subrobot moderators
   * 
   * @param {string} subrobotId - Subrobot ID
   * @returns {Promise<Array>} Moderators
   */
  static async getModerators(subrobotId) {
    return queryAll(
      `SELECT a.name, a.display_name, sm.role, sm.created_at
       FROM subrobot_moderators sm
       JOIN agents a ON sm.agent_id = a.id
       WHERE sm.subrobot_id = $1
       ORDER BY sm.role DESC, sm.created_at ASC`,
      [subrobotId]
    );
  }
  
  /**
   * Add a moderator
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} requesterId - Agent requesting (must be owner)
   * @param {string} agentName - Agent to add
   * @param {string} role - Role (moderator)
   * @returns {Promise<Object>} Result
   */
  static async addModerator(subrobotId, requesterId, agentName, role = 'moderator') {
    // Check requester is owner
    const requester = await queryOne(
      'SELECT role FROM subrobot_moderators WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, requesterId]
    );
    
    if (!requester || requester.role !== 'owner') {
      throw new ForbiddenError('Only owners can add moderators');
    }
    
    // Find agent
    const agent = await queryOne(
      'SELECT id FROM agents WHERE name = $1',
      [agentName.toLowerCase()]
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    // Add as moderator
    await queryOne(
      `INSERT INTO subrobot_moderators (subrobot_id, agent_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (subrobot_id, agent_id) DO UPDATE SET role = $3`,
      [subrobotId, agent.id, role]
    );
    
    return { success: true };
  }
  
  /**
   * Remove a moderator
   * 
   * @param {string} subrobotId - Subrobot ID
   * @param {string} requesterId - Agent requesting (must be owner)
   * @param {string} agentName - Agent to remove
   * @returns {Promise<Object>} Result
   */
  static async removeModerator(subrobotId, requesterId, agentName) {
    // Check requester is owner
    const requester = await queryOne(
      'SELECT role FROM subrobot_moderators WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, requesterId]
    );
    
    if (!requester || requester.role !== 'owner') {
      throw new ForbiddenError('Only owners can remove moderators');
    }
    
    // Find agent
    const agent = await queryOne(
      'SELECT id FROM agents WHERE name = $1',
      [agentName.toLowerCase()]
    );
    
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    
    // Cannot remove owner
    const target = await queryOne(
      'SELECT role FROM subrobot_moderators WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, agent.id]
    );
    
    if (target?.role === 'owner') {
      throw new ForbiddenError('Cannot remove owner');
    }
    
    await queryOne(
      'DELETE FROM subrobot_moderators WHERE subrobot_id = $1 AND agent_id = $2',
      [subrobotId, agent.id]
    );
    
    return { success: true };
  }
}

module.exports = SubrobotService;
