'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basicAuth(id, secret) {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

const CLIENT_AUTH = basicAuth('demoClient', 'demoSecret');

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

const ACCESS_TOKEN = 'avail-test-token-xyz';
const USER_ID = 'user-avail-001';

function withSession(userId = USER_ID, token = ACCESS_TOKEN, baseHandlers = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessRow = {
    sessionId: token,
    recordType: 'ACCESS',
    userId,
    token,
    issuedAt: now - 60,
    expiresAt: now + 1800,
    lastActivityAt: now - 5,
    mfaVerified: true,
  };
  return makeDdb({
    GetCommand(cmd) {
      const key = cmd.input?.Key || {};
      if (key.sessionId === token) return { Item: accessRow };
      if (key.userId === userId) {
        return {
          Item: {
            userId,
            tier: 'Gold',
            loyaltyScore: 5000,
            profileCompletion: 75,
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

function makeEvent({ method = 'GET', path = '/', query = {}, token = null } = {}) {
  return {
    requestContext: { http: { method, path } },
    headers: {
      authorization: token ? `Bearer ${token}` : CLIENT_AUTH,
    },
    queryStringParameters: query,
    body: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /customer/properties/:id/availability', () => {
  let handler;

  before(() => {
    handler = require('../handler');
  });

  it('returns 401 when no bearer token is present', async () => {
    handler._setDdb(makeDdb({}));
    const res = await handler.main(
      makeEvent({ path: '/customer/properties/prop-001/availability', token: null })
    );
    assert.equal(res.statusCode, 401);
  });

  it('returns available:true with 7 nights at 1250 SFC/night', async () => {
    handler._setDdb(withSession());
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-001/availability',
        token: ACCESS_TOKEN,
        query: { checkIn: '2026-06-01', checkOut: '2026-06-08', adults: '2', children: '0' },
      })
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.available, true);
    assert.equal(body.nights, 7);
    assert.equal(body.pricePerNight, 1250);
    assert.equal(body.totalSfc, 8750);
    assert.equal(body.currency, 'SFC');
  });

  it('returns available:false for the demo fully-booked property', async () => {
    handler._setDdb(withSession());
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-fully-booked-demo/availability',
        token: ACCESS_TOKEN,
      })
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.available, false);
    assert.equal(body.reason, 'FULLY_BOOKED');
  });

  it('defaults to 1 night when no dates supplied', async () => {
    handler._setDdb(withSession());
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-002/availability',
        token: ACCESS_TOKEN,
      })
    );
    const body = JSON.parse(res.body);
    assert.equal(body.nights, 1);
    assert.equal(body.totalSfc, 1250);
  });
});

describe('GET /customer/properties/:id/personalized-offer', () => {
  let handler;

  before(() => {
    handler = require('../handler');
  });

  it('returns 400 when userId query param is missing', async () => {
    handler._setDdb(withSession());
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-001/personalized-offer',
        token: ACCESS_TOKEN,
      })
    );
    assert.equal(res.statusCode, 400);
  });

  it('returns 401 when no bearer token is present', async () => {
    handler._setDdb(makeDdb({}));
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-001/personalized-offer',
        token: null,
        query: { userId: USER_ID },
      })
    );
    assert.equal(res.statusCode, 401);
  });

  it('returns 404 when user does not exist in DDB', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ddb = makeDdb({
      GetCommand(cmd) {
        const key = cmd.input?.Key || {};
        if (key.sessionId === ACCESS_TOKEN) {
          return {
            Item: {
              sessionId: ACCESS_TOKEN,
              recordType: 'ACCESS',
              userId: USER_ID,
              token: ACCESS_TOKEN,
              issuedAt: now - 60,
              expiresAt: now + 1800,
              lastActivityAt: now,
              mfaVerified: true,
            },
          };
        }
        // User profile not found
        return { Item: undefined };
      },
      UpdateCommand: {},
      QueryCommand: { Items: [] },
    });
    handler._setDdb(ddb);
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-001/personalized-offer',
        token: ACCESS_TOKEN,
        query: { userId: USER_ID },
      })
    );
    assert.equal(res.statusCode, 404);
  });

  it('returns offer:null when LLM env vars are not configured', async () => {
    handler._setDdb(withSession());
    const res = await handler.main(
      makeEvent({
        path: '/customer/properties/prop-001/personalized-offer',
        token: ACCESS_TOKEN,
        query: { userId: USER_ID },
      })
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.offer, null);
  });
});
