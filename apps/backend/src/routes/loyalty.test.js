'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basicAuth(id, secret) {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

const VALID_AUTH = basicAuth('demoClient', 'demoSecret');

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    path: '/customer/loyalty-summary',
    headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
    queryStringParameters: { userId: 'USER#001' },
    pathParameters: null,
    body: null,
    ...overrides,
  };
}

const ACCESS_TOKEN = 'test-access-token-abc123';

function makeDdb(handlers = {}) {
  return {
    send(command) {
      const name = command.constructor.name;
      if (Object.hasOwn(handlers, name)) {
        const val = handlers[name];
        return Promise.resolve(typeof val === 'function' ? val(command) : val);
      }
      return Promise.resolve({ Item: undefined, Items: [] });
    },
  };
}

function withAccessRow(userId, token, baseHandlers = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessRow = {
    sessionId: token,
    recordType: 'ACCESS',
    userId,
    token,
    issuedAt: now - 60,
    expiresAt: now + 1800,
    lastActivityAt: now - 30,
    mfaVerified: true,
  };

  return makeDdb({
    GetCommand(cmd) {
      if (cmd.input?.Key?.sessionId === token) return { Item: accessRow };
      if (cmd.input?.Key?.userId === userId) {
        return {
          Item: {
            userId,
            tier: 'Gold',
            loyaltyScore: 510,
            profileCompletion: 0.45,
            emailVerified: true,
            phoneVerified: false,
          },
        };
      }
      return { Item: undefined };
    },
    UpdateCommand: {},
    QueryCommand: { Items: [] },
    ...baseHandlers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /customer/loyalty-summary', () => {
  let handler;

  before(() => {
    handler = require('../handler');
  });

  it('returns 401 when no bearer token', async () => {
    const ddb = makeDdb({});
    handler._setDdb(ddb);

    const event = makeEvent({ headers: {} });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
  });

  it('returns 404 when user not found', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ddb = makeDdb({
      GetCommand(cmd) {
        if (cmd.input?.Key?.sessionId === ACCESS_TOKEN) {
          return {
            Item: {
              sessionId: ACCESS_TOKEN,
              recordType: 'ACCESS',
              userId: 'USER#001',
              token: ACCESS_TOKEN,
              issuedAt: now - 60,
              expiresAt: now + 1800,
              lastActivityAt: now,
              mfaVerified: true,
            },
          };
        }
        return { Item: undefined };
      },
      UpdateCommand: {},
      QueryCommand: { Items: [] },
    });
    handler._setDdb(ddb);

    const event = makeEvent({
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
  });

  it('returns 200 with correct tier derivation for loyaltyScore=510', async () => {
    const ddb = withAccessRow('USER#001', ACCESS_TOKEN);
    handler._setDdb(ddb);

    const event = makeEvent({
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    const d = body.data;

    assert.equal(d.userId, 'USER#001');
    // loyaltyScore=510 * 82 = 41820, which is Gold (25000-49999)
    assert.equal(d.currentTier, 'Gold');
    assert.equal(d.currentPoints, 41820);
    assert.equal(d.nextTier, 'Platinum');
    assert.ok(d.pointsToNextTier > 0);
    assert.ok(d.tierProgress >= 0 && d.tierProgress <= 1);
    assert.ok(Array.isArray(d.tierBenefits) && d.tierBenefits.length > 0);
    assert.ok(Array.isArray(d.nextTierBenefits) && d.nextTierBenefits.length > 0);
    assert.ok(Array.isArray(d.recentMiles));
  });

  it('uses loyaltyPointsBalance when explicitly set on profile', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ddb = makeDdb({
      GetCommand(cmd) {
        if (cmd.input?.Key?.sessionId === ACCESS_TOKEN) {
          return {
            Item: {
              sessionId: ACCESS_TOKEN,
              recordType: 'ACCESS',
              userId: 'USER#001',
              token: ACCESS_TOKEN,
              issuedAt: now - 60,
              expiresAt: now + 1800,
              lastActivityAt: now,
              mfaVerified: true,
            },
          };
        }
        return {
          Item: {
            userId: 'USER#001',
            tier: 'Gold',
            loyaltyScore: 510,
            loyaltyPointsBalance: 42000,
          },
        };
      },
      UpdateCommand: {},
      QueryCommand: { Items: [] },
    });
    handler._setDdb(ddb);

    const event = makeEvent({ headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.currentPoints, 42000);
  });

  it('maps TRANSFER activity rows to recentMiles entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ddb = makeDdb({
      GetCommand(cmd) {
        if (cmd.input?.Key?.sessionId === ACCESS_TOKEN) {
          return {
            Item: {
              sessionId: ACCESS_TOKEN,
              recordType: 'ACCESS',
              userId: 'USER#001',
              token: ACCESS_TOKEN,
              issuedAt: now - 60,
              expiresAt: now + 1800,
              lastActivityAt: now,
              mfaVerified: true,
            },
          };
        }
        return {
          Item: {
            userId: 'USER#001',
            tier: 'Gold',
            loyaltyScore: 510,
          },
        };
      },
      UpdateCommand: {},
      QueryCommand: {
        Items: [
          {
            userId: 'USER#001',
            activityTime: now - 100,
            activityType: 'TRANSFER',
            amount: 5000,
            recipientId: 'USER#013',
            channel: 'APP',
          },
          {
            userId: 'USER#001',
            activityTime: now - 200,
            activityType: 'LOGIN',
            amount: 0,
            recipientId: '',
          },
        ],
      },
    });
    handler._setDdb(ddb);

    const event = makeEvent({ headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // LOGIN should be filtered out; TRANSFER should appear as TRANSFER_OUT
    assert.equal(body.data.recentMiles.length, 1);
    assert.equal(body.data.recentMiles[0].type, 'TRANSFER_OUT');
    assert.ok(body.data.recentMiles[0].amount < 0);
  });
});
