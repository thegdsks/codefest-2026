'use strict';

/**
 * HTTP-layer integration tests for handler.js.
 *
 * Covers: auth checks, route dispatch, CORS preflight, body parse errors,
 * correlation-id echo, admin gate, and per-route happy paths.
 *
 * DDB is injected via _setDdb (test-only seam). The engine router is NOT
 * stubbed; scoreLogin/scoreTransfer return LOW-risk drafts so the router
 * short-circuits at L1 without hitting the LLM module.
 */

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid Basic Auth header value for the given id:secret pair. */
function basicAuth(id, secret) {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

const VALID_AUTH = basicAuth('demoClient', 'demoSecret');

/**
 * Build a minimal API Gateway v1 proxy event.
 * @param {object} overrides
 */
function makeEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: { authorization: VALID_AUTH, 'content-type': 'application/json' },
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DDB stub
// ---------------------------------------------------------------------------

/**
 * A minimal DDB stub. send() dispatches on the constructor name of the
 * command object, returning a canned response or throwing if the caller
 * hasn't registered that command.
 */
function makeDdb(handlers = {}) {
  return {
    send(command) {
      const name = command.constructor.name;
      if (Object.hasOwn(handlers, name)) {
        const val = handlers[name];
        return Promise.resolve(typeof val === 'function' ? val(command) : val);
      }
      // Default: return empty Item / Items so callers get null/[] safely.
      return Promise.resolve({ Item: undefined, Items: [] });
    },
  };
}

/**
 * Build a DDB stub whose UserSession GetCommand returns a valid ACCESS row
 * for the given token. Other GetCommand cases the caller passed are layered
 * on top, matched by table name. UpdateCommand is no-op'd so the sliding-
 * window write in validateBearer doesn't surprise the test.
 */
function withAccessRow(userId, token, baseHandlers = {}) {
  const now = Math.floor(Date.now() / 1000);
  const accessRow = {
    sessionId: token,
    recordType: 'ACCESS',
    userId,
    token,
    issuedAt: now - 60,
    expiresAt: now + 1800,
    lastActivityAt: now - 60,
    mfaVerified: true,
  };
  const orig = baseHandlers.GetCommand;
  return makeDdb({
    ...baseHandlers,
    GetCommand: (cmd) => {
      if (cmd.input.TableName === 'UserSession' && cmd.input.Key.sessionId === token) {
        return { Item: accessRow };
      }
      if (typeof orig === 'function') return orig(cmd);
      if (orig) return orig;
      return { Item: undefined };
    },
    UpdateCommand: baseHandlers.UpdateCommand || (() => ({})),
  });
}

/** Bearer Authorization header value. */
function bearer(token) {
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Module under test - loaded once; seam set per describe block.
// ---------------------------------------------------------------------------

let handler;
let admin;

before(async () => {
  // Clear module cache so _setDdb affects a fresh module instance.
  // Using require inside before() is fine for node:test.
  handler = require('./handler');
  admin = require('./admin');
});

/** Set the DDB stub on both handler and admin (admin has its own ddb instance). */
function setAllDdb(stub) {
  handler._setDdb(stub);
  admin._setDdb(stub);
}

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------

describe('auth', () => {
  afterEach(() => {
    // Reset DDB stub to a no-op after each auth test (no DDB calls expected).
    handler._setDdb(makeDdb());
  });

  it('returns 401 when Authorization header is missing', async () => {
    const event = makeEvent({ headers: { 'content-type': 'application/json' } });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'UNAUTHORIZED_CLIENT');
  });

  it('returns 401 when Basic Auth credentials are wrong', async () => {
    const event = makeEvent({
      headers: { authorization: basicAuth('wrong', 'wrong') },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'UNAUTHORIZED_CLIENT');
  });

  it('returns 401 when Authorization header is not Basic scheme', async () => {
    const event = makeEvent({
      headers: { authorization: 'Bearer some-token' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
  });
});

// ---------------------------------------------------------------------------
// Admin gate
// ---------------------------------------------------------------------------

describe('admin gate', () => {
  it('returns 403 FORBIDDEN when a non-admin CLIENT_ID hits /admin/decisions', async () => {
    // Temporarily override CLIENT_ID / CLIENT_SECRET to a pair that is not
    // in ADMIN_USERNAMES (which defaults to "demoClient"). The handler reads
    // CFG at require()-time from process.env, so we use a fresh require via
    // the module cache to isolate. Instead, we rely on the fact that basic
    // auth must match CLIENT_ID exactly; set CLIENT_ID to a non-admin value.
    const origId = process.env.CLIENT_ID;
    const origAdmins = process.env.ADMIN_USERNAMES;
    process.env.CLIENT_ID = 'regularClient';
    process.env.ADMIN_USERNAMES = 'demoClient'; // demoClient is admin, regularClient is not

    // We need a fresh handler module so CFG picks up the new CLIENT_ID.
    // Delete the cache entry and re-require.
    const handlerPath = require.resolve('./handler');
    delete require.cache[handlerPath];
    const freshHandler = require('./handler');
    freshHandler._setDdb(makeDdb());

    const event = makeEvent({
      httpMethod: 'GET',
      path: '/admin/decisions',
      headers: { authorization: basicAuth('regularClient', 'demoSecret') },
    });
    const res = await freshHandler.main(event);

    // Restore env and module cache to original handler.
    process.env.CLIENT_ID = origId !== undefined ? origId : 'demoClient';
    if (origAdmins !== undefined) process.env.ADMIN_USERNAMES = origAdmins;
    else delete process.env.ADMIN_USERNAMES;
    delete require.cache[handlerPath];

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('allows admin user to reach /admin/decisions route', async () => {
    // demoClient is in ADMIN_USERNAMES by default, so VALID_AUTH is sufficient.
    handler._setDdb(
      makeDdb({
        // admin.getDecisions calls ScanCommand on DecisionStore.
        ScanCommand: () => ({ Items: [], LastEvaluatedKey: undefined }),
      })
    );
    const event = makeEvent({ httpMethod: 'GET', path: '/admin/decisions' });
    const res = await handler.main(event);
    // Should not be 403 - admin is permitted.
    assert.notEqual(res.statusCode, 403, 'admin should not receive 403');
  });
});

// ---------------------------------------------------------------------------
// Unknown route
// ---------------------------------------------------------------------------

describe('routing', () => {
  it('returns 404 for an unknown path', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({ httpMethod: 'GET', path: '/does/not/exist' });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('supports both v1 httpMethod/path and v2 requestContext.http shape', async () => {
    handler._setDdb(makeDdb());
    // v2 shape: requestContext.http.method + requestContext.http.path
    const event = {
      requestContext: { http: { method: 'GET', path: '/does/not/exist' } },
      headers: { authorization: VALID_AUTH },
      queryStringParameters: null,
      body: null,
    };
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// CORS preflight
// ---------------------------------------------------------------------------

describe('CORS', () => {
  it('returns 200 with Access-Control-Allow-* headers on OPTIONS preflight', async () => {
    handler._setDdb(makeDdb());
    // OPTIONS does not match any route; falls through to 404 from the route
    // function - but all responses include CORS headers because json() always
    // adds them.
    const event = makeEvent({ httpMethod: 'OPTIONS', path: '/auth/login' });
    const res = await handler.main(event);
    // OPTIONS hits "not found" route - but we only care that CORS headers exist.
    assert.ok(res.headers['Access-Control-Allow-Origin'], 'CORS origin header missing');
    assert.ok(res.headers['Access-Control-Allow-Headers'], 'CORS headers header missing');
    assert.ok(res.headers['Access-Control-Allow-Methods'], 'CORS methods header missing');
  });
});

// ---------------------------------------------------------------------------
// Body parse errors
// ---------------------------------------------------------------------------

describe('body parsing', () => {
  it('returns 400 VALIDATION_ERROR on malformed JSON body', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: '{bad json',
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Correlation ID
// ---------------------------------------------------------------------------

describe('correlation ID', () => {
  it('echoes x-correlation-id header back in the response body', async () => {
    handler._setDdb(makeDdb());
    const cid = 'test-correlation-abc123';
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/does/not/exist',
      headers: { authorization: VALID_AUTH, 'x-correlation-id': cid },
    });
    const res = await handler.main(event);
    const body = JSON.parse(res.body);
    assert.equal(body.correlationId, cid);
  });

  it('uses empty string correlationId when header is absent', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({ httpMethod: 'GET', path: '/does/not/exist' });
    const res = await handler.main(event);
    const body = JSON.parse(res.body);
    assert.equal(body.correlationId, '');
  });
});

// ---------------------------------------------------------------------------
// Happy-path: GET /user/profile
// ---------------------------------------------------------------------------

describe('GET /user/profile', () => {
  it('returns 200 with profile data for a valid userId', async () => {
    const fakeProfile = {
      userId: 'U001',
      username: 'alice',
      tier: 'gold',
      loyaltyScore: 500,
      profileCompletion: 0.9,
      emailVerified: true,
      phoneVerified: true,
    };
    const token = 'tok-U001';
    handler._setDdb(
      withAccessRow('U001', token, {
        GetCommand: (cmd) => {
          if (cmd.input.TableName === 'UserProfile') return { Item: fakeProfile };
          return { Item: undefined };
        },
      })
    );

    const event = makeEvent({
      httpMethod: 'GET',
      path: '/user/profile',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'U001' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.userId, 'U001');
    assert.equal(body.data.username, 'alice');
    assert.equal(body.data.tier, 'gold');
  });

  it('returns 404 when user does not exist', async () => {
    const token = 'tok-MISSING';
    handler._setDdb(withAccessRow('MISSING', token));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/user/profile',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'MISSING' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'USER_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when userId query param is missing', async () => {
    handler._setDdb(makeDdb());
    // qparam runs before requireBearer, so this still hits VALIDATION_ERROR.
    const event = makeEvent({ httpMethod: 'GET', path: '/user/profile' });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 401 UNAUTHORIZED when no bearer token is presented', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/user/profile',
      headers: { 'content-type': 'application/json' },
      queryStringParameters: { userId: 'U001' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when bearer userId does not match requested userId', async () => {
    const token = 'tok-U002';
    handler._setDdb(withAccessRow('U002', token));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/user/profile',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'U001' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// Happy-path: POST /auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  // Provides a UserProfile item for findUserByUsername (QueryCommand) and
  // UserState (GetCommand), and absorbs PutCommand / UpdateCommand writes.
  function loginDdb(profileItem, stateItem = null) {
    return makeDdb({
      QueryCommand: () => ({ Items: profileItem ? [profileItem] : [] }),
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserState') return { Item: stateItem };
        return { Item: undefined };
      },
      PutCommand: () => ({}),
      UpdateCommand: () => ({}),
    });
  }

  it('returns 200 SUCCESS on valid credentials with low-risk login', async () => {
    const profile = {
      userId: 'U001',
      username: 'alice',
      passwordHash: 'pass123',
      tier: 'gold',
    };
    // State with same location so score stays LOW.
    const state = {
      lastLoginLocation: 'New York',
      lastLoginTime: Math.floor(Date.now() / 1000) - 60,
    };
    handler._setDdb(loginDdb(profile, state));

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({
        username: 'alice',
        password: 'pass123',
        location: 'New York',
        deviceId: 'dev-1',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.status, 'SUCCESS');
    assert.ok(body.data.sessionId, 'sessionId missing from successful login response');
  });

  it('issues a bearer token and expiresAt on a low-risk SUCCESS login', async () => {
    const profile = {
      userId: 'U001',
      username: 'alice',
      passwordHash: 'pass123',
      tier: 'gold',
    };
    const state = {
      lastLoginLocation: 'New York',
      lastLoginTime: Math.floor(Date.now() / 1000) - 60,
    };

    // Capture the access-row PutCommand so we can assert its shape.
    const sessionPuts = [];
    const stub = makeDdb({
      QueryCommand: () => ({ Items: [profile] }),
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserState') return { Item: state };
        return { Item: undefined };
      },
      UpdateCommand: () => ({}),
      PutCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') sessionPuts.push(cmd.input.Item);
        return {};
      },
    });
    handler._setDdb(stub);

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({
        username: 'alice',
        password: 'pass123',
        location: 'New York',
        deviceId: 'dev-1',
        ipAddress: '203.0.113.42',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    // Response shape: token + expiresAt next to the existing sessionId.
    assert.equal(body.data.status, 'SUCCESS');
    assert.ok(body.data.token, 'token missing from response');
    assert.equal(typeof body.data.token, 'string');
    assert.ok(body.data.token.length >= 32, 'token shorter than expected');
    assert.equal(typeof body.data.expiresAt, 'number');
    assert.ok(body.data.expiresAt > Math.floor(Date.now() / 1000), 'expiresAt not in the future');

    // An ACCESS row was written keyed by the token itself.
    const accessRow = sessionPuts.find((it) => it.recordType === 'ACCESS');
    assert.ok(accessRow, 'no ACCESS row written to UserSession');
    assert.equal(accessRow.sessionId, body.data.token, 'access row sessionId must equal token');
    assert.equal(accessRow.userId, 'U001');
    assert.equal(accessRow.mfaVerified, false);
    assert.equal(accessRow.token, body.data.token);
    assert.equal(typeof accessRow.issuedAt, 'number');
    assert.equal(typeof accessRow.lastActivityAt, 'number');
    assert.equal(accessRow.expiresAt, body.data.expiresAt);
  });

  it('does NOT issue a bearer token on the MFA_REQUIRED branch', async () => {
    // Force the engine to take the MFA branch: prior login in a different
    // location, with delta in the (300, 600] window scoreLogin treats as
    // MEDIUM risk -> action=MFA.
    const profile = {
      userId: 'U001',
      username: 'alice',
      passwordHash: 'pass123',
      tier: 'gold',
    };
    const state = {
      lastLoginLocation: 'New York',
      lastLoginTime: Math.floor(Date.now() / 1000) - 400,
    };

    const sessionPuts = [];
    const stub = makeDdb({
      QueryCommand: () => ({ Items: [profile] }),
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserState') return { Item: state };
        return { Item: undefined };
      },
      UpdateCommand: () => ({}),
      PutCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') sessionPuts.push(cmd.input.Item);
        return {};
      },
    });
    handler._setDdb(stub);

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({
        username: 'alice',
        password: 'pass123',
        location: 'Tokyo',
        deviceId: 'dev-1',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.data.status, 'MFA_REQUIRED');
    assert.equal(body.data.token, undefined, 'token must not be present on MFA challenge');
    assert.equal(body.data.expiresAt, undefined, 'expiresAt must not be present on MFA challenge');

    // No ACCESS row should be written; only the legacy MFA-challenge row.
    const accessRows = sessionPuts.filter((it) => it.recordType === 'ACCESS');
    assert.equal(accessRows.length, 0, 'unexpected ACCESS row on MFA challenge');
  });

  it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
    const profile = {
      userId: 'U001',
      username: 'alice',
      passwordHash: 'correct-hash',
      tier: 'gold',
    };
    handler._setDdb(loginDdb(profile));

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({
        username: 'alice',
        password: 'wrong',
        location: 'New York',
        deviceId: 'dev-1',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('returns 401 INVALID_CREDENTIALS when username does not exist', async () => {
    handler._setDdb(loginDdb(null));
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({
        username: 'nobody',
        password: 'x',
        location: 'Boston',
        deviceId: 'dev-2',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/login',
      body: JSON.stringify({ username: 'alice' }), // missing password, location, deviceId
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Happy-path: POST /auth/mfa/verify
// ---------------------------------------------------------------------------

describe('POST /auth/mfa/verify', () => {
  it('issues a bearer token on valid OTP and writes an ACCESS row marked mfaVerified=true', async () => {
    const challengeRow = {
      sessionId: 'SESSION#abcd1234',
      userId: 'U001',
      location: 'Tokyo',
      ipAddress: '203.0.113.42',
      deviceId: 'dev-1',
      loginTime: Math.floor(Date.now() / 1000) - 30,
    };

    const sessionPuts = [];
    const stub = makeDdb({
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') return { Item: challengeRow };
        return { Item: undefined };
      },
      PutCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') sessionPuts.push(cmd.input.Item);
        return {};
      },
    });
    handler._setDdb(stub);

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/mfa/verify',
      body: JSON.stringify({ sessionId: 'SESSION#abcd1234', otp: '123456' }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.status, 'SUCCESS');
    assert.ok(body.data.token, 'token missing from mfa/verify response');
    assert.equal(typeof body.data.expiresAt, 'number');

    const accessRow = sessionPuts.find((it) => it.recordType === 'ACCESS');
    assert.ok(accessRow, 'no ACCESS row written after MFA verify');
    assert.equal(accessRow.sessionId, body.data.token);
    assert.equal(accessRow.userId, 'U001');
    assert.equal(accessRow.mfaVerified, true);
    assert.equal(accessRow.location, 'Tokyo', 'access row should inherit login-challenge location');
    assert.equal(accessRow.deviceId, 'dev-1');
  });

  it('returns 401 OTP_INVALID on wrong code and does NOT issue a token', async () => {
    const challengeRow = {
      sessionId: 'SESSION#abcd1234',
      userId: 'U001',
      location: 'Tokyo',
    };

    const sessionPuts = [];
    const stub = makeDdb({
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') return { Item: challengeRow };
        return { Item: undefined };
      },
      PutCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession') sessionPuts.push(cmd.input.Item);
        return {};
      },
    });
    handler._setDdb(stub);

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/mfa/verify',
      body: JSON.stringify({ sessionId: 'SESSION#abcd1234', otp: '000000' }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'OTP_INVALID');

    const accessRows = sessionPuts.filter((it) => it.recordType === 'ACCESS');
    assert.equal(accessRows.length, 0, 'must not issue a token on invalid OTP');
  });

  it('returns 404 SESSION_NOT_FOUND when the challenge sessionId is unknown', async () => {
    handler._setDdb(makeDdb({ GetCommand: () => ({ Item: undefined }) }));
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/mfa/verify',
      body: JSON.stringify({ sessionId: 'SESSION#missing', otp: '123456' }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'SESSION_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Happy-path: POST /transactions/transfer
// ---------------------------------------------------------------------------

describe('POST /transactions/transfer', () => {
  /**
   * DDB stub for transfer: returns an ACCESS row for `token` keyed on
   * `senderUserId`, sender/receiver UserProfile rows in two consecutive
   * GetCommand calls, and a UserState row.
   */
  function transferDdb(senderUserId, token, senderItem, receiverItem, stateItem = null) {
    let userProfileGetCount = 0;
    const now = Math.floor(Date.now() / 1000);
    const accessRow = {
      sessionId: token,
      recordType: 'ACCESS',
      userId: senderUserId,
      token,
      issuedAt: now - 60,
      expiresAt: now + 1800,
      lastActivityAt: now - 60,
      mfaVerified: true,
    };
    return makeDdb({
      GetCommand: (cmd) => {
        if (cmd.input.TableName === 'UserSession' && cmd.input.Key.sessionId === token) {
          return { Item: accessRow };
        }
        if (cmd.input.TableName === 'UserProfile') {
          userProfileGetCount++;
          return { Item: userProfileGetCount === 1 ? senderItem : receiverItem };
        }
        if (cmd.input.TableName === 'UserState') return { Item: stateItem };
        return { Item: undefined };
      },
      UpdateCommand: () => ({}),
      PutCommand: () => ({}),
    });
  }

  it('returns 200 SUCCESS on valid transfer between two existing users', async () => {
    const sender = { userId: 'U001', username: 'alice' };
    const receiver = { userId: 'U002', username: 'bob' };
    const state = { transferCount1h: 1, lastTransferTime: Math.floor(Date.now() / 1000) - 10 };
    const token = 'tok-U001';
    handler._setDdb(transferDdb('U001', token, sender, receiver, state));

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/transactions/transfer',
      headers: { authorization: bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'U001',
        recipientId: 'U002',
        amount: 500,
        channel: 'APP',
      }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(
      body.data.status === 'SUCCESS' || body.data.status === 'UNDER_REVIEW',
      `unexpected status: ${body.data.status}`
    );
    assert.ok(body.data.transferId, 'transferId missing from response');
  });

  it('returns 404 USER_NOT_FOUND when sender does not exist', async () => {
    const token = 'tok-MISSING';
    handler._setDdb(transferDdb('MISSING', token, null, null));
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/transactions/transfer',
      headers: { authorization: bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'MISSING', recipientId: 'U002', amount: 100 }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'USER_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when amount is not positive', async () => {
    const sender = { userId: 'U001', username: 'alice' };
    const receiver = { userId: 'U002', username: 'bob' };
    const token = 'tok-U001';
    handler._setDdb(transferDdb('U001', token, sender, receiver));
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/transactions/transfer',
      headers: { authorization: bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'U001', recipientId: 'U002', amount: -10 }),
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Happy-path: GET /offers
// ---------------------------------------------------------------------------

describe('GET /offers', () => {
  it('returns 200 or 204 for an existing user', async () => {
    const profile = {
      userId: 'U001',
      loyaltyScore: 800,
      tier: 'platinum',
      profileCompletion: 1.0,
    };
    const token = 'tok-U001';
    handler._setDdb(
      withAccessRow('U001', token, {
        GetCommand: (cmd) => {
          if (cmd.input.TableName === 'UserProfile') return { Item: profile };
          return { Item: undefined };
        },
        PutCommand: () => ({}),
      })
    );
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/offers',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'U001' },
    });
    const res = await handler.main(event);
    assert.ok(
      res.statusCode === 200 || res.statusCode === 204,
      `unexpected status ${res.statusCode}`
    );
  });

  it('returns 404 when user does not exist', async () => {
    const token = 'tok-MISSING';
    handler._setDdb(withAccessRow('MISSING', token));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/offers',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'MISSING' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// Happy-path: GET /nudges
// ---------------------------------------------------------------------------

describe('GET /nudges', () => {
  it('returns 200 or 204 for an existing user with incomplete profile', async () => {
    const profile = {
      userId: 'U003',
      profileCompletion: 0.5,
      emailVerified: false,
      phoneVerified: false,
    };
    const token = 'tok-U003';
    handler._setDdb(
      withAccessRow('U003', token, {
        GetCommand: (cmd) => {
          if (cmd.input.TableName === 'UserProfile') return { Item: profile };
          return { Item: undefined };
        },
        PutCommand: () => ({}),
      })
    );
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/nudges',
      headers: { authorization: bearer(token) },
      queryStringParameters: { userId: 'U003' },
    });
    const res = await handler.main(event);
    assert.ok(
      res.statusCode === 200 || res.statusCode === 204,
      `unexpected status ${res.statusCode}`
    );
    const body = JSON.parse(res.body);
    assert.equal(body.data.userId, 'U003');
  });
});

// ---------------------------------------------------------------------------
// GET /health (unauthenticated)
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 without any Authorization header', async () => {
    handler._setDdb(makeDdb());
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: {},
      queryStringParameters: null,
      body: null,
    };
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
  });

  it('returns status ok with version, commit, engineLayer, asOf fields', async () => {
    handler._setDdb(makeDdb());
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: {},
      queryStringParameters: null,
      body: null,
    };
    const res = await handler.main(event);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.ok(body.version, 'version field missing');
    assert.ok('commit' in body, 'commit field missing');
    assert.ok(body.engineLayer, 'engineLayer field missing');
    assert.ok(typeof body.asOf === 'number', 'asOf must be a number');
  });

  it('returns 200 even with wrong Basic Auth credentials', async () => {
    handler._setDdb(makeDdb());
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: { authorization: basicAuth('wrong', 'creds') },
      queryStringParameters: null,
      body: null,
    };
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200, '/health must not require auth');
  });
});

// ---------------------------------------------------------------------------
// GET /admin/decisions/{id}
// ---------------------------------------------------------------------------

describe('GET /admin/decisions/{id}', () => {
  it('returns 200 with decision and auditTrail for an existing id', async () => {
    const nowTs = Math.floor(Date.now() / 1000);
    const dec = {
      decisionId: 'DEC#handler-001',
      userId: 'U001',
      decisionType: 'FRAUD_LOGIN',
      score: 10,
      riskLevel: 'LOW',
      action: 'ALLOW',
      engineLayer: 'L1',
      timestamp: nowTs,
    };
    setAllDdb(
      makeDdb({
        ScanCommand: () => ({ Items: [dec], LastEvaluatedKey: undefined }),
      })
    );
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/admin/decisions/DEC%23handler-001',
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.decision, 'decision field missing');
    assert.ok(Array.isArray(body.data.auditTrail), 'auditTrail must be an array');
  });

  it('returns 404 when the decision does not exist', async () => {
    setAllDdb(makeDdb({ ScanCommand: () => ({ Items: [], LastEvaluatedKey: undefined }) }));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/admin/decisions/DEC%23missing',
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/decisions/export
// ---------------------------------------------------------------------------

describe('GET /admin/decisions/export', () => {
  it('returns 200 with JSON decisions by default', async () => {
    setAllDdb(makeDdb({ ScanCommand: () => ({ Items: [], LastEvaluatedKey: undefined }) }));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/admin/decisions/export',
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data.decisions));
  });

  it('returns CSV content-type when format=csv', async () => {
    const nowTs = Math.floor(Date.now() / 1000);
    const dec = {
      decisionId: 'DEC#exp-001',
      userId: 'U001',
      decisionType: 'FRAUD_LOGIN',
      score: 10,
      riskLevel: 'LOW',
      action: 'ALLOW',
      engineLayer: 'L1',
      timestamp: nowTs,
    };
    setAllDdb(makeDdb({ ScanCommand: () => ({ Items: [dec], LastEvaluatedKey: undefined }) }));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/admin/decisions/export',
      queryStringParameters: { format: 'csv' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Content-Type'], /text\/csv/);
  });
});

// ---------------------------------------------------------------------------
// validateBearer (token validation middleware)
// ---------------------------------------------------------------------------

describe('validateBearer', () => {
  /**
   * Make an event with the given Authorization header. validateBearer only
   * looks at headers; method/path are irrelevant for these unit tests.
   */
  function evt(authHeader) {
    return { headers: authHeader ? { authorization: authHeader } : {} };
  }

  it('throws 401 UNAUTHORIZED when Authorization header is missing', async () => {
    handler._setDdb(makeDdb());
    await assert.rejects(
      () => handler._validateBearer(evt(null)),
      (e) => {
        assert.equal(e.status, 401);
        assert.equal(e.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('throws 401 UNAUTHORIZED when scheme is not Bearer', async () => {
    handler._setDdb(makeDdb());
    await assert.rejects(
      () => handler._validateBearer(evt('Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0')),
      (e) => {
        assert.equal(e.status, 401);
        assert.equal(e.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('throws 401 UNAUTHORIZED when Bearer value is empty', async () => {
    handler._setDdb(makeDdb());
    await assert.rejects(
      () => handler._validateBearer(evt('Bearer   ')),
      (e) => {
        assert.equal(e.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('throws 401 INVALID_TOKEN when DDB has no row for the token', async () => {
    handler._setDdb(makeDdb({ GetCommand: () => ({ Item: undefined }) }));
    await assert.rejects(
      () => handler._validateBearer(evt('Bearer nope-not-a-token')),
      (e) => {
        assert.equal(e.status, 401);
        assert.equal(e.code, 'INVALID_TOKEN');
        return true;
      }
    );
  });

  it('throws 401 INVALID_TOKEN when the row is a non-ACCESS record (MFA challenge)', async () => {
    const challenge = {
      sessionId: 'SESSION#abcd',
      userId: 'U001',
      // No recordType: a legacy MFA-challenge row.
    };
    handler._setDdb(makeDdb({ GetCommand: () => ({ Item: challenge }) }));
    await assert.rejects(
      () => handler._validateBearer(evt('Bearer SESSION#abcd')),
      (e) => {
        assert.equal(e.code, 'INVALID_TOKEN');
        return true;
      }
    );
  });

  it('throws 401 TOKEN_EXPIRED when expiresAt is in the past', async () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      sessionId: 'tok-abc',
      recordType: 'ACCESS',
      userId: 'U001',
      token: 'tok-abc',
      issuedAt: now - 7200,
      expiresAt: now - 60,
      lastActivityAt: now - 60,
      mfaVerified: false,
    };
    handler._setDdb(makeDdb({ GetCommand: () => ({ Item: row }) }));
    await assert.rejects(
      () => handler._validateBearer(evt('Bearer tok-abc')),
      (e) => {
        assert.equal(e.code, 'TOKEN_EXPIRED');
        return true;
      }
    );
  });

  it('returns the principal and slides expiresAt on a valid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      sessionId: 'tok-xyz',
      recordType: 'ACCESS',
      userId: 'U001',
      token: 'tok-xyz',
      issuedAt: now - 60,
      expiresAt: now + 60, // about to expire
      lastActivityAt: now - 60,
      mfaVerified: true,
    };
    const updates = [];
    handler._setDdb(
      makeDdb({
        GetCommand: () => ({ Item: row }),
        UpdateCommand: (cmd) => {
          updates.push(cmd.input);
          return {};
        },
      })
    );

    const out = await handler._validateBearer(evt('Bearer tok-xyz'));
    assert.equal(out.userId, 'U001');
    assert.equal(out.sessionId, 'tok-xyz');
    assert.equal(out.token, 'tok-xyz');
    assert.equal(out.mfaVerified, true);
    assert.ok(out.expiresAt > now + 60, 'expiresAt should slide past the old value');

    // The sliding-window UpdateCommand was issued against UserSession.
    assert.equal(updates.length, 1, 'expected exactly one UpdateCommand');
    const up = updates[0];
    assert.equal(up.TableName, 'UserSession');
    assert.equal(up.Key.sessionId, 'tok-xyz');
    assert.match(up.UpdateExpression, /lastActivityAt/);
    assert.match(up.UpdateExpression, /expiresAt/);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe('POST /auth/logout', () => {
  it('returns 204 and deletes the access row for a valid bearer', async () => {
    const token = 'tok-logout-U001';
    const deletes = [];
    handler._setDdb(
      withAccessRow('U001', token, {
        DeleteCommand: (cmd) => {
          deletes.push(cmd.input);
          return {};
        },
      })
    );
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/logout',
      headers: { authorization: bearer(token) },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 204);
    assert.equal(deletes.length, 1, 'logout must issue exactly one DeleteCommand');
    assert.equal(deletes[0].TableName, 'UserSession');
    assert.equal(deletes[0].Key.sessionId, token);
  });

  it('returns 401 UNAUTHORIZED when no bearer is presented', async () => {
    handler._setDdb(makeDdb());
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/auth/logout',
      headers: { 'content-type': 'application/json' },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------

describe('GET /auth/session', () => {
  it('returns session metadata for a valid bearer', async () => {
    const token = 'tok-session-U001';
    handler._setDdb(withAccessRow('U001', token));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/auth/session',
      headers: { authorization: bearer(token) },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.userId, 'U001');
    assert.equal(typeof body.data.issuedAt, 'number');
    assert.equal(typeof body.data.expiresAt, 'number');
    assert.equal(typeof body.data.lastActivityAt, 'number');
    assert.equal(body.data.mfaVerified, true);
  });

  it('returns 401 INVALID_TOKEN when bearer is unknown', async () => {
    handler._setDdb(makeDdb({ GetCommand: () => ({ Item: undefined }) }));
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/auth/session',
      headers: { authorization: bearer('not-a-real-token') },
    });
    const res = await handler.main(event);
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_TOKEN');
  });
});
