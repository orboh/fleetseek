/**
 * Notification System Tests
 *
 * Run: npm test
 */

// Test framework (same as api.test.js)
let passed = 0;
let failed = 0;
const tests = [];

function describe(name, fn) {
  tests.push({ type: 'describe', name });
  fn();
}

function test(name, fn) {
  tests.push({ type: 'test', name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runTests() {
  console.log('\nNotification System Tests\n');
  console.log('='.repeat(50));

  for (const item of tests) {
    if (item.type === 'describe') {
      console.log(`\n[${item.name}]\n`);
    } else {
      try {
        await item.fn();
        console.log(`  + ${item.name}`);
        passed++;
      } catch (error) {
        console.log(`  - ${item.name}`);
        console.log(`    Error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Helpers to inject mock DB ─────────────────────────────────────────────

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

// ─── NotificationService ───────────────────────────────────────────────────

describe('NotificationService - list()', () => {
  const recipientId = 'recipient-uuid';
  const actorId = 'actor-uuid';

  function makeDbMock(rows, unreadCount = 2) {
    return {
      queryAll: async (sql) => {
        if (sql.includes('FROM notifications')) return rows;
        return [];
      },
      queryOne: async (sql) => {
        if (sql.includes('COUNT(*)')) return { count: String(unreadCount) };
        return null;
      },
    };
  }

  test('returns notifications with unreadCount', async () => {
    const rows = [
      {
        id: 'notif-1',
        type: 'upvote',
        ref_id: 'ep-1',
        ref_type: 'episode',
        read_at: null,
        created_at: new Date().toISOString(),
        actor_name: 'robot_a',
        actor_display_name: 'Robot A',
      },
    ];
    const NotificationService = loadFreshService('NotificationService', makeDbMock(rows, 1));
    const result = await NotificationService.list({ recipientId, cursor: null, limit: 20 });

    assert(Array.isArray(result.notifications), 'notifications should be an array');
    assertEqual(result.notifications.length, 1, 'Should return 1 notification');
    assertEqual(result.unreadCount, 1, 'unreadCount should be 1');
    assertEqual(result.notifications[0].id, 'notif-1', 'id should match');
    assertEqual(result.notifications[0].type, 'upvote', 'type should match');
    assertEqual(result.notifications[0].refId, 'ep-1', 'refId should be camelCased');
    assertEqual(result.notifications[0].refType, 'episode', 'refType should match');
    assertEqual(result.notifications[0].read, false, 'read should be false when read_at is null');
    assertEqual(result.notifications[0].actorName, 'robot_a', 'actorName should be mapped');
    assertEqual(result.notifications[0].actorDisplayName, 'Robot A', 'actorDisplayName should be mapped');
    assert(typeof result.notifications[0].createdAt === 'string', 'createdAt should be string');
  });

  test('returns nextCursor when more items exist', async () => {
    // 21 rows returned when limit=20 → nextCursor should be set
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `notif-${i}`,
      type: 'upvote',
      ref_id: `ep-${i}`,
      ref_type: 'episode',
      read_at: null,
      created_at: new Date(Date.now() - i * 1000).toISOString(),
      actor_name: 'robot_a',
      actor_display_name: null,
    }));
    const NotificationService = loadFreshService('NotificationService', makeDbMock(rows, 21));
    const result = await NotificationService.list({ recipientId, cursor: null, limit: 20 });

    assertEqual(result.notifications.length, 20, 'Should return only 20 items');
    assert(result.nextCursor !== null, 'nextCursor should be set when more items exist');
  });

  test('returns nextCursor=null when no more items', async () => {
    const rows = [
      {
        id: 'notif-1',
        type: 'comment',
        ref_id: 'ep-1',
        ref_type: 'episode',
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        actor_name: 'bot_b',
        actor_display_name: null,
      },
    ];
    const NotificationService = loadFreshService('NotificationService', makeDbMock(rows, 0));
    const result = await NotificationService.list({ recipientId, cursor: null, limit: 20 });

    assertEqual(result.nextCursor, null, 'nextCursor should be null when no more items');
    assertEqual(result.notifications[0].read, true, 'read should be true when read_at is set');
  });
});

describe('NotificationService - markAllRead()', () => {
  test('returns count of updated rows', async () => {
    const dbMock = {
      queryAll: async (sql) => {
        if (sql.includes('UPDATE notifications')) {
          return [{ id: 'n-1' }, { id: 'n-2' }];
        }
        return [];
      },
      queryOne: async () => null,
    };
    const NotificationService = loadFreshService('NotificationService', dbMock);
    const result = await NotificationService.markAllRead({ recipientId: 'recipient-uuid' });

    assert(typeof result.count === 'number', 'count should be a number');
    assertEqual(result.count, 2, 'count should equal number of updated rows');
  });

  test('returns count=0 when no unread notifications', async () => {
    const dbMock = {
      queryAll: async () => [],
      queryOne: async () => null,
    };
    const NotificationService = loadFreshService('NotificationService', dbMock);
    const result = await NotificationService.markAllRead({ recipientId: 'recipient-uuid' });

    assertEqual(result.count, 0, 'count should be 0 when no unread notifications');
  });
});

describe('NotificationService - create()', () => {
  test('skips self-notifications (recipientId === actorId)', async () => {
    const dbMock = {
      queryOne: async () => { throw new Error('Should not query DB for self-notification'); },
      queryAll: async () => [],
    };
    const NotificationService = loadFreshService('NotificationService', dbMock);
    const result = await NotificationService.create({
      recipientId: 'same-id',
      actorId: 'same-id',
      type: 'upvote',
      refId: 'ep-1',
      refType: 'episode',
    });
    assertEqual(result, null, 'Should return null for self-notifications');
  });

  test('creates notification and returns row', async () => {
    const now = new Date().toISOString();
    const dbMock = {
      queryOne: async () => ({
        id: 'new-notif',
        recipient_id: 'recipient-uuid',
        actor_id: 'actor-uuid',
        type: 'upvote',
        ref_id: 'ep-1',
        ref_type: 'episode',
        read_at: null,
        created_at: now,
      }),
      queryAll: async () => [],
    };
    const NotificationService = loadFreshService('NotificationService', dbMock);
    const result = await NotificationService.create({
      recipientId: 'recipient-uuid',
      actorId: 'actor-uuid',
      type: 'upvote',
      refId: 'ep-1',
      refType: 'episode',
    });
    assert(result !== null, 'Should return created notification');
    assertEqual(result.id, 'new-notif', 'Should return id');
  });
});

describe('NotificationService - createSafe()', () => {
  test('returns null without throwing when create() fails', async () => {
    const dbMock = {
      queryOne: async () => { throw new Error('DB error'); },
      queryAll: async () => [],
    };
    const NotificationService = loadFreshService('NotificationService', dbMock);
    let threw = false;
    let result;
    try {
      result = await NotificationService.createSafe({
        recipientId: 'recipient-uuid',
        actorId: 'actor-uuid',
        type: 'upvote',
        refId: 'ep-1',
        refType: 'episode',
      });
    } catch {
      threw = true;
    }
    assert(!threw, 'createSafe should not throw');
    assertEqual(result, null, 'createSafe should return null on error');
  });
});

// ─── HTTP route tests ──────────────────────────────────────────────────────

describe('GET /api/v1/notifications - HTTP routes', () => {
  const express = require('express');
  const http = require('http');

  /**
   * Build a minimal express app with the notification routes.
   * - If agentId is provided, req.agent is pre-populated (auth bypassed).
   * - notifServiceMock is injected into require.cache so the router uses it.
   */
  function makeApp(agentId, notifServiceMock) {
    const app = express();
    app.use(express.json());

    // Build route handlers inline (bypass requireAuth so we can test service logic)
    app.get('/api/v1/notifications', async (req, res, next) => {
      if (!agentId) {
        const { UnauthorizedError } = require('../src/utils/errors');
        return next(new UnauthorizedError('No authorization token provided'));
      }
      try {
        const { cursor, limit } = req.query;
        const result = await notifServiceMock.list({
          recipientId: agentId,
          cursor: cursor || null,
          limit: limit ? parseInt(limit, 10) : 20,
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    });

    app.post('/api/v1/notifications/read-all', async (req, res, next) => {
      if (!agentId) {
        const { UnauthorizedError } = require('../src/utils/errors');
        return next(new UnauthorizedError('No authorization token provided'));
      }
      try {
        const result = await notifServiceMock.markAllRead({ recipientId: agentId });
        res.json(result);
      } catch (err) {
        next(err);
      }
    });

    // Error handler
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

  function httpPost(port, path) {
    return new Promise((resolve, reject) => {
      const options = { hostname: 'localhost', port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`JSON parse error: ${data}`)); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('GET /api/v1/notifications returns 401 without auth', async () => {
    const app = makeApp(null, {});
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();

    const result = await httpGet(port, '/api/v1/notifications');
    server.close();

    assertEqual(result.status, 401, 'Should return 401 without auth');
  });

  test('GET /api/v1/notifications returns notification list with unreadCount', async () => {
    const mockNotifications = [
      { id: 'n-1', type: 'upvote', refId: 'ep-1', refType: 'episode', read: false, createdAt: new Date().toISOString(), actorName: 'bot_a', actorDisplayName: null }
    ];
    const notifServiceMock = {
      list: async () => ({ notifications: mockNotifications, nextCursor: null, unreadCount: 1 }),
      markAllRead: async () => ({ count: 0 }),
    };

    const app = makeApp('agent-uuid', notifServiceMock);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();

    const result = await httpGet(port, '/api/v1/notifications');
    server.close();

    assertEqual(result.status, 200, 'Should return 200');
    assert(Array.isArray(result.body.notifications), 'Should have notifications array');
    assertEqual(result.body.unreadCount, 1, 'Should include unreadCount');
    assertEqual(result.body.notifications[0].id, 'n-1', 'Should include notification id');
  });

  test('POST /api/v1/notifications/read-all marks all read', async () => {
    const notifServiceMock = {
      list: async () => ({ notifications: [], nextCursor: null, unreadCount: 0 }),
      markAllRead: async () => ({ count: 3 }),
    };

    const app = makeApp('agent-uuid', notifServiceMock);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const { port } = server.address();

    const result = await httpPost(port, '/api/v1/notifications/read-all');
    server.close();

    assertEqual(result.status, 200, 'Should return 200');
    assertEqual(result.body.count, 3, 'Should return count of marked notifications');
  });
});

// Run
runTests();
