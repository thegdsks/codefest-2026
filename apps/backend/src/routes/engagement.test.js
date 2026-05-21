'use strict';

/**
 * Engagement route unit tests.
 *
 * Covers:
 *   - Single-event POST /engagement/event accepts context block (backwards compatible)
 *   - trackEvents batch endpoint accepts array and returns processed count
 *   - context.flowState is persisted via upsertFlowState when present
 *   - context.flowState is skipped gracefully when absent
 */

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bearerAuth(token) {
  return `Bearer ${token}`;
}

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    path: '/engagement/event',
    headers: {
      authorization: bearerAuth('tok-abc'),
      'content-type': 'application/json',
    },
    queryStringParameters: null,
    body: null,
    ...overrides,
  };
}

function makeEngagementBody(overrides = {}) {
  return {
    signal: 'rage_click',
    userId: 'USER#001',
    params: { clickCount: 3 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DDB stub
// ---------------------------------------------------------------------------

function makeDdb(handlers = {}) {
  return {
    send(command) {
      const name = command.constructor.name;
      if (Object.hasOwn(handlers, name)) {
        const val = handlers[name];
        return Promise.resolve(typeof val === 'function' ? val(command) : val);
      }
      return Promise.resolve({});
    },
  };
}

function userProfile(overrides = {}) {
  return {
    userId: 'USER#001',
    tier: 'Gold',
    loyaltyScore: 600,
    profileCompletion: 70,
    mfaSecret: null,
    ...overrides,
  };
}

function accessSession(userId = 'USER#001', token = 'tok-abc') {
  return {
    recordType: 'ACCESS',
    sessionId: token,
    token,
    userId,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

let trackEvent;
let trackEvents;
let setDdb;

before(async () => {
  const ddbModule = require('../lib/ddb');
  setDdb = ddbModule._setDdb;

  const engModule = require('./engagement');
  trackEvent = engModule.trackEvent;
  trackEvents = engModule.trackEvents;
});

afterEach(() => {});

// ---------------------------------------------------------------------------
// 1. Single event - accepts context block (backwards compatible)
// ---------------------------------------------------------------------------

function makeFullDdb(opts = {}) {
  const { onUpdate } = opts;
  return makeDdb({
    GetCommand: (cmd) => {
      if (cmd.input.TableName.includes('UserProfile')) return { Item: userProfile() };
      if (cmd.input.TableName.includes('UserSession')) return { Item: accessSession() };
      return {};
    },
    UpdateCommand: (cmd) => {
      if (onUpdate) onUpdate(cmd);
      return {};
    },
    QueryCommand: () => ({ Items: [], Count: 0 }),
    PutCommand: () => ({}),
  });
}

describe('trackEvent with context block', () => {
  it('returns 200 when context block is present', async () => {
    const signalContext = {
      trustScore: 52,
      scrollDepthPct: 40,
      clickCountInSession: 5,
      routeChangesInSession: 1,
      recentEventTypes: ['rage_click'],
      pageTimeSinceMountMs: 8000,
      device: {
        userAgent: 'Mozilla/5.0',
        viewportWidth: 1440,
        viewportHeight: 900,
        language: 'en-US',
        timezone: 'America/New_York',
        pixelRatio: 2,
      },
    };

    setDdb(makeFullDdb());

    const event = makeEvent({
      body: JSON.stringify({
        ...makeEngagementBody(),
        context: signalContext,
      }),
    });

    const result = await trackEvent(event, 'corr-001');

    assert.equal(result.statusCode, 200, 'should return 200 when context block provided');
    const body = JSON.parse(result.body);
    assert.ok(body.data, 'response body should have data field');
  });

  it('returns 200 without context block (backwards compatible)', async () => {
    setDdb(makeFullDdb());

    const event = makeEvent({
      body: JSON.stringify(makeEngagementBody()),
    });

    const result = await trackEvent(event, 'corr-002');
    assert.equal(result.statusCode, 200, 'should return 200 without context block');
  });
});

// ---------------------------------------------------------------------------
// 2. FlowState persistence
// ---------------------------------------------------------------------------

describe('trackEvent flowState persistence', () => {
  it('calls upsertFlowState when context.flowState is present', async () => {
    let upsertCalled = false;
    let capturedFlowState = null;

    setDdb(
      makeFullDdb({
        onUpdate: (cmd) => {
          if (cmd.input.ExpressionAttributeValues && cmd.input.ExpressionAttributeValues[':fs']) {
            upsertCalled = true;
            capturedFlowState = cmd.input.ExpressionAttributeValues[':fs'];
          }
        },
      })
    );

    const flowState = {
      page: 'transfer',
      step: 'confirm',
      amountSfc: 5000,
      recipientId: 'USER#002',
    };

    const event = makeEvent({
      body: JSON.stringify({
        ...makeEngagementBody(),
        context: {
          trustScore: 70,
          recentEventTypes: [],
          scrollDepthPct: 20,
          clickCountInSession: 2,
          routeChangesInSession: 0,
          pageTimeSinceMountMs: 3000,
          device: {
            userAgent: 'test',
            viewportWidth: 1280,
            viewportHeight: 720,
            language: 'en',
            timezone: 'UTC',
            pixelRatio: 1,
          },
          flowState,
        },
      }),
    });

    await trackEvent(event, 'corr-003');

    assert.ok(upsertCalled, 'upsertFlowState should be called when flowState present');
    assert.deepEqual(capturedFlowState, flowState, 'flowState should be persisted as-is');
  });

  it('does NOT call upsertFlowState when context.flowState is absent', async () => {
    let upsertCalled = false;

    setDdb(
      makeFullDdb({
        onUpdate: (cmd) => {
          if (cmd.input.ExpressionAttributeValues && cmd.input.ExpressionAttributeValues[':fs']) {
            upsertCalled = true;
          }
        },
      })
    );

    const event = makeEvent({
      body: JSON.stringify({
        ...makeEngagementBody(),
        context: { trustScore: 70, recentEventTypes: [] },
      }),
    });

    await trackEvent(event, 'corr-004');

    assert.equal(upsertCalled, false, 'upsertFlowState must not be called when flowState absent');
  });
});

// ---------------------------------------------------------------------------
// 3. Batch endpoint
// ---------------------------------------------------------------------------

describe('trackEvents batch endpoint', () => {
  it('returns 200 with processed count for a valid batch', async () => {
    setDdb(makeFullDdb());

    const events = [
      { signal: 'rage_click', userId: 'USER#001', params: { clickCount: 3 } },
      { signal: 'dwell_no_action', userId: 'USER#001', params: { thresholdMs: 30000 } },
    ];

    const event = makeEvent({
      path: '/engagement/events',
      body: JSON.stringify({ events }),
    });

    const result = await trackEvents(event, 'corr-batch-001');

    assert.equal(result.statusCode, 200, 'batch endpoint should return 200');
    const body = JSON.parse(result.body);
    assert.ok(body.data, 'response should have data');
    assert.equal(body.data.processed, 2, 'should report 2 processed events');
    assert.ok(Array.isArray(body.data.results), 'results should be an array');
  });

  it('returns 400 when events array is missing', async () => {
    const event = makeEvent({
      path: '/engagement/events',
      body: JSON.stringify({ notEvents: [] }),
    });

    const result = await trackEvents(event, 'corr-batch-002');
    assert.equal(result.statusCode, 400, 'should return 400 for missing events array');
  });

  it('returns 400 when events array is empty', async () => {
    const event = makeEvent({
      path: '/engagement/events',
      body: JSON.stringify({ events: [] }),
    });

    const result = await trackEvents(event, 'corr-batch-003');
    assert.equal(result.statusCode, 400, 'should return 400 for empty events array');
  });
});

// ---------------------------------------------------------------------------
// 4. ENGAGEMENT_SIGNAL UserActivity write
// ---------------------------------------------------------------------------

describe('trackEvent ENGAGEMENT_SIGNAL UserActivity write', () => {
  it('writes a UserActivity row with activityType=ENGAGEMENT_SIGNAL for ALLOW action', async () => {
    const puts = [];
    setDdb(
      makeDdb({
        GetCommand: (cmd) => {
          if (cmd.input.TableName.includes('UserProfile')) return { Item: userProfile() };
          if (cmd.input.TableName.includes('UserSession')) return { Item: accessSession() };
          return {};
        },
        UpdateCommand: () => ({}),
        QueryCommand: () => ({ Items: [], Count: 0 }),
        PutCommand: (cmd) => {
          puts.push(cmd.input.Item);
          return {};
        },
      })
    );

    const event = makeEvent({
      body: JSON.stringify({
        signal: 'rage_click',
        userId: 'USER#001',
        params: { clickCount: 3 },
      }),
    });

    const result = await trackEvent(event, 'corr-signal-001');
    assert.equal(result.statusCode, 200, 'should return 200');

    const activityRow = puts.find((p) => p && p.activityType === 'ENGAGEMENT_SIGNAL');
    assert.ok(activityRow, 'should write an ENGAGEMENT_SIGNAL row to UserActivity');
    assert.equal(activityRow.userId, 'USER#001', 'userId should match');
    assert.equal(activityRow.signal, 'rage_click', 'signal name should be stored');
    assert.ok(typeof activityRow.score === 'number', 'score should be a number');
    assert.ok(typeof activityRow.activityTime === 'number', 'activityTime should be epoch ms');
    assert.ok(activityRow.activityTime > 1e12, 'activityTime should be epoch milliseconds');
  });

  it('writes ENGAGEMENT_SIGNAL row even when action is non-ALLOW (NUDGE)', async () => {
    const puts = [];
    setDdb(
      makeDdb({
        GetCommand: (cmd) => {
          if (cmd.input.TableName.includes('UserProfile')) return { Item: userProfile() };
          if (cmd.input.TableName.includes('UserSession')) return { Item: accessSession() };
          return {};
        },
        UpdateCommand: () => ({}),
        QueryCommand: () => ({ Items: [], Count: 0 }),
        PutCommand: (cmd) => {
          puts.push(cmd.input.Item);
          return {};
        },
      })
    );

    // High click count to push score above NUDGE threshold
    const event = makeEvent({
      body: JSON.stringify({
        signal: 'rage_click',
        userId: 'USER#001',
        params: { clickCount: 20 },
      }),
    });

    await trackEvent(event, 'corr-signal-002');

    const activityRow = puts.find((p) => p && p.activityType === 'ENGAGEMENT_SIGNAL');
    assert.ok(activityRow, 'ENGAGEMENT_SIGNAL row should be written regardless of action');
    assert.equal(activityRow.signal, 'rage_click');
  });

  it('includes sessionId in ENGAGEMENT_SIGNAL row when provided in body', async () => {
    const puts = [];
    setDdb(
      makeDdb({
        GetCommand: (cmd) => {
          if (cmd.input.TableName.includes('UserProfile')) return { Item: userProfile() };
          if (cmd.input.TableName.includes('UserSession')) return { Item: accessSession() };
          return {};
        },
        UpdateCommand: () => ({}),
        QueryCommand: () => ({ Items: [], Count: 0 }),
        PutCommand: (cmd) => {
          puts.push(cmd.input.Item);
          return {};
        },
      })
    );

    const event = makeEvent({
      body: JSON.stringify({
        signal: 'dwell_no_action',
        userId: 'USER#001',
        sessionId: 'sess-xyz-123',
        params: { thresholdMs: 30000 },
      }),
    });

    await trackEvent(event, 'corr-signal-003');

    const activityRow = puts.find((p) => p && p.activityType === 'ENGAGEMENT_SIGNAL');
    assert.ok(activityRow, 'ENGAGEMENT_SIGNAL row should exist');
    assert.equal(activityRow.sessionId, 'sess-xyz-123', 'sessionId should be stored');
  });
});
