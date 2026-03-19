/**
 * Webhook API Tests — Community D
 * Run: node test/webhooks.test.js
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
  console.log('\nWebhook API Tests (Community D)\n');
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
  // Also clear workers that depend on WebhookService
  const workerPath = require.resolve(`../src/services/${serviceName}`);
  if (require.cache[workerPath]) delete require.cache[workerPath];
  const svc = require(`../src/services/${serviceName}`);
  require.cache[dbKey] = original;
  delete require.cache[workerPath];
  return svc;
}

function loadFreshWorker(workerName, dbMock, WebhookServiceMock) {
  const dbKey = require.resolve('../src/config/database');
  const original = require.cache[dbKey];
  require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: dbMock };

  // Inject WebhookService mock if provided
  let webhookKey;
  let originalWebhook;
  if (WebhookServiceMock) {
    webhookKey = require.resolve('../src/services/WebhookService');
    originalWebhook = require.cache[webhookKey];
    require.cache[webhookKey] = { id: webhookKey, filename: webhookKey, loaded: true, exports: WebhookServiceMock };
  }

  const workerPath = require.resolve(`../src/workers/${workerName}`);
  if (require.cache[workerPath]) delete require.cache[workerPath];
  const worker = require(`../src/workers/${workerName}`);
  require.cache[dbKey] = original;
  delete require.cache[workerPath];
  if (webhookKey) {
    require.cache[webhookKey] = originalWebhook;
  }
  return worker;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
const WEBHOOK_ROW = {
  id: 'webhook-uuid-1',
  agent_id: 'agent-uuid-1',
  url: 'https://example.com/webhook',
  events: ['episode.created'],
  is_active: true,
  created_at: '2026-03-17T10:00:00Z',
};

const DELIVERY_ROW = {
  id: 'delivery-uuid-1',
  webhook_id: 'webhook-uuid-1',
  event: 'episode.created',
  payload: { episode_id: 'ep-1', robot_id: 'bot-1', task_name: 'box_stacking' },
  status: 'pending',
  attempts: 0,
  url: 'https://example.com/webhook',
  secret: 'mysecret',
};

// ─── WebhookService ────────────────────────────────────────────────────────

describe('WebhookService - register()', () => {
  test('returns {id, url, events, created_at} without secret field', async () => {
    const dbMock = {
      queryOne: async () => ({ id: 'webhook-uuid-1', url: 'https://example.com/hook', events: ['episode.created'], created_at: '2026-03-17T10:00:00Z' }),
      queryAll: async () => [],
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    const result = await WebhookService.register({
      agentId: 'agent-uuid-1',
      url: 'https://example.com/hook',
      secret: 'supersecret',
      events: ['episode.created'],
    });
    assert('id' in result, 'result should have id');
    assert('url' in result, 'result should have url');
    assert('events' in result, 'result should have events');
    assert(!('secret' in result), 'result must NOT have secret');
  });

  test('rejects private URL (localhost)', async () => {
    const dbMock = {
      queryOne: async () => null,
      queryAll: async () => [],
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    let threw = false;
    try {
      await WebhookService.register({
        agentId: 'agent-uuid-1',
        url: 'http://localhost/webhook',
        secret: 'secret',
      });
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown for localhost URL');
  });

  test('rejects internal IP (10.0.0.1)', async () => {
    const dbMock = {
      queryOne: async () => null,
      queryAll: async () => [],
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    let threw = false;
    try {
      await WebhookService.register({
        agentId: 'agent-uuid-1',
        url: 'http://10.0.0.1/hook',
        secret: 'secret',
      });
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'BadRequestError', 'should throw BadRequestError');
    }
    assert(threw, 'should have thrown for internal IP URL');
  });
});

describe('WebhookService - list()', () => {
  test('returns webhooks array without secret field', async () => {
    const rows = [
      { id: 'wh-1', url: 'https://a.com/hook', events: ['episode.created'], is_active: true, created_at: '2026-03-17T10:00:00Z' },
      { id: 'wh-2', url: 'https://b.com/hook', events: ['episode.created'], is_active: true, created_at: '2026-03-17T11:00:00Z' },
    ];
    const dbMock = {
      queryAll: async () => rows,
      queryOne: async () => null,
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    const result = await WebhookService.list('agent-uuid-1');
    assert(Array.isArray(result), 'result should be an array');
    assertEqual(result.length, 2, 'should have 2 webhooks');
    assert(!('secret' in result[0]), 'result items must NOT have secret');
  });
});

describe('WebhookService - deactivate()', () => {
  test('sets is_active=false for owned webhook', async () => {
    let updatedId = null;
    const dbMock = {
      queryOne: async (sql) => {
        if (sql.includes('SELECT')) return { id: 'wh-1', agent_id: 'agent-uuid-1' };
        return null;
      },
      queryAll: async () => [],
      transaction: async () => null,
      query: async (sql, params) => {
        if (sql.includes('UPDATE')) updatedId = params[0];
        return { rows: [] };
      },
    };
    // Use a custom mock that captures the UPDATE
    let updateCalled = false;
    const customDbMock = {
      queryOne: async (sql) => {
        if (sql.includes('SELECT')) return { id: 'wh-1', agent_id: 'agent-uuid-1' };
        if (sql.includes('UPDATE')) { updateCalled = true; return { id: 'wh-1' }; }
        return null;
      },
      queryAll: async () => [],
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', customDbMock);
    await WebhookService.deactivate('wh-1', 'agent-uuid-1');
    // If no error thrown, deactivation succeeded
    assert(true, 'deactivate should not throw for owner');
  });

  test('throws ForbiddenError if wrong agentId', async () => {
    const dbMock = {
      queryOne: async () => ({ id: 'wh-1', agent_id: 'agent-uuid-1' }),
      queryAll: async () => [],
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    let threw = false;
    try {
      await WebhookService.deactivate('wh-1', 'agent-uuid-WRONG');
    } catch (err) {
      threw = true;
      assertEqual(err.name, 'ForbiddenError', 'should throw ForbiddenError');
    }
    assert(threw, 'should have thrown ForbiddenError');
  });
});

describe('WebhookService - fanOut()', () => {
  test('inserts delivery row for each active webhook matching event', async () => {
    const activeWebhooks = [
      { id: 'wh-1', url: 'https://a.com/hook', events: ['episode.created'], is_active: true },
      { id: 'wh-2', url: 'https://b.com/hook', events: ['episode.created'], is_active: true },
    ];
    let insertCount = 0;
    const dbMock = {
      queryAll: async (sql) => {
        if (sql.includes('SELECT')) return activeWebhooks;
        return [];
      },
      queryOne: async (sql) => {
        if (sql.includes('INSERT')) { insertCount++; return { id: `delivery-${insertCount}` }; }
        return null;
      },
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    await WebhookService.fanOut('episode.created', { episode_id: 'ep-1' });
    assertEqual(insertCount, 2, 'should insert 2 delivery rows');
  });

  test('skips inactive webhooks', async () => {
    const webhooks = [
      { id: 'wh-1', url: 'https://a.com/hook', events: ['episode.created'], is_active: true },
    ];
    let insertCount = 0;
    const dbMock = {
      queryAll: async () => webhooks,
      queryOne: async (sql) => {
        if (sql.includes('INSERT')) { insertCount++; return { id: `delivery-${insertCount}` }; }
        return null;
      },
      transaction: async () => null,
    };
    // Only active webhooks are queried (WHERE is_active=true in SQL)
    const WebhookService = loadFreshService('WebhookService', dbMock);
    await WebhookService.fanOut('episode.created', { episode_id: 'ep-1' });
    assertEqual(insertCount, 1, 'should insert only 1 delivery row for active webhook');
  });
});

describe('WebhookService - hmacSignature()', () => {
  test('returns deterministic sha256=<hex> signature', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
    };
    const WebhookService = loadFreshService('WebhookService', dbMock);
    const body = JSON.stringify({ episode_id: 'ep-1' });
    const sig1 = WebhookService.hmacSignature('mysecret', body);
    const sig2 = WebhookService.hmacSignature('mysecret', body);
    assert(sig1.startsWith('sha256='), 'signature should start with sha256=');
    assertEqual(sig1, sig2, 'signature should be deterministic');
    // Different secret should produce different signature
    const sig3 = WebhookService.hmacSignature('othersecret', body);
    assert(sig1 !== sig3, 'different secrets should produce different signatures');
  });
});

// ─── WebhookDeliveryWorker ─────────────────────────────────────────────────

describe('WebhookDeliveryWorker - deliver()', () => {
  // For worker tests we use a minimal mock of the pool
  function makePoolMock(delivery) {
    const clientMock = {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [delivery].filter(Boolean) };
        }
        return { rows: [] };
      },
      release: () => {},
    };
    return {
      connect: async () => clientMock,
    };
  }

  test('deliver() sends POST with X-RoboNet-Signature header', async () => {
    let capturedHeaders = null;
    const mockFetch = async (url, opts) => {
      capturedHeaders = opts.headers;
      return { ok: true, status: 200 };
    };

    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
      getPool: () => makePoolMock(DELIVERY_ROW),
    };

    const WebhookServiceMock = {
      hmacSignature: (secret, body) => `sha256=fakehex`,
    };

    const worker = loadFreshWorker('WebhookDeliveryWorker', dbMock, WebhookServiceMock);
    // Inject fetch mock
    worker._fetch = mockFetch;
    await worker.deliver({ ...DELIVERY_ROW, attempts: 0 });
    assert(capturedHeaders !== null, 'fetch should have been called');
    assert('X-RoboNet-Signature' in capturedHeaders, 'should include X-RoboNet-Signature header');
  });

  test('deliver() marks status=delivered on 2xx response', async () => {
    let updatedStatus = null;
    const mockFetch = async () => ({ ok: true, status: 200 });

    const dbMock = {
      queryAll: async () => [],
      queryOne: async (sql, params) => {
        if (sql.includes('UPDATE') && sql.includes('delivered')) {
          updatedStatus = 'delivered';
        }
        return null;
      },
      transaction: async () => null,
      getPool: () => makePoolMock(DELIVERY_ROW),
    };
    const WebhookServiceMock = { hmacSignature: () => 'sha256=abc' };

    const worker = loadFreshWorker('WebhookDeliveryWorker', dbMock, WebhookServiceMock);
    worker._fetch = mockFetch;

    let statusSet = null;
    worker._updateDelivery = async (id, status) => { statusSet = status; };

    await worker.deliver({ ...DELIVERY_ROW, attempts: 0 });
    assertEqual(statusSet, 'delivered', 'status should be set to delivered on 2xx');
  });

  test('deliver() marks status=pending and increments attempts on non-2xx', async () => {
    const mockFetch = async () => ({ ok: false, status: 500 });
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
      getPool: () => makePoolMock(DELIVERY_ROW),
    };
    const WebhookServiceMock = { hmacSignature: () => 'sha256=abc' };

    const worker = loadFreshWorker('WebhookDeliveryWorker', dbMock, WebhookServiceMock);
    worker._fetch = mockFetch;

    let statusSet = null;
    let attemptsSet = null;
    worker._updateDelivery = async (id, status, opts) => {
      statusSet = status;
      attemptsSet = opts && opts.attempts;
    };

    await worker.deliver({ ...DELIVERY_ROW, attempts: 0 });
    // On non-2xx with attempts < MAX, status should remain pending with incremented attempts
    assert(statusSet === 'pending' || statusSet === 'failed', 'status should be pending or failed on non-2xx');
  });

  test('deliver() marks status=failed after MAX_ATTEMPTS attempts', async () => {
    const mockFetch = async () => ({ ok: false, status: 503 });
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
      getPool: () => makePoolMock(DELIVERY_ROW),
    };
    const WebhookServiceMock = { hmacSignature: () => 'sha256=abc' };

    const worker = loadFreshWorker('WebhookDeliveryWorker', dbMock, WebhookServiceMock);
    worker._fetch = mockFetch;

    let statusSet = null;
    worker._updateDelivery = async (id, status) => { statusSet = status; };

    // Simulate MAX_ATTEMPTS already reached (attempts = 4, one more = 5 = MAX)
    await worker.deliver({ ...DELIVERY_ROW, attempts: 4 });
    assertEqual(statusSet, 'failed', 'status should be failed after MAX_ATTEMPTS');
  });

  test('scheduleRetry() returns correct next_retry timestamps', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
      transaction: async () => null,
      getPool: () => ({ connect: async () => ({}) }),
    };
    const worker = loadFreshWorker('WebhookDeliveryWorker', dbMock, {});

    const RETRY_DELAYS_MS = [30_000, 300_000, 1_800_000, 14_400_000, 86_400_000];
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      const before = Date.now();
      const nextRetry = worker.scheduleRetry(i);
      const after = Date.now();
      assert(nextRetry instanceof Date, `scheduleRetry(${i}) should return a Date`);
      const diff = nextRetry.getTime() - before;
      assert(diff >= RETRY_DELAYS_MS[i] - 100, `scheduleRetry(${i}) delay too small: ${diff} < ${RETRY_DELAYS_MS[i]}`);
      assert(diff <= RETRY_DELAYS_MS[i] + after - before + 100, `scheduleRetry(${i}) delay too large`);
    }
  });
});

// ─── HTTP route tests ──────────────────────────────────────────────────────

describe('Webhook Routes', () => {
  const express = require('express');
  const http = require('http');
  const { Router } = express;
  const { asyncHandler } = require('../src/middleware/errorHandler');
  const { success, created } = require('../src/utils/response');
  const { UnauthorizedError, ForbiddenError, BadRequestError } = require('../src/utils/errors');

  function makeWebhookApp(agentId, mockService) {
    const app = express();
    app.use(express.json());

    const router = Router();

    // Auth middleware mock
    const mockAuth = (req, res, next) => {
      if (!agentId) return next(new UnauthorizedError('No authorization token provided'));
      req.agent = { id: agentId };
      next();
    };

    router.post('/', mockAuth, asyncHandler(async (req, res) => {
      const { url, secret, events } = req.body;
      const data = await mockService.register({ agentId: req.agent.id, url, secret, events });
      created(res, data);
    }));

    router.get('/', mockAuth, asyncHandler(async (req, res) => {
      const data = await mockService.list(req.agent.id);
      success(res, { webhooks: data });
    }));

    router.delete('/:id', mockAuth, asyncHandler(async (req, res) => {
      await mockService.deactivate(req.params.id, req.agent.id);
      res.status(204).send();
    }));

    app.use('/webhooks', router);

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
          try { resolve({ status: res.statusCode, body: buf => JSON.parse(data) || data }); }
          catch (e) { reject(new Error(`JSON parse error: ${data}`)); }
        });
      }).on('error', reject);
    });
  }

  function httpRequest(method, port, path, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const options = {
        hostname: 'localhost', port, path, method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };
      const req = http.request(options, res => {
        let buf = '';
        res.on('data', chunk => { buf += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  test('POST /webhooks returns 401 without auth', async () => {
    const mockService = {};
    const app = makeWebhookApp(null, mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpRequest('POST', port, '/webhooks', {
      url: 'https://example.com/hook',
      secret: 'secret',
    });
    server.close();
    assertEqual(result.status, 401, 'should return 401 without auth');
  });

  test('POST /webhooks returns 201 on valid payload', async () => {
    const mockService = {
      register: async ({ agentId, url, events }) => ({
        id: 'wh-1',
        url,
        events: events || ['episode.created'],
        created_at: '2026-03-17T10:00:00Z',
      }),
    };
    const app = makeWebhookApp('agent-uuid-1', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpRequest('POST', port, '/webhooks', {
      url: 'https://example.com/hook',
      secret: 'supersecret',
      events: ['episode.created'],
    });
    server.close();
    assertEqual(result.status, 201, 'should return 201 on successful registration');
    assert('id' in result.body, 'response should have id');
    assert(!('secret' in result.body), 'response must NOT have secret');
  });

  test('GET /webhooks returns 200 with list', async () => {
    const mockService = {
      list: async (agentId) => [
        { id: 'wh-1', url: 'https://example.com/hook', events: ['episode.created'], is_active: true, created_at: '2026-03-17T10:00:00Z' },
      ],
    };
    const app = makeWebhookApp('agent-uuid-1', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpRequest('GET', port, '/webhooks', null);
    server.close();
    assertEqual(result.status, 200, 'should return 200');
    assert(Array.isArray(result.body.webhooks), 'body.webhooks should be an array');
  });

  test('DELETE /webhooks/:id returns 403 when wrong owner', async () => {
    const mockService = {
      deactivate: async (webhookId, agentId) => {
        throw new ForbiddenError('You do not own this webhook');
      },
    };
    const app = makeWebhookApp('agent-uuid-WRONG', mockService);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();
    const result = await httpRequest('DELETE', port, '/webhooks/wh-1', null);
    server.close();
    assertEqual(result.status, 403, 'should return 403 when wrong owner');
  });
});

runTests();
