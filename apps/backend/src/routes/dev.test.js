'use strict';

/**
 * Tests for routes/dev.js
 *
 * Covers:
 *   - DEMO_MODE off -> 403 before auth check
 *   - DEMO_MODE on + missing bearer -> 403 (admin Basic Auth required)
 *   - DEMO_MODE on + valid admin credentials -> 200 with counts
 *   - GET /admin/dev/config returns demoMode flag
 *
 * DynamoDB is mocked via _setDdbClient. The seed lib is mocked by injecting
 * a fake DDB client whose BatchWriteItemCommand handler captures calls.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ADMIN_CREDS = Buffer.from('demoClient:demoSecret').toString('base64');
const VALID_AUTH = `Basic ${VALID_ADMIN_CREDS}`;

const WRONG_CREDS = Buffer.from('hacker:wrong').toString('base64');
const WRONG_AUTH = `Basic ${WRONG_CREDS}`;

function makeEvent(overrides = {}) {
  return {
    headers: { authorization: VALID_AUTH },
    body: null,
    queryStringParameters: null,
    requestContext: { http: { method: 'POST', path: '/admin/dev/reseed' } },
    ...overrides,
  };
}

/**
 * Build a minimal raw DynamoDBClient stub that captures BatchWriteItemCommand
 * calls. Returns { client, calls } where calls accumulates inputs.
 */
function fakeDdbClient() {
  const calls = [];
  const client = {
    send: async (cmd) => {
      calls.push({ constructor: cmd.constructor.name, input: cmd.input });
      return { UnprocessedItems: {} };
    },
  };
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /admin/dev/reseed', () => {
  let dev;
  let origDemoMode;

  beforeEach(() => {
    // Bust require cache so env var changes are picked up.
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/seed')];
    dev = require('./dev');
    origDemoMode = process.env.DEMO_MODE;
  });

  afterEach(() => {
    if (origDemoMode === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = origDemoMode;
    }
  });

  test('returns 403 when DEMO_MODE is not 1', async () => {
    process.env.DEMO_MODE = '0';
    // Re-require after env change so CFG picks up the new value.
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: {} });
    const res = await dev.reseed(event, 'cid-001');
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 403);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'demo-mode-disabled');
  });

  test('returns 403 when DEMO_MODE=1 but credentials are missing', async () => {
    process.env.DEMO_MODE = '1';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: {} });
    const res = await dev.reseed(event, 'cid-002');
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 403);
    assert.ok(body.error.code === 'FORBIDDEN');
  });

  test('returns 403 when DEMO_MODE=1 but wrong credentials', async () => {
    process.env.DEMO_MODE = '1';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: { authorization: WRONG_AUTH } });
    const res = await dev.reseed(event, 'cid-003');
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  test('returns 200 with counts when DEMO_MODE=1 and valid admin credentials', async () => {
    process.env.DEMO_MODE = '1';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/seed')];
    dev = require('./dev');

    const { client } = fakeDdbClient();
    dev._setDdbClient(client);

    const event = makeEvent();
    const res = await dev.reseed(event, 'cid-004');
    const body = JSON.parse(res.body);

    assert.equal(res.statusCode, 200);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.tablesReset), 'tablesReset should be an array');
    assert.ok(typeof body.itemsWritten === 'number', 'itemsWritten should be a number');
    assert.ok(typeof body.durationMs === 'number', 'durationMs should be a number');
    // The fake DDB accepted all writes, so no errors
    assert.ok(body.itemsWritten >= 0);
  });
});

describe('GET /admin/dev/config', () => {
  let dev;
  let origDemoMode;

  beforeEach(() => {
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');
    origDemoMode = process.env.DEMO_MODE;
  });

  afterEach(() => {
    if (origDemoMode === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = origDemoMode;
    }
  });

  test('returns demoMode: false when DEMO_MODE is not 1', () => {
    process.env.DEMO_MODE = '0';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: { authorization: VALID_AUTH } });
    const res = dev.devConfig(event, 'cid-010');
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.demoMode, false);
  });

  test('returns demoMode: true when DEMO_MODE=1', () => {
    process.env.DEMO_MODE = '1';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: { authorization: VALID_AUTH } });
    const res = dev.devConfig(event, 'cid-011');
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.demoMode, true);
  });

  test('returns 403 when not admin', () => {
    process.env.DEMO_MODE = '1';
    delete require.cache[require.resolve('./dev')];
    delete require.cache[require.resolve('../lib/config')];
    dev = require('./dev');

    const event = makeEvent({ headers: { authorization: WRONG_AUTH } });
    const res = dev.devConfig(event, 'cid-012');
    assert.equal(res.statusCode, 403);
  });
});
