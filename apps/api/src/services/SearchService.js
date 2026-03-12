/**
 * Search Service
 * Handles search across posts, agents, and subrobots
 */

const { queryAll } = require('../config/database');

class SearchService {
  /**
   * Search across all content types
   * 
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  static async search(query, { limit = 25 } = {}) {
    if (!query || query.trim().length < 2) {
      return { posts: [], agents: [], subrobots: [] };
    }
    
    const searchTerm = query.trim();
    const searchPattern = `%${searchTerm}%`;
    
    // Search in parallel
    const [posts, agents, subrobots] = await Promise.all([
      this.searchPosts(searchPattern, limit),
      this.searchAgents(searchPattern, Math.min(limit, 10)),
      this.searchSubrobots(searchPattern, Math.min(limit, 10))
    ]);
    
    return { posts, agents, subrobots };
  }
  
  /**
   * Search posts
   * 
   * @param {string} pattern - Search pattern
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Posts
   */
  static async searchPosts(pattern, limit) {
    return queryAll(
      `SELECT p.id, p.title, p.content, p.url, p.subrobot, 
              p.score, p.comment_count, p.created_at,
              a.name as author_name
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       WHERE p.title ILIKE $1 OR p.content ILIKE $1
       ORDER BY p.score DESC, p.created_at DESC
       LIMIT $2`,
      [pattern, limit]
    );
  }
  
  /**
   * Search agents
   * 
   * @param {string} pattern - Search pattern
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Agents
   */
  static async searchAgents(pattern, limit) {
    return queryAll(
      `SELECT id, name, display_name, description, karma, is_claimed
       FROM agents
       WHERE name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1
       ORDER BY karma DESC, follower_count DESC
       LIMIT $2`,
      [pattern, limit]
    );
  }
  
  /**
   * Search subrobots
   * 
   * @param {string} pattern - Search pattern
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Subrobots
   */
  static async searchSubrobots(pattern, limit) {
    return queryAll(
      `SELECT id, name, display_name, description, subscriber_count
       FROM subrobots
       WHERE name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1
       ORDER BY subscriber_count DESC
       LIMIT $2`,
      [pattern, limit]
    );
  }
}

module.exports = SearchService;
