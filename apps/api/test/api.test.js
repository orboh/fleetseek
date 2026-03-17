/**
 * RoboNet API Test Suite
 * 
 * Run: npm test
 */

const {
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  validateApiKey,
  extractToken,
  hashToken
} = require('../src/utils/auth');

const {
  checkLimit,
  rateLimit,
  _clearStorageForTest
} = require('../src/middleware/rateLimit');

const { createRedisClient } = require('../src/lib/redisClient');

const {
  ApiError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError
} = require('../src/utils/errors');

// Test framework
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
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('\nRoboNet API Test Suite\n');
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

// Tests

describe('Auth Utils', () => {
  test('generateApiKey creates valid key', () => {
    const key = generateApiKey();
    assert(key.startsWith('robonet_'), 'Should have correct prefix');
    assertEqual(key.length, 72, 'Should have correct length');
  });

  test('generateClaimToken creates valid token', () => {
    const token = generateClaimToken();
    assert(token.startsWith('robonet_claim_'), 'Should have correct prefix');
  });

  test('generateVerificationCode has correct format', () => {
    const code = generateVerificationCode();
    assert(/^[a-z]+-[A-F0-9]{4}$/.test(code), 'Should match pattern');
  });

  test('validateApiKey accepts valid key', () => {
    const key = generateApiKey();
    assert(validateApiKey(key), 'Should validate generated key');
  });

  test('validateApiKey rejects invalid key', () => {
    assert(!validateApiKey('invalid'), 'Should reject invalid');
    assert(!validateApiKey(null), 'Should reject null');
    assert(!validateApiKey('robonet_short'), 'Should reject short key');
  });

  test('extractToken extracts from Bearer header', () => {
    const token = extractToken('Bearer robonet_test123');
    assertEqual(token, 'robonet_test123');
  });

  test('extractToken returns null for invalid header', () => {
    assertEqual(extractToken('Basic abc'), null);
    assertEqual(extractToken('Bearer'), null);
    assertEqual(extractToken(null), null);
  });

  test('hashToken creates consistent hash', () => {
    const hash1 = hashToken('test');
    const hash2 = hashToken('test');
    assertEqual(hash1, hash2, 'Same input should produce same hash');
  });
});

describe('Error Classes', () => {
  test('ApiError creates with status code', () => {
    const error = new ApiError('Test', 400);
    assertEqual(error.statusCode, 400);
    assertEqual(error.message, 'Test');
  });

  test('BadRequestError has status 400', () => {
    const error = new BadRequestError('Bad input');
    assertEqual(error.statusCode, 400);
  });

  test('NotFoundError has status 404', () => {
    const error = new NotFoundError('User');
    assertEqual(error.statusCode, 404);
    assert(error.message.includes('not found'));
  });

  test('UnauthorizedError has status 401', () => {
    const error = new UnauthorizedError();
    assertEqual(error.statusCode, 401);
  });

  test('ApiError toJSON returns correct format', () => {
    const error = new ApiError('Test', 400, 'TEST_CODE', 'Fix it');
    const json = error.toJSON();
    assertEqual(json.success, false);
    assertEqual(json.error, 'Test');
    assertEqual(json.code, 'TEST_CODE');
    assertEqual(json.hint, 'Fix it');
  });
});

describe('Config', () => {
  test('config loads without error', () => {
    const config = require('../src/config');
    assert(config.port, 'Should have port');
    assert(config.robonet.tokenPrefix, 'Should have token prefix');
  });
});

// Helper: create mock req/res for middleware tests
function mockReq(options = {}) {
  return { ip: '127.0.0.1', token: null, ...options };
}

function mockRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) { headers[name] = value; },
  };
}

