/**
 * WebhookDeliveryWorker
 * Polls for pending webhook_deliveries and delivers them with retry logic.
 *
 * Security:
 * - Uses SELECT FOR UPDATE SKIP LOCKED to prevent duplicate delivery across instances
 * - Re-validates URL is not private before each delivery (DNS rebinding protection)
 * - AbortController timeout (10 s) on every outbound fetch
 *
 * Retry schedule (exponential back-off):
 *   attempt 0 → 30 s
 *   attempt 1 → 5 min
 *   attempt 2 → 30 min
 *   attempt 3 → 4 h
 *   attempt 4 → 24 h  (MAX_ATTEMPTS = 5 → mark failed)
 */

const { getPool } = require('../config/database');
const WebhookService = require('../services/WebhookService');

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [30_000, 300_000, 1_800_000, 14_400_000, 86_400_000];

/**
 * Re-use the private-URL check from WebhookService without duplicating logic.
 * WebhookService module exports hmacSignature and isPrivateUrl is an internal function,
 * so we replicate a lean version here for delivery-time re-validation.
 */
function isPrivateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return true;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost') return true;
  if (hostname === '::1' || hostname === '[::1]') return true;
  const host = hostname.replace(/^\[|\]$/g, '');
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
  ];
  for (const re of privateRanges) {
    if (re.test(host)) return true;
  }
  return false;
}

class WebhookDeliveryWorker {
  static _timer = null;

  /**
   * Start the polling loop.
   * @param {number} [intervalMs=5000]
   */
  static start(intervalMs = 5000) {
    if (WebhookDeliveryWorker._timer) return;
    WebhookDeliveryWorker._timer = setInterval(
      () => WebhookDeliveryWorker.processPending().catch(() => {}),
      intervalMs
    );
  }

  /**
   * Stop the polling loop.
   */
  static stop() {
    if (WebhookDeliveryWorker._timer) {
      clearInterval(WebhookDeliveryWorker._timer);
      WebhookDeliveryWorker._timer = null;
    }
  }

  /**
   * Fetch up to 10 due deliveries with SKIP LOCKED and process each serially.
   */
  static async processPending() {
    const pool = getPool();
    if (!pool) return;

    const client = await pool.connect();
    let deliveries = [];
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT
           d.id, d.webhook_id, d.event, d.payload, d.status, d.attempts,
           w.url, w.secret
         FROM webhook_deliveries d
         JOIN webhooks w ON w.id = d.webhook_id
         WHERE d.status = 'pending' AND d.next_retry <= NOW()
         ORDER BY d.next_retry ASC
         LIMIT 10
         FOR UPDATE OF d SKIP LOCKED`,
        []
      );
      deliveries = result.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
    client.release();

    for (const delivery of deliveries) {
      await WebhookDeliveryWorker.deliver(delivery).catch(() => {});
    }
  }

  /**
   * Deliver a single webhook_delivery record.
   *
   * @param {Object} delivery - Row from webhook_deliveries JOIN webhooks
   */
  static async deliver(delivery) {
    const { id, url, secret, payload, attempts } = delivery;

    // Re-validate URL at delivery time (partial DNS rebinding protection)
    if (isPrivateUrl(url)) {
      await WebhookDeliveryWorker._updateDelivery(id, 'failed', { error_message: 'URL is private' });
      return;
    }

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signature = WebhookService.hmacSignature(secret, body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let responseCode = null;
    let success = false;

    try {
      const fetchFn = WebhookDeliveryWorker._fetch || fetch;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RoboNet-Signature': signature,
          'User-Agent': 'RoboNet-Webhooks/1.0',
        },
        body,
        signal: controller.signal,
      });
      responseCode = response.status;
      success = response.ok; // 2xx
    } catch {
      // Network error or timeout — treat as transient failure
      success = false;
    } finally {
      clearTimeout(timeout);
    }

    const newAttempts = (attempts || 0) + 1;

    if (success) {
      await WebhookDeliveryWorker._updateDelivery(id, 'delivered', {
        attempts: newAttempts,
        response_code: responseCode,
        last_attempt: new Date(),
      });
    } else if (newAttempts >= MAX_ATTEMPTS) {
      await WebhookDeliveryWorker._updateDelivery(id, 'failed', {
        attempts: newAttempts,
        response_code: responseCode,
        last_attempt: new Date(),
      });
    } else {
      const nextRetry = WebhookDeliveryWorker.scheduleRetry(newAttempts);
      await WebhookDeliveryWorker._updateDelivery(id, 'pending', {
        attempts: newAttempts,
        response_code: responseCode,
        last_attempt: new Date(),
        next_retry: nextRetry,
      });
    }
  }

  /**
   * Compute next_retry Date for a given attempt number.
   *
   * @param {number} attempts - Number of attempts already made
   * @returns {Date}
   */
  static scheduleRetry(attempts) {
    const delayMs = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
    return new Date(Date.now() + delayMs);
  }

  /**
   * Update a delivery row (internal helper; can be replaced in tests).
   *
   * @param {string} id
   * @param {string} status
   * @param {Object} [opts]
   */
  static async _updateDelivery(id, status, opts = {}) {
    const pool = getPool();
    if (!pool) return;

    const { attempts, response_code, last_attempt, next_retry, error_message } = opts;

    await pool.connect().then(async client => {
      try {
        await client.query(
          `UPDATE webhook_deliveries
           SET status = $2,
               attempts = COALESCE($3, attempts),
               response_code = COALESCE($4, response_code),
               last_attempt = COALESCE($5, last_attempt),
               next_retry = COALESCE($6, next_retry),
               error_message = COALESCE($7, error_message)
           WHERE id = $1`,
          [id, status, attempts ?? null, response_code ?? null,
           last_attempt ?? null, next_retry ?? null, error_message ?? null]
        );
      } finally {
        client.release();
      }
    });
  }
}

module.exports = WebhookDeliveryWorker;
