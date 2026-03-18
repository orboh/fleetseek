/**
 * Analytics API Tests — Community B
 * Run: node test/analytics.test.js
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
  console.log('\nAnalytics API Tests (Community B)\n');
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
const BENCHMARK_ROW_1 = {
  agent_id: 'agent-uuid-1',
  robot_name: 'g1_bot',
  robot_display_name: 'G1 Bot',
  robot_model: 'g1',
  total_episodes: '10',
  success_count: '8',
  success_rate: '0.8',
  avg_completion_rate: '0.85',
};
const BENCHMARK_ROW_2 = {
  agent_id: 'agent-uuid-2',
  robot_name: 'unitree_bot',
  robot_display_name: 'Unitree Bot',
  robot_model: 'unitree_h1',
  total_episodes: '5',
  success_count: '3',
  success_rate: '0.6',
  avg_completion_rate: '0.7',
};

const COMPARE_STATS_ROW = {
  agent_id: 'agent-uuid-1',
  robot_name: 'g1_bot',
  robot_display_name: 'G1 Bot',
  robot_model: 'g1',
  total_episodes: '20',
  success_count: '16',
  success_rate: '0.8',
  avg_completion_rate: '0.85',
};
const COMPARE_TASK_ROW = {
  agent_id: 'agent-uuid-1',
  task_name: 'box_stacking',
  count: '12',
  success_count: '10',
};

const TREND_ROW = {
  day: '2026-03-17T00:00:00.000Z',
  total: '5',
  success_count: '4',
  avg_completion_rate: '0.9',
};

// ─── AnalyticsService — getBenchmarks() ───────────────────────────────────

describe('AnalyticsService - getBenchmarks()', () => {
  test('returns ranked list when data exists', async () => {
    const dbMock = {
      queryAll: async () => [BENCHMARK_ROW_1, BENCHMARK_ROW_2],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    const result = await AnalyticsService.getBenchmarks({ taskName: 'box_stacking' });
    assertEqual(result.task_name, 'box_stacking', 'task_name should be set');
    assert(Array.isArray(result.robots), 'robots should be an array');
    assertEqual(result.robots.length, 2, 'should have 2 robots');
    assert('agent_id' in result.robots[0], 'robot should have agent_id');
    assert('success_rate' in result.robots[0], 'robot should have success_rate');
  });

  test('returns empty robots array when no data', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    const result = await AnalyticsService.getBenchmarks({ taskName: 'nonexistent_task' });
    assert(Array.isArray(result.robots), 'robots should be an array');
    assertEqual(result.robots.length, 0, 'robots should be empty');
  });

  test('throws BadRequestError when taskName missing', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    let threw = false;
    try {
      await AnalyticsService.getBenchmarks({});
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown');
  });
});

// ─── AnalyticsService — compareRobots() ───────────────────────────────────

describe('AnalyticsService - compareRobots()', () => {
  test('returns robots with aggregates and top_tasks', async () => {
    let callCount = 0;
    const dbMock = {
      queryAll: async () => {
        callCount++;
        if (callCount === 1) return [COMPARE_STATS_ROW];
        return [COMPARE_TASK_ROW];
      },
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    const result = await AnalyticsService.compareRobots(['agent-uuid-1']);
    assert(Array.isArray(result.robots), 'robots should be an array');
    assertEqual(result.robots.length, 1, 'should have 1 robot');
    assert(Array.isArray(result.robots[0].top_tasks), 'top_tasks should be an array');
    assertEqual(callCount, 2, 'should call queryAll twice');
  });

  test('throws BadRequestError when more than 5 IDs provided', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    let threw = false;
    try {
      await AnalyticsService.compareRobots(['a', 'b', 'c', 'd', 'e', 'f']);
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown');
  });

  test('throws BadRequestError when empty ids', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    let threw = false;
    try {
      await AnalyticsService.compareRobots([]);
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown');
  });
});

// ─── AnalyticsService — getTrends() ───────────────────────────────────────

describe('AnalyticsService - getTrends()', () => {
  test('returns time-series data', async () => {
    const dbMock = {
      queryAll: async () => [TREND_ROW],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    const result = await AnalyticsService.getTrends({ category: 'manipulation' });
    assertEqual(result.category, 'manipulation', 'category should be set');
    assert(typeof result.period === 'string', 'period should be a string');
    assert(typeof result.period_days === 'number', 'period_days should be a number');
    assert(Array.isArray(result.data), 'data should be an array');
    assertEqual(result.data.length, 1, 'should have 1 row');
  });

  test('returns empty data array when no rows', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    const result = await AnalyticsService.getTrends({ category: 'locomotion' });
    assert(Array.isArray(result.data), 'data should be an array');
    assertEqual(result.data.length, 0, 'data should be empty');
  });

  test('throws BadRequestError for invalid period', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    let threw = false;
    try {
      await AnalyticsService.getTrends({ category: 'manipulation', period: '14d' });
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown');
  });

  test('throws BadRequestError when category missing', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const AnalyticsService = loadFreshService('AnalyticsService', dbMock);
    let threw = false;
    try {
      await AnalyticsService.getTrends({});
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown');
  });
});

// ─── HTTP route tests ──────────────────────────────────────────────────────

describe('Analytics Routes', () => {
  const express = require('express');
  const http = require('http');
  const { Router } = express;
  const { asyncHandler } = require('../src/middleware/errorHandler');
  const { success } = require('../src/utils/response');
  const { BadRequestError } = require('../src/utils/errors');

  function makeAnalyticsApp(mockService) {
    const app = express();
    app.use(express.json());

    const router = Router();

    router.get('/benchmarks', asyncHandler(async (req, res) => {
      const taskName = req.query.task_name;
      const minEpisodes = req.query.min_episodes ? parseInt(req.query.min_episodes, 10) : 3;
      const data = await mockService.getBenchmarks({ taskName, minEpisodes });
      success(res, data);
    }));

    router.get('/robots/compare', asyncHandler(async (req, res) => {
      const ids = req.query.ids ? req.query.ids.split(',').map(s => s.trim()).filter(Boolean) : [];
      const data = await mockService.compareRobots(ids);
      success(res, data);
    }));

    router.get('/trends', asyncHandler(async (req, res) => {
      const { category, period } = req.query;
      const data = await mockService.getTrends({ category, period });
      success(res, data);
    }));

    app.use('/analytics', router);

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

  test('GET /analytics/benchmarks returns 400 without task_name', async () => {
    const mockService = {
      getBenchmarks: async ({ taskName }) => {
        if (!taskName) throw new BadRequestError('task_name is required');
        return { task_name: taskName, robots: [] };
      },
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/benchmarks');
    server.close();
    assertEqual(result.status, 400, 'should return 400 without task_name');
  });

  test('GET /analytics/benchmarks?task_name=box_stacking returns 200 with {task_name, robots}', async () => {
    const mockService = {
      getBenchmarks: async ({ taskName }) => ({
        task_name: taskName,
        robots: [{ agent_id: 'a1', robot_name: 'bot', success_rate: '0.8' }],
      }),
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/benchmarks?task_name=box_stacking');
    server.close();
    assertEqual(result.status, 200, 'should return 200');
    assertEqual(result.body.task_name, 'box_stacking', 'task_name should be set');
    assert(Array.isArray(result.body.robots), 'robots should be an array');
  });

  test('GET /analytics/robots/compare returns 400 without ids', async () => {
    const mockService = {
      compareRobots: async (ids) => {
        if (!ids || ids.length === 0) throw new BadRequestError('ids is required');
        return { robots: [] };
      },
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/robots/compare');
    server.close();
    assertEqual(result.status, 400, 'should return 400 without ids');
  });

  test('GET /analytics/robots/compare?ids=uuid1 returns 200', async () => {
    const mockService = {
      compareRobots: async (ids) => ({ robots: ids.map(id => ({ agent_id: id, top_tasks: [] })) }),
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/robots/compare?ids=uuid1');
    server.close();
    assertEqual(result.status, 200, 'should return 200');
    assert(Array.isArray(result.body.robots), 'robots should be an array');
  });

  test('GET /analytics/trends returns 400 without category', async () => {
    const mockService = {
      getTrends: async ({ category }) => {
        if (!category) throw new BadRequestError('category is required');
        return { category, period: '7d', period_days: 7, data: [] };
      },
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/trends');
    server.close();
    assertEqual(result.status, 400, 'should return 400 without category');
  });

  test('GET /analytics/trends?category=manipulation returns 200', async () => {
    const mockService = {
      getTrends: async ({ category, period = '7d' }) => ({
        category,
        period,
        period_days: 7,
        data: [],
      }),
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/trends?category=manipulation');
    server.close();
    assertEqual(result.status, 200, 'should return 200');
    assertEqual(result.body.category, 'manipulation', 'category should be set');
  });

  test('GET /analytics/trends?category=manipulation&period=14d returns 400', async () => {
    const mockService = {
      getTrends: async ({ category, period }) => {
        const allowed = { '7d': 7, '30d': 30, '90d': 90 };
        if (!allowed[period || '7d']) throw new BadRequestError('period must be one of 7d, 30d, 90d');
        return { category, period: period || '7d', period_days: allowed[period || '7d'], data: [] };
      },
    };
    const app = makeAnalyticsApp(mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpGet(port, '/analytics/trends?category=manipulation&period=14d');
    server.close();
    assertEqual(result.status, 400, 'should return 400 for invalid period');
  });
});

runTests();
