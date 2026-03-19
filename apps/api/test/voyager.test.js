/**
 * Voyager Dashboard Tests — Phase 6-A
 * Run: node test/voyager.test.js
 */

// ─── Test framework ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const tests = [];

function describe(name, fn) { tests.push({ type: 'describe', name }); fn(); }
function test(name, fn) { tests.push({ type: 'test', name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runTests() {
  console.log('\nVoyager Dashboard Tests (Phase 6-A)\n');
  console.log('='.repeat(50));
  for (const item of tests) {
    if (item.type === 'describe') {
      console.log(`\n[${item.name}]\n`);
    } else {
      try {
        await item.fn();
        console.log(`  + ${item.name}`);
        passed++;
      } catch (err) {
        console.log(`  - ${item.name}`);
        console.log(`    Error: ${err.message}`);
        failed++;
      }
    }
  }
  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Helper: inject mock DB into service ──────────────────────────────────
function loadFreshService(serviceName, dbMock) {
  const dbKey = require.resolve('../src/config/database');
  const original = require.cache[dbKey];
  require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: dbMock };
  delete require.cache[require.resolve(`../src/services/${serviceName}`)];
  const svc = require(`../src/services/${serviceName}`);
  require.cache[dbKey] = original;
  delete require.cache[require.resolve(`../src/services/${serviceName}`)];
  return svc;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
const BOT_ROW = {
  robot_id: 'robot-uuid-1',
  name: 'voyager_bot_1',
  display_name: 'Voyager Bot 1',
};
const EPISODE_ROW = {
  id: 'ep-uuid-1',
  title: 'Session: Mine wood',
  success: true,
  created_at: '2026-03-17T10:00:00Z',
};
const HEARTBEAT_JSON = JSON.stringify({
  robot_id: 'robot-uuid-1',
  current_task: 'Mine iron ore',
  current_iteration: 7,
  skills_count: 14,
  mc_connected: true,
  reported_at: '2026-03-17T12:34:00Z',
});

function makeDbMock({ bots = [BOT_ROW], lastEpisode = EPISODE_ROW } = {}) {
  return {
    queryAll: async (sql) => {
      if (sql.includes("'voyager-minecraft'")) return bots;
      return [];
    },
    queryOne: async (sql) => {
      if (sql.includes('FROM episodes')) return lastEpisode;
      return null;
    },
    transaction: async () => null,
  };
}

// ─── VoyagerStatusService — getStatus() ───────────────────────────────────

describe('VoyagerStatusService - getStatus()', () => {
  test('returns bots array and queried_at', async () => {
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(null);
    assert(Array.isArray(result.bots), 'bots should be an array');
    assert(typeof result.queried_at === 'string', 'queried_at should be a string');
    assertEqual(result.bots.length, 1, 'should have 1 bot');
  });

  test('alive: true and fields populated when Redis key exists', async () => {
    const mockRedis = {
      keys: async () => ['voyager:status:robot-uuid-1'],
      mget: async () => [HEARTBEAT_JSON],
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(mockRedis);
    assertEqual(result.bots[0].alive, true, 'alive should be true when Redis key present');
    assertEqual(result.bots[0].current_task, 'Mine iron ore', 'current_task should be populated');
    assertEqual(result.bots[0].mc_connected, true, 'mc_connected should be true');
    assertEqual(result.bots[0].skills_count, 14, 'skills_count should be populated');
    assertEqual(result.bots[0].current_iteration, 7, 'current_iteration should be populated');
  });

  test('alive: false and nulls when Redis key absent', async () => {
    const mockRedis = {
      keys: async () => [],
      mget: async () => [],
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(mockRedis);
    assertEqual(result.bots[0].alive, false, 'alive should be false when no Redis key');
    assertEqual(result.bots[0].current_task, null, 'current_task should be null');
    assertEqual(result.bots[0].mc_connected, null, 'mc_connected should be null');
  });

  test('alive: false for all bots when Redis throws', async () => {
    const brokenRedis = {
      keys: async () => { throw new Error('Redis connection refused'); },
      mget: async () => [],
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(brokenRedis);
    assertEqual(result.bots[0].alive, false, 'alive should be false when Redis throws');
    assert(Array.isArray(result.bots), 'should still return bots array');
  });

  test('alive: false when redis is null (not configured)', async () => {
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(null);
    assertEqual(result.bots[0].alive, false, 'alive should be false when redis is null');
  });

  test('last_episode populated from PostgreSQL even when Redis throws', async () => {
    const brokenRedis = {
      keys: async () => { throw new Error('connection refused'); },
      mget: async () => [],
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    const result = await VoyagerStatusService.getStatus(brokenRedis);
    assert(result.bots[0].last_episode !== null, 'last_episode should still come from DB');
    assertEqual(result.bots[0].last_episode.id, 'ep-uuid-1');
    assertEqual(result.bots[0].last_episode.success, true);
  });

  test('last_episode is null when bot has no episodes', async () => {
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock({ lastEpisode: null }));
    const result = await VoyagerStatusService.getStatus(null);
    assertEqual(result.bots[0].last_episode, null, 'last_episode should be null');
  });

  test('uses model = voyager-minecraft filter for bot discovery', async () => {
    let capturedSql = '';
    const dbMock = {
      queryAll: async (sql) => { capturedSql = sql; return [BOT_ROW]; },
      queryOne: async () => null,
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', dbMock);
    await VoyagerStatusService.getStatus(null);
    assert(capturedSql.includes("'voyager-minecraft'"), 'query must filter by model = voyager-minecraft');
  });

  test('returns empty bots array when no voyager bots registered', async () => {
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock({ bots: [] }));
    const result = await VoyagerStatusService.getStatus(null);
    assertEqual(result.bots.length, 0, 'bots should be empty when none registered');
  });
});

// ─── VoyagerStatusService — recordHeartbeat() ─────────────────────────────

describe('VoyagerStatusService - recordHeartbeat()', () => {
  test('writes Redis key voyager:status:<robot_id> with TTL 300', async () => {
    let writtenKey, writtenValue, writtenEx, writtenTtl;
    const mockRedis = {
      set: async (key, value, ex, ttl) => {
        writtenKey = key;
        writtenValue = value;
        writtenEx = ex;
        writtenTtl = ttl;
      },
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    await VoyagerStatusService.recordHeartbeat(mockRedis, {
      robotId: 'robot-uuid-1',
      currentTask: 'Mine iron',
      currentIteration: 5,
      skillsCount: 10,
      mcConnected: true,
      reportedAt: '2026-03-17T12:00:00Z',
    });
    assertEqual(writtenKey, 'voyager:status:robot-uuid-1', 'key should be voyager:status:<robot_id>');
    assertEqual(writtenEx, 'EX', 'expiry flag should be EX');
    assertEqual(writtenTtl, 300, 'TTL should be 300 seconds');
    const parsed = JSON.parse(writtenValue);
    assertEqual(parsed.robot_id, 'robot-uuid-1');
    assertEqual(parsed.current_task, 'Mine iron');
    assertEqual(parsed.mc_connected, true);
  });

  test('is a no-op when redis is null', async () => {
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    // Must not throw
    await VoyagerStatusService.recordHeartbeat(null, {
      robotId: 'robot-uuid-1',
      currentTask: 'Mine wood',
      reportedAt: '2026-03-17T12:00:00Z',
    });
  });

  test('is silent when Redis.set throws', async () => {
    const brokenRedis = {
      set: async () => { throw new Error('Redis down'); },
    };
    const VoyagerStatusService = loadFreshService('VoyagerStatusService', makeDbMock());
    let threw = false;
    try {
      await VoyagerStatusService.recordHeartbeat(brokenRedis, {
        robotId: 'robot-uuid-1',
        currentTask: 'Mine wood',
        reportedAt: '2026-03-17T12:00:00Z',
      });
    } catch {
      threw = true;
    }
    assert(!threw, 'recordHeartbeat must not throw when Redis fails');
  });
});

// ─── HTTP route tests ──────────────────────────────────────────────────────

describe('GET /api/v1/voyager/status', () => {
  const express = require('express');
  const http = require('http');

  function makeStatusApp(statusServiceMock) {
    const app = express();
    app.use(express.json());

    app.get('/api/v1/voyager/status', async (req, res, next) => {
      try {
        const data = await statusServiceMock.getStatus(null);
        res.json({ success: true, ...data });
      } catch (err) {
        next(err);
      }
    });

    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    return app;
  }

  function httpGet(port, path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`JSON parse error: ${data}`)); }
        });
      }).on('error', reject);
    });
  }

  test('returns 200 with bots array and queried_at', async () => {
    const mockService = {
      getStatus: async () => ({
        bots: [{
          robot_id: 'r1', name: 'voyager_bot_1', alive: true,
          mc_connected: true, current_task: 'Mine wood',
          current_iteration: 3, skills_count: 5,
          last_heartbeat: '2026-03-17T12:00:00Z', last_episode: null,
        }],
        queried_at: '2026-03-17T12:00:30Z',
      }),
    };
    const app = makeStatusApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/api/v1/voyager/status');
    server.close();

    assertEqual(result.status, 200, 'should return 200');
    assert(Array.isArray(result.body.bots), 'body.bots should be an array');
    assert(typeof result.body.queried_at === 'string', 'queried_at should be present');
    assertEqual(result.body.bots[0].alive, true);
    assertEqual(result.body.bots[0].current_task, 'Mine wood');
  });

  test('returns 200 with alive: false bots and last_episode from DB when Redis is down', async () => {
    const mockService = {
      getStatus: async () => ({
        bots: [{
          robot_id: 'r1', name: 'voyager_bot_1', alive: false,
          mc_connected: null, current_task: null,
          current_iteration: null, skills_count: null,
          last_heartbeat: null,
          last_episode: { id: 'ep-1', title: 'Old session', success: true, created_at: '2026-03-17T10:00:00Z' },
        }],
        queried_at: '2026-03-17T12:00:30Z',
      }),
    };
    const app = makeStatusApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/api/v1/voyager/status');
    server.close();

    assertEqual(result.status, 200, 'should return 200 even when all bots offline');
    assertEqual(result.body.bots[0].alive, false);
    assert(result.body.bots[0].last_episode !== null, 'last_episode should still come from DB');
  });
});