describe('Rate Limiting - checkLimit (in-memory)', () => {
  test('allows first request and returns correct fields', () => {
    _clearStorageForTest();
    const result = checkLimit('test:allow:1', { max: 3, window: 60 });
    assert(result.allowed, 'First request should be allowed');
    assertEqual(result.limit, 3);
    assertEqual(result.remaining, 2);
    assertEqual(result.retryAfter, 0);
    assert(result.resetAt instanceof Date, 'resetAt should be a Date');
  });

  test('remaining decrements with each request', () => {
    _clearStorageForTest();
    const limit = { max: 5, window: 60 };
    checkLimit('test:decrement', limit);
    checkLimit('test:decrement', limit);
    const result = checkLimit('test:decrement', limit);
    assert(result.allowed, 'Third request should be allowed');
    assertEqual(result.remaining, 2);
  });

  test('blocks request when max is exceeded', () => {
    _clearStorageForTest();
    const limit = { max: 2, window: 60 };
    checkLimit('test:block', limit);
    checkLimit('test:block', limit);
    const result = checkLimit('test:block', limit);
    assert(!result.allowed, 'Third request should be blocked');
    assertEqual(result.remaining, 0);
  });

  test('retryAfter is positive when blocked', () => {
    _clearStorageForTest();
    const limit = { max: 1, window: 60 };
    checkLimit('test:retry', limit);
    const result = checkLimit('test:retry', limit);
    assert(!result.allowed, 'Should be blocked');
    assert(result.retryAfter > 0, 'retryAfter should be positive');
  });

  test('different keys are tracked independently', () => {
    _clearStorageForTest();
    const limit = { max: 1, window: 60 };
    checkLimit('test:key:A', limit);
    const resultB = checkLimit('test:key:B', limit);
    assert(resultB.allowed, 'Different key should be allowed');
  });
});

describe('Rate Limiting - middleware headers', () => {
  test('sets X-RateLimit-Limit header', async () => {
    _clearStorageForTest();
    const middleware = rateLimit('requests');
    const req = mockReq({ ip: 'header-test-1' });
    const res = mockRes();
    let nextCalled = false;
    await middleware(req, res, (err) => { if (!err) nextCalled = true; });
    assert(nextCalled, 'next() should be called');
    assert(res.headers['X-RateLimit-Limit'] !== undefined, 'X-RateLimit-Limit should be set');
    assertEqual(res.headers['X-RateLimit-Limit'], 100);
  });

  test('sets X-RateLimit-Remaining header', async () => {
    _clearStorageForTest();
    const middleware = rateLimit('requests');
    const req = mockReq({ ip: 'header-test-2' });
    const res = mockRes();
    await middleware(req, res, () => {});
    assert(res.headers['X-RateLimit-Remaining'] !== undefined, 'X-RateLimit-Remaining should be set');
    assertEqual(res.headers['X-RateLimit-Remaining'], 99);
  });

  test('sets X-RateLimit-Reset header as unix timestamp', async () => {
    _clearStorageForTest();
    const middleware = rateLimit('requests');
    const req = mockReq({ ip: 'header-test-3' });
    const res = mockRes();
    const before = Math.floor(Date.now() / 1000);
    await middleware(req, res, () => {});
    const reset = res.headers['X-RateLimit-Reset'];
    assert(typeof reset === 'number', 'X-RateLimit-Reset should be a number');
    assert(reset >= before, 'X-RateLimit-Reset should be in the future');
  });

  test('returns RateLimitError and sets Retry-After when limit exceeded', async () => {
    _clearStorageForTest();
    const middleware = rateLimit('episodes');
    const ip = 'header-test-4';
    // exhaust the limit (10/min)
    for (let i = 0; i < 10; i++) {
      await middleware(mockReq({ ip }), mockRes(), () => {});
    }
    const res = mockRes();
    let capturedError = null;
    await middleware(mockReq({ ip }), res, (err) => { capturedError = err; });
    assert(capturedError !== null, 'Should pass error to next()');
    assertEqual(capturedError.statusCode, 429);
    assert(res.headers['Retry-After'] > 0, 'Retry-After should be set');
  });
});

describe('Redis Client', () => {
  test('returns null when no REDIS_URL provided', async () => {
    const client = await createRedisClient(undefined);
    assertEqual(client, null, 'Should return null without URL');
  });

  test('returns null when empty string URL provided', async () => {
    const client = await createRedisClient('');
    assertEqual(client, null, 'Should return null with empty URL');
  });

  test('returns null when Redis connection fails', async () => {
    // Port 1 is reserved and will immediately refuse connection
    const client = await createRedisClient('redis://127.0.0.1:1');
    assertEqual(client, null, 'Should return null on connection failure');
  });
});

// Run
runTests();
