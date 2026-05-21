'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const VALID_ADMIN = Buffer.from('demoClient:demoSecret').toString('base64');
const VALID_AUTH = `Basic ${VALID_ADMIN}`;
const WRONG_AUTH = `Basic ${Buffer.from('hacker:wrong').toString('base64')}`;

function makeEvent(body, overrides = {}) {
  return {
    headers: { authorization: VALID_AUTH },
    body: JSON.stringify(body),
    queryStringParameters: null,
    requestContext: { http: { method: 'POST', path: '/admin/demo-actions/mutate-user' } },
    ...overrides,
  };
}

/**
 * Build a minimal DDB Document Client stub. Items are keyed by table name then
 * primary key value. PutCommand and UpdateCommand are captured in calls[].
 */
function makeDdb(initialItems = {}) {
  const items = { UserProfile: {}, UserState: {}, UserActivity: {}, ...initialItems };
  const calls = [];
  const client = {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });

      if (name === 'GetCommand') {
        const key = Object.values(cmd.input.Key)[0];
        const tableItems = items[cmd.input.TableName] || {};
        return { Item: tableItems[key] ?? null };
      }
      // UpdateCommand and PutCommand just succeed
      return {};
    },
    _items: items,
    _calls: calls,
  };
  return client;
}

describe('POST /admin/demo-actions/mutate-user', () => {
  let mod;
  let ddb;

  function loadFresh(ddbClient) {
    // Clear module cache so require picks up fresh state
    for (const key of Object.keys(require.cache)) {
      if (key.includes('demo-actions') || key.includes('admin/shared')) {
        delete require.cache[key];
      }
    }
    const m = require('./demo-actions');
    m._setDdb(ddbClient);
    return m;
  }

  beforeEach(() => {
    ddb = makeDdb({
      UserProfile: {
        user001: { userId: 'user001', tier: 'Gold', profileCompletion: 60, loyaltyScore: 500 },
      },
      UserState: { user001: { userId: 'user001' } },
    });
    mod = loadFresh(ddb);
  });

  test('returns 403 when no valid admin auth', async () => {
    const event = makeEvent(
      { userId: 'user001', mutation: { tier: 'Platinum' } },
      { headers: { authorization: WRONG_AUTH } }
    );
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 403);
  });

  test('returns 400 when userId missing', async () => {
    const event = makeEvent({ mutation: { tier: 'Platinum' } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('returns 400 when mutation missing', async () => {
    const event = makeEvent({ userId: 'user001' });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('returns 404 when user not found', async () => {
    const event = makeEvent({ userId: 'nonexistent', mutation: { tier: 'Platinum' } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 404);
  });

  test('returns 200 with touched fields on tier mutation', async () => {
    const event = makeEvent({ userId: 'user001', mutation: { tier: 'Platinum' } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.touched.tier);
    assert.equal(body.data.touched.tier.from, 'Gold');
    assert.equal(body.data.touched.tier.to, 'Platinum');
    assert.ok(body.data.activityId);
    assert.ok(body.data.mutatedAt);
  });

  test('returns 200 with touched fields on profileCompletion mutation', async () => {
    const event = makeEvent({ userId: 'user001', mutation: { profileCompletion: 95 } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.touched.profileCompletion);
    assert.equal(body.data.touched.profileCompletion.from, 60);
    assert.equal(body.data.touched.profileCompletion.to, 95);
  });

  test('returns 200 on mfaEnrolled=true mutation', async () => {
    const event = makeEvent({ userId: 'user001', mutation: { mfaEnrolled: true } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.touched.mfaEnrolled.to, true);
  });

  test('returns 200 on booking.trigger mutation', async () => {
    const event = makeEvent({ userId: 'user001', mutation: { booking: { trigger: true } } });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.touched.recentBooking);
  });

  test('returns 200 on flow.transfer.abandon mutation', async () => {
    const event = makeEvent({
      userId: 'user001',
      mutation: { flow: { transfer: { abandon: true } } },
    });
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.touched.transferDraft);
  });

  test('writes a DEMO_EVENT PutCommand', async () => {
    const event = makeEvent({ userId: 'user001', mutation: { tier: 'Platinum' } });
    await mod.mutateDemoUser(event, 'cid');
    const putCalls = ddb._calls.filter((c) => c.name === 'PutCommand');
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].input.Item.type, 'USER_MUTATION');
  });

  test('returns 400 on invalid JSON body', async () => {
    const event = {
      headers: { authorization: VALID_AUTH },
      body: 'not-json',
      queryStringParameters: null,
      requestContext: { http: { method: 'POST', path: '/admin/demo-actions/mutate-user' } },
    };
    const res = await mod.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 400);
  });
});
