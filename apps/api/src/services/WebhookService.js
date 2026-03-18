/**
 * WebhookService
 * Manages webhook registrations, fan-out, and HMAC signing.
 * Security: never returns secret in API responses; blocks private/internal URLs (SSRF protection).
 */

const crypto = require('crypto');
const { queryOne, queryAll } = require('../config/database');
const { BadRequestError, ForbiddenError } = require('../utils/errors');

/**
 * Returns true if the URL points to a private/internal address.
 * Blocks: localhost, loopback (127.x), RFC-1918 ranges (10.x, 172.16-31.x, 192.168.x),
 * and link-local / EC2 metadata (169.254.x).
 *
 * @param {string} urlStr
 * @returns {boolean}
 */
function isPrivateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return true; // Unparseable URLs are treated as private (safe default)
  }

  const hostname = parsed.hostname.toLowerCase();

  // Localhost by name
  if (hostname === 'localhost') return true;

  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;

  // Strip IPv6 brackets for easier regex matching
  const host = hostname.replace(/^\[|\]$/g, '');

  // IPv4 private / loopback / link-local ranges
  const privateRanges = [
    /^127\./,                  // loopback 127.0.0.0/8
    /^10\./,                   // RFC-1918 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918 172.16.0.0/12
    /^192\.168\./,             // RFC-1918 192.168.0.0/16
    /^169\.254\./,             // link-local / EC2 metadata
    /^0\./,                    // 0.0.0.0/8
  ];

  for (const re of privateRanges) {
    if (re.test(host)) return true;
  }

  return false;
}

class WebhookService {
  /**
   * Register a new webhook for an agent.
   *
   * @param {Object} opts
   * @param {string} opts.agentId
   * @param {string} opts.url
   * @param {string} opts.secret
   * @param {string[]} [opts.events=['episode.created']]
   * @returns {Promise<{ id: string, url: string, events: string[], created_at: string }>}
   */
  static async register({ agentId, url, secret, events = ['episode.created'] }) {
    if (!url) throw new BadRequestError('url is required');
    if (isPrivateUrl(url)) {
      throw new BadRequestError('url must not point to a private or internal address');
    }

    const row = await queryOne(
      `INSERT INTO webhooks (agent_id, url, secret, events)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, url) DO UPDATE
         SET secret = EXCLUDED.secret,
             events = EXCLUDED.events,
             is_active = true
       RETURNING id, url, events, created_at`,
      [agentId, url, secret, events]
    );

    // Never return secret
    return { id: row.id, url: row.url, events: row.events, created_at: row.created_at };
  }

  /**
   * List active webhooks for an agent (without secret).
   *
   * @param {string} agentId
   * @returns {Promise<Array>}
   */
  static async list(agentId) {
    const rows = await queryAll(
      `SELECT id, url, events, is_active, created_at
       FROM webhooks
       WHERE agent_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [agentId]
    );
    // Rows from DB never have secret (not selected), but be explicit
    return rows.map(({ id, url, events, is_active, created_at }) => ({
      id, url, events, is_active, created_at,
    }));
  }

  /**
   * Deactivate a webhook. Throws ForbiddenError if agentId doesn't own it.
   *
   * @param {string} webhookId
   * @param {string} agentId
   */
  static async deactivate(webhookId, agentId) {
    const webhook = await queryOne(
      'SELECT id, agent_id FROM webhooks WHERE id = $1',
      [webhookId]
    );

    if (!webhook) {
      // Treat missing as forbidden to avoid enumeration
      throw new ForbiddenError('You do not own this webhook');
    }

    if (webhook.agent_id !== agentId) {
      throw new ForbiddenError('You do not own this webhook');
    }

    await queryOne(
      'UPDATE webhooks SET is_active = false WHERE id = $1 RETURNING id',
      [webhookId]
    );
  }

  /**
   * Fan out an event to all active webhooks that subscribe to it.
   * Inserts a webhook_deliveries row for each matching webhook.
   *
   * @param {string} event - e.g. 'episode.created'
   * @param {Object} payload
   */
  static async fanOut(event, payload) {
    const webhooks = await queryAll(
      `SELECT id FROM webhooks
       WHERE is_active = true AND events @> ARRAY[$1]::text[]`,
      [event]
    );

    for (const wh of webhooks) {
      await queryOne(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [wh.id, event, JSON.stringify(payload)]
      );
    }
  }

  /**
   * Compute HMAC-SHA256 signature for a webhook payload.
   *
   * @param {string} secret
   * @param {string} body - JSON string
   * @returns {string} 'sha256=<hex>'
   */
  static hmacSignature(secret, body) {
    const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${hex}`;
  }
}

module.exports = WebhookService;
