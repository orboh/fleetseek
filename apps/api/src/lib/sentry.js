/**
 * Sentry Error Tracking — Community C
 *
 * Conditionally initializes Sentry based on SENTRY_DSN env var.
 * If SENTRY_DSN is not set, all functions are no-ops so the app
 * runs normally without Sentry.
 *
 * Usage:
 *   const sentry = require('./lib/sentry');
 *   sentry.init();                    // call once at startup
 *   sentry.addRequestHandler(app);    // before routes
 *   sentry.addErrorHandler(app);      // after routes, before other error handlers
 */

/**
 * Create a Sentry integration object.
 * @param {object|null} sentryModule - @sentry/node or null if not installed
 * @returns {{ init, addRequestHandler, addErrorHandler, captureException }}
 */
function createSentryIntegration(sentryModule) {
  let _initialized = false;

  function init() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn || !sentryModule) return false;
    sentryModule.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
    });
    _initialized = true;
    return true;
  }

  function addRequestHandler(app) {
    if (!_initialized || !sentryModule) return;
    app.use(sentryModule.Handlers.requestHandler());
  }

  function addErrorHandler(app) {
    if (!_initialized || !sentryModule) return;
    app.use(sentryModule.Handlers.errorHandler());
  }

  function captureException(err) {
    if (!_initialized || !sentryModule) return;
    sentryModule.captureException(err);
  }

  return { init, addRequestHandler, addErrorHandler, captureException };
}

// Load real @sentry/node if available
let _sentryModule = null;
try {
  _sentryModule = require('@sentry/node');
} catch (_) {
  // @sentry/node not installed — all functions will be no-ops
}

const defaultIntegration = createSentryIntegration(_sentryModule);

// Expose factory for testing
defaultIntegration._createForTesting = createSentryIntegration;

module.exports = defaultIntegration;
