/**
 * Express Application Setup
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes');
const healthHandler = require('./routes/health');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const config = require('./config');
const sentry = require('./lib/sentry');

const app = express();

// Initialize Sentry (no-op if SENTRY_DSN is not set)
sentry.init();

// Sentry request handler (must be first middleware)
sentry.addRequestHandler(app);

// Security middleware
app.use(helmet());

// CORS
const allowedOrigins = config.isProduction
  ? (process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['https://www.robonet.com', 'https://robonet.com'])
  : '*';
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Request logging
if (!config.isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Root-level health check for Railway/Fly.io healthcheck probes (no /api/v1 prefix)
app.get('/health', healthHandler);

// API routes
app.use('/api/v1', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'RoboNet API',
    version: '1.0.0',
    documentation: 'https://www.robonet.com/skill.md'
  });
});

// Error handling (Sentry error handler must come before other error handlers)
sentry.addErrorHandler(app);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
