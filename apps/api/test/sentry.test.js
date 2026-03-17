/**
 * Sentry Integration Tests — Community C
 * Run: node test/sentry.test.js
 */

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
  console.log('\nSentry Integration Tests (Community C)\n');
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

// ─── Factory helpers ─────────────────────────────────────────────────────────

const { _createForTesting } = require('../src/lib/sentry');

function makeSentry(dsn) {
  // Save/restore SENTRY_DSN
  const orig = process.env.SENTRY_DSN;
  if (dsn !== undefined) process.env.SENTRY_DSN = dsn;
  else delete process.env.SENTRY_DSN;

  return {
    restore() {
      if (orig !== undefined) process.env.SENTRY_DSN = orig;
      else delete process.env.SENTRY_DSN;
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('init', () => {
  test('returns false and skips init when SENTRY_DSN is not set', () => {
    delete process.env.SENTRY_DSN;
    let initCalled = false;
    const mock = { init: () => { initCalled = true; } };
    const sentry = _createForTesting(mock);
    const result = sentry.init();
    assertEqual(result, false, 'should return false when no DSN');
    assert(!initCalled, 'Sentry.init should NOT be called without DSN');
  });

  test('returns true and calls Sentry.init when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    let initCalledWith = null;
    const mock = { init: (opts) => { initCalledWith = opts; } };
    const sentry = _createForTesting(mock);
    const result = sentry.init();
    delete process.env.SENTRY_DSN;
    assertEqual(result, true, 'should return true when DSN is set');
    assert(initCalledWith !== null, 'Sentry.init should be called');
    assertEqual(initCalledWith.dsn, 'https://abc@sentry.io/123', 'DSN should be passed');
  });

  test('Sentry.init receives environment and tracesSampleRate', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    let initCalledWith = null;
    const mock = { init: (opts) => { initCalledWith = opts; } };
    const sentry = _createForTesting(mock);
    sentry.init();
    delete process.env.SENTRY_DSN;
    assert(typeof initCalledWith.tracesSampleRate === 'number', 'tracesSampleRate should be a number');
    assert(typeof initCalledWith.environment === 'string', 'environment should be a string');
  });

  test('returns false when sentryModule is null (package not installed)', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    const sentry = _createForTesting(null);
    const result = sentry.init();
    delete process.env.SENTRY_DSN;
    assertEqual(result, false, 'should return false when Sentry package not installed');
  });
});

describe('addRequestHandler / addErrorHandler', () => {
  test('does NOT add middleware when not initialized (no DSN)', () => {
    delete process.env.SENTRY_DSN;
    const mock = { init: () => {} };
    const sentry = _createForTesting(mock);
    // do NOT call init()
    const middlewareAdded = [];
    const fakeApp = { use: (mw) => middlewareAdded.push(mw) };
    sentry.addRequestHandler(fakeApp);
    sentry.addErrorHandler(fakeApp);
    assertEqual(middlewareAdded.length, 0, 'no middleware should be added without init');
  });

  test('adds request handler after init', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    const requestHandlerFn = () => {};
    const mock = {
      init: () => {},
      Handlers: {
        requestHandler: () => requestHandlerFn,
        errorHandler: () => () => {}
      }
    };
    const sentry = _createForTesting(mock);
    sentry.init();
    delete process.env.SENTRY_DSN;
    const middlewareAdded = [];
    const fakeApp = { use: (mw) => middlewareAdded.push(mw) };
    sentry.addRequestHandler(fakeApp);
    assertEqual(middlewareAdded.length, 1, 'request handler should be added');
    assertEqual(middlewareAdded[0], requestHandlerFn);
  });

  test('adds error handler after init', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    const errorHandlerFn = () => {};
    const mock = {
      init: () => {},
      Handlers: {
        requestHandler: () => () => {},
        errorHandler: () => errorHandlerFn
      }
    };
    const sentry = _createForTesting(mock);
    sentry.init();
    delete process.env.SENTRY_DSN;
    const middlewareAdded = [];
    const fakeApp = { use: (mw) => middlewareAdded.push(mw) };
    sentry.addErrorHandler(fakeApp);
    assertEqual(middlewareAdded.length, 1, 'error handler should be added');
    assertEqual(middlewareAdded[0], errorHandlerFn);
  });
});

describe('captureException', () => {
  test('is a no-op when not initialized', () => {
    delete process.env.SENTRY_DSN;
    const mock = {
      init: () => {},
      captureException: () => { throw new Error('should not be called'); }
    };
    const sentry = _createForTesting(mock);
    // no init() call
    sentry.captureException(new Error('test error')); // should not throw
  });

  test('calls Sentry.captureException when initialized', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    let captured = null;
    const mock = {
      init: () => {},
      captureException: (err) => { captured = err; }
    };
    const sentry = _createForTesting(mock);
    sentry.init();
    delete process.env.SENTRY_DSN;
    const err = new Error('test error');
    sentry.captureException(err);
    assert(captured === err, 'error should be passed to Sentry.captureException');
  });
});

runTests();