describe('POST /api/v1/voyager/heartbeat', () => {
  const express = require('express');
  const http = require('http');
  const { UnauthorizedError, BadRequestError } = require('../src/utils/errors');

  function makeHeartbeatApp(agentId, statusServiceMock) {
    const app = express();
    app.use(express.json());

    app.post('/api/v1/voyager/heartbeat', async (req, res, next) => {
      if (!agentId) {
        return next(new UnauthorizedError('No authorization token provided'));
      }
      try {
        const { robot_id, current_task, current_iteration, skills_count, mc_connected } = req.body;
        if (!robot_id) {
          return next(new BadRequestError('robot_id is required'));
        }
        await statusServiceMock.recordHeartbeat(null, {
          robotId: robot_id,
          currentTask: current_task ?? null,
          currentIteration: current_iteration ?? null,
          skillsCount: skills_count ?? null,
          mcConnected: Boolean(mc_connected),
          reportedAt: new Date().toISOString(),
        });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    });

    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });

    return app;
  }

  function httpPost(port, path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: 'localhost', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      };
      const req = http.request(options, res => {
        let buf = '';
        res.on('data', chunk => { buf += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  test('returns 401 without auth', async () => {
    const app = makeHeartbeatApp(null, {});
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpPost(port, '/api/v1/voyager/heartbeat', { robot_id: 'r1' });
    server.close();
    assertEqual(result.status, 401, 'should return 401 without auth');
  });

  test('returns 204 on valid payload with auth', async () => {
    const mockService = { recordHeartbeat: async () => {} };
    const app = makeHeartbeatApp('agent-uuid', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpPost(port, '/api/v1/voyager/heartbeat', {
      robot_id: 'robot-uuid-1',
      current_task: 'Mine iron ore',
      current_iteration: 7,
      skills_count: 14,
      mc_connected: true,
    });
    server.close();
    assertEqual(result.status, 204, 'should return 204 on success');
  });

  test('returns 204 when Redis is unavailable (fire-and-forget)', async () => {
    // recordHeartbeat swallows errors internally; route always returns 204
    const mockService = { recordHeartbeat: async () => {} };
    const app = makeHeartbeatApp('agent-uuid', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpPost(port, '/api/v1/voyager/heartbeat', { robot_id: 'robot-uuid-1' });
    server.close();
    assertEqual(result.status, 204, 'should return 204 even when Redis is down');
  });

  test('returns 400 when robot_id is missing', async () => {
    const mockService = { recordHeartbeat: async () => {} };
    const app = makeHeartbeatApp('agent-uuid', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpPost(port, '/api/v1/voyager/heartbeat', { current_task: 'Mine wood' });
    server.close();
    assertEqual(result.status, 400, 'should return 400 when robot_id missing');
  });
});

runTests();
