/**
 * Health Check Tests — Community C
 * Run: node test/health.test.js
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
  console.log('\nHealth Check Tests (Community C)\n');
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

// ─── HTTP helpers ──────────────────────────────────────────────────────────
const http = require('http');
const express = require('express');

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

function makeHealthApp(dbMock, redisMock) {
  // Temporarily override require cache for database module
  const dbKey = require.resolve('../src/config/database');
  const origDb = require.cache[dbKey];
  require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: dbMock };

  delete require.cache[require.resolve('../src/routes/health')];
  const healthRoute = require('../src/routes/health');

  require.cache[dbKey] = origDb;
  delete require.cache[require.resolve('../src/routes/health')];

  const app = express();
  app.use(express.json());

  // Inject redis mock via request-scoped getter
  app.use((req, _res, next) => {
    req._redisForHealth = redisMock;
    next();
  });

  // Re-load with injected db
  const dbKey2 = require.resolve('../src/config/database');
  const orig2 = require.cache[dbKey2];
  require.cache[dbKey2] = { id: dbKey2, filename: dbKey2, loaded: true, exports: dbMock };
  delete require.cache[require.resolve('../src/routes/health')];
  const freshRoute = require('../src/routes/health');
  require.cache[dbKey2] = orig2;
  delete require.cache[require.resolve('../src/routes/health')];

  app.get('/health', (req, res, next) => {
    req._redisForHealth = redisMock;
    freshRoute(req, res, next);
  });

  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  return app;
}

// ─── HealthService unit tests ─────────────────────────────────────────────

describe('HealthService', () => {
  function loadFreshHealthService(dbMock) {
    const dbKey = require.resolve('../src/config/database');
    const orig = require.cache[dbKey];
    require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: dbMock };
    delete require.cache[require.resolve('../src/services/HealthService')];
    const svc = require('../src/services/HealthService');
    require.cache[dbKey] = orig;
    delete require.cache[require.resolve('../src/services/HealthService')];
    return svc;
  }

  test('returns status: ok when DB and Redis are healthy', async () => {
    const dbMock = { healthCheck: async () => true };
    const redisMock = { ping: async () => 'PONG' };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(redisMock);
    assertEqual(result.status, 'ok');
    assertEqual(result.db, 'ok');
    assertEqual(result.redis, 'ok');
    assert(typeof result.timestamp === 'string', 'timestamp should be a string');
  });

  test('returns status: degraded when Redis is unavailable', async () => {
    const dbMock = { healthCheck: async () => true };
    const redisMock = { ping: async () => { throw new Error('Redis down'); } };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(redisMock);
    assertEqual(result.status, 'degraded');
    assertEqual(result.db, 'ok');
    assertEqual(result.redis, 'unavailable');
  });

  test('returns status: degraded when redis is null', async () => {
    const dbMock = { healthCheck: async () => true };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(null);
    assertEqual(result.status, 'degraded');
    assertEqual(result.redis, 'unavailable');
  });

  test('returns status: error when DB is unavailable', async () => {
    const dbMock = { healthCheck: async () => false };
    const redisMock = { ping: async () => 'PONG' };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(redisMock);
    assertEqual(result.status, 'error');
    assertEqual(result.db, 'unavailable');
  });

  test('returns status: error when DB throws', async () => {
    const dbMock = { healthCheck: async () => { throw new Error('DB connection refused'); } };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(null);
    assertEqual(result.status, 'error');
    assertEqual(result.db, 'unavailable');
  });

  test('response always includes timestamp', async () => {
    const dbMock = { healthCheck: async () => true };
    const HealthService = loadFreshHealthService(dbMock);
    const result = await HealthService.check(null);
    assert(typeof result.timestamp === 'string', 'timestamp must be present');
    assert(result.timestamp.includes('T'), 'timestamp should be ISO format');
  });
});

// ─── GET /health HTTP tests ───────────────────────────────────────────────

describe('GET /health HTTP endpoint', () => {
  function loadRoute(dbMock) {
    const dbKey = require.resolve('../src/config/database');
    const orig = require.cache[dbKey];
    require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: dbMock };
    delete require.cache[require.resolve('../src/services/HealthService')];
    delete require.cache[require.resolve('../src/routes/health')];
    const route = require('../src/routes/health');
    require.cache[dbKey] = orig;
    delete require.cache[require.resolve('../src/services/HealthService')];
    delete require.cache[require.resolve('../src/routes/health')];
    return route;
  }

  function makeApp(dbMock, redisMock) {
    const route = loadRoute(dbMock);
    const app = express();
    app.use(express.json());
    // Inject redis into route via closure
    app.get('/health', (req, res, next) => {
      req._redis = redisMock ?? null;
      route(req, res, next);
    });
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
    return app;
  }

  test('returns 200 with status: ok when DB and Redis healthy', async () => {
    const dbMock = { healthCheck: async () => true };
    const redisMock = { ping: async () => 'PONG' };
    const app = makeApp(dbMock, redisMock);
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();
    const result = await httpGet(port, '/health');
    server.close();
    assertEqual(result.status, 200, 'should return 200 when healthy');
    assertEqual(result.body.status, 'ok');
    assertEqual(result.body.db, 'ok');
    assertEqual(result.body.redis, 'ok');
  });

  test('returns 200 with status: degraded when Redis unavailable', async () => {
    const dbMock = { healthCheck: async () => true };
    const redisMock = { ping: async () => { throw new Error('Redis down'); } };
    const app = makeApp(dbMock, redisMock);
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();
    const result = await httpGet(port, '/health');
    server.close();
    assertEqual(result.status, 200, 'degraded should still return 200');
    assertEqual(result.body.status, 'degraded');
    assertEqual(result.body.redis, 'unavailable');
  });

  test('returns 503 when DB unavailable', async () => {
    const dbMock = { healthCheck: async () => false };
    const app = makeApp(dbMock, null);
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();
    const result = await httpGet(port, '/health');
    server.close();
    assertEqual(result.status, 503, 'DB failure should return 503');
    assertEqual(result.body.status, 'error');
    assertEqual(result.body.db, 'unavailable');
  });

  test('response body includes timestamp', async () => {
    const dbMock = { healthCheck: async () => true };
    const app = makeApp(dbMock, null);
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const { port } = server.address();
    const result = await httpGet(port, '/health');
    server.close();
    assert(typeof result.body.timestamp === 'string', 'timestamp should be present');
  });
});

runTests();
