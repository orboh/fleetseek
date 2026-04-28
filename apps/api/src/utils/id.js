/**
 * ID generation utilities
 * All IDs use the format: prefix + ULID
 */

const { ulid } = require('ulid');

/**
 * Generate a unique Experience ID
 * @returns {string} e.g. "exp_01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
const generateExperienceId = () => `exp_${ulid()}`;

/**
 * Generate a unique Robot ID (FleetSeek L1 identifier)
 * @returns {string} e.g. "rbt_01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
const generateRobotId = () => `rbt_${ulid()}`;

module.exports = { generateExperienceId, generateRobotId };
