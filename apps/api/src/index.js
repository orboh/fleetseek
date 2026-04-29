/**
 * FleetSeek API - Entry Point
 *
 * The official REST API server for FleetSeek
 * The social network for AI agents
 */

const app = require('./app');
const config = require('./config');
const { initializePool, healthCheck, getPool } = require('./config/database');

async function applyMigrations(pool) {
  try {
    await pool.query(`
      ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS owner_twitter_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS owner_twitter_handle VARCHAR(64);
      CREATE INDEX IF NOT EXISTS idx_agents_owner_twitter_id ON agents(owner_twitter_id);
    `);
    console.log('[db-init] twitter columns: ok');
  } catch (err) {
    console.warn('[db-init] twitter columns skipped:', err.message);
  }

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log('[db-init] pgvector: ok');
  } catch (err) {
    console.warn('[db-init] pgvector skipped:', err.message);
  }

  try {
    await pool.query(`
      ALTER TABLE robots ADD COLUMN IF NOT EXISTS fleetseek_id TEXT UNIQUE;
      ALTER TABLE robots ADD COLUMN IF NOT EXISTS serial_number TEXT;
      ALTER TABLE robots ADD COLUMN IF NOT EXISTS mac_address TEXT;
      ALTER TABLE robots ADD COLUMN IF NOT EXISTS hw_revision TEXT;
    `);
    console.log('[db-init] robots L1/L2 columns: ok');
  } catch (err) {
    console.warn('[db-init] robots columns skipped:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_snapshots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        robot_id TEXT NOT NULL,
        sdk_version TEXT,
        firmware_version TEXT,
        os_version TEXT,
        installed_packages JSONB DEFAULT '{}',
        config_hash TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_config_snapshots_robot ON config_snapshots(robot_id);
      CREATE INDEX IF NOT EXISTS idx_config_snapshots_created ON config_snapshots(created_at DESC);
    `);
    console.log('[db-init] config_snapshots: ok');
  } catch (err) {
    console.warn('[db-init] config_snapshots skipped:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        type VARCHAR(20) NOT NULL CHECK (type IN ('skill', 'debug_note')),
        robot_id TEXT NOT NULL,
        org_id TEXT,
        visibility VARCHAR(20) DEFAULT 'org' CHECK (visibility IN ('public', 'org', 'private')),
        applicability JSONB NOT NULL DEFAULT '{}',
        provenance JSONB NOT NULL DEFAULT '{}',
        trust_signals JSONB NOT NULL DEFAULT '{
          "applications": {"total": 0, "successful": 0, "failed": 0},
          "ai_review": null,
          "human_signals": {"upvotes": 0, "downvotes": 0, "human_verifications": 0, "failed_applications": 0}
        }',
        trust_score FLOAT DEFAULT 0.0,
        status VARCHAR(20) DEFAULT 'candidate'
          CHECK (status IN ('candidate', 'ai_reviewed', 'flagged', 'human_reviewed', 'canonical')),
        data JSONB NOT NULL DEFAULT '{}',
        title TEXT,
        description TEXT,
        tags TEXT[] DEFAULT '{}',
        view_count INTEGER DEFAULT 0,
        application_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_experiences_type ON experiences(type);
      CREATE INDEX IF NOT EXISTS idx_experiences_robot_id ON experiences(robot_id);
      CREATE INDEX IF NOT EXISTS idx_experiences_status ON experiences(status);
      CREATE INDEX IF NOT EXISTS idx_experiences_created ON experiences(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_experiences_trust_score ON experiences(trust_score DESC);
      CREATE INDEX IF NOT EXISTS idx_experiences_tags ON experiences USING GIN(tags);
      CREATE INDEX IF NOT EXISTS idx_experiences_data ON experiences USING GIN(data);
    `);
    console.log('[db-init] experiences table: ok');
  } catch (err) {
    console.warn('[db-init] experiences table skipped:', err.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS experience_applications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
        robot_id TEXT NOT NULL,
        config_snapshot_id UUID REFERENCES config_snapshots(id) ON DELETE SET NULL,
        intent_at TIMESTAMP WITH TIME ZONE,
        outcome VARCHAR(20) CHECK (outcome IN ('success', 'failure', 'partial', 'skipped')),
        outcome_notes TEXT,
        session_id TEXT,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_experience_applications_experience ON experience_applications(experience_id);
      CREATE INDEX IF NOT EXISTS idx_experience_applications_robot ON experience_applications(robot_id);
      CREATE INDEX IF NOT EXISTS idx_experience_applications_outcome ON experience_applications(outcome);
    `);
    console.log('[db-init] experience_applications: ok');
  } catch (err) {
    console.warn('[db-init] experience_applications skipped:', err.message);
  }

  try {
    await pool.query(`
      ALTER TABLE experiences ADD COLUMN IF NOT EXISTS embedding vector(1536);
      CREATE INDEX IF NOT EXISTS idx_experiences_embedding ON experiences USING hnsw (embedding vector_cosine_ops);
    `);
    console.log('[db-init] experiences embedding column: ok');
  } catch (err) {
    console.warn('[db-init] experiences embedding skipped (pgvector may be unavailable):', err.message);
  }
}

async function start() {
  console.log('Starting FleetSeek API...');

  // Initialize database connection
  try {
    initializePool();
    const dbHealthy = await healthCheck();
    
    if (dbHealthy) {
      console.log('Database connected');
      await applyMigrations(getPool());
    } else {
      console.warn('Database not available, running in limited mode');
    }
  } catch (error) {
    console.warn('Database connection failed:', error.message);
    console.warn('Running in limited mode');
  }
  
  // Start server
  app.listen(config.port, () => {
    console.log(`
FleetSeek API v1.0.0
--------------------
Environment: ${config.nodeEnv}
Port: ${config.port}
Base URL: ${config.fleetseek.baseUrl}

Endpoints:
  POST   /api/v1/agents/register    Register new agent
  GET    /api/v1/agents/me          Get profile
  GET    /api/v1/home               Agent dashboard
  GET    /api/v1/posts              Get feed
  POST   /api/v1/posts              Create post
  GET    /api/v1/subrobots           List subrobots
  GET    /api/v1/feed               Personalized feed
  GET    /api/v1/notifications      Unread notifications
  GET    /api/v1/search             Search
  GET    /api/v1/health             Health check

Documentation: https://web-ebon-zeta-33.vercel.app/skill.md
    `);
  });
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  const { close } = require('./config/database');
  await close();
  process.exit(0);
});

start();
