'use strict';

/**
 * Tests for admin.js endpoints.
 * Uses node:test and a DDB test seam (_setDdb) to avoid real AWS calls.
 *
 * All tests follow Red-Green-Refactor: these were written before admin.js existed.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Fake DDB builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal DDB Document Client stub.
 *
 * scanItems  - array of items returned from Scan
 * queryItems - array of items returned from Query
 * getItem    - single item returned from Get (or null)
 */
function fakeDdb({ scanItems = [], queryItems = [], getItem = null, putCapture = [] } = {}) {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'ScanCommand') {
        return { Items: scanItems, LastEvaluatedKey: null };
      }
      if (name === 'QueryCommand') {
        return { Items: queryItems, LastEvaluatedKey: null };
      }
      if (name === 'GetCommand') {
        return { Item: getItem };
      }
      if (name === 'PutCommand') {
        putCapture.push(cmd.input);
        return {};
      }
      if (name === 'UpdateCommand') {
        return {};
      }
      throw new Error(`Unexpected command: ${name}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function makeDecision(overrides = {}) {
  return {
    decisionId: `DEC#${Date.now()}-${Math.random()}`,
    userId: 'user-001',
    decisionType: 'FRAUD_LOGIN',
    score: 10,
    riskLevel: 'LOW',
    action: 'ALLOW',
    engineLayer: 'L1',
    timestamp: nowSec(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Load admin module fresh for each describe block using _setDdb seam
// ---------------------------------------------------------------------------

let admin;

function loadAdmin(ddb) {
  // Clear require cache so _setDdb takes effect per describe block
  const key = require.resolve('./admin');
  delete require.cache[key];
  admin = require('./admin');
  admin._setDdb(ddb);
}

// ---------------------------------------------------------------------------
// getDecisions
// ---------------------------------------------------------------------------

describe('getDecisions', () => {
  beforeEach(() => {
    const items = [
      makeDecision({ decisionType: 'FRAUD_LOGIN', timestamp: nowSec() - 10 }),
      makeDecision({ decisionType: 'NUDGE', timestamp: nowSec() - 20 }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));
  });

  test('returns decisions sorted by timestamp desc', async () => {
    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getDecisions(event, 'cid-001');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.ok(Array.isArray(body.data.decisions));
    // First item should have higher timestamp (more recent)
    if (body.data.decisions.length > 1) {
      assert.ok(body.data.decisions[0].timestamp >= body.data.decisions[1].timestamp);
    }
  });

  test('rejects unknown window value with 400', async () => {
    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { window: 'bad_window' },
    };
    const resp = await admin.getDecisions(event, 'cid-002');
    assert.equal(resp.statusCode, 400);
    const body = JSON.parse(resp.body);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('filters by type', async () => {
    const ts = nowSec();
    const items = [
      makeDecision({ decisionType: 'FRAUD_LOGIN', timestamp: ts }),
      makeDecision({ decisionType: 'NUDGE', timestamp: ts - 5 }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { type: 'FRAUD_LOGIN' },
    };
    const resp = await admin.getDecisions(event, 'cid-003');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.ok(body.data.decisions.every((d) => d.decisionType === 'FRAUD_LOGIN'));
  });

  test('applies limit cap at 200', async () => {
    const items = Array.from({ length: 300 }, (_, i) => makeDecision({ timestamp: nowSec() - i }));
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { limit: '300' },
    };
    const resp = await admin.getDecisions(event, 'cid-004');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.ok(body.data.decisions.length <= 200);
  });

  test('uses query (not scan) when userId filter provided', async () => {
    let usedQuery = false;
    const ddb = {
      send: async (cmd) => {
        if (cmd.constructor.name === 'QueryCommand') usedQuery = true;
        return { Items: [], LastEvaluatedKey: null };
      },
    };
    loadAdmin(ddb);

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { userId: 'user-001' },
    };
    await admin.getDecisions(event, 'cid-005');
    assert.ok(usedQuery, 'should use Query when userId is provided');
  });

  test('returns 403 for non-admin user', async () => {
    // Encode unknown-user:demoSecret as Basic Auth
    const token = Buffer.from('unknownUser:demoSecret').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.getDecisions(event, 'cid-006');
    assert.equal(resp.statusCode, 403);
    const body = JSON.parse(resp.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// getMetrics
// ---------------------------------------------------------------------------

describe('getMetrics', () => {
  test('aggregates total, l1, l1plus_l2 counts correctly', async () => {
    const ts = nowSec();
    const items = [
      makeDecision({
        engineLayer: 'L1',
        decisionType: 'FRAUD_LOGIN',
        action: 'ALLOW',
        timestamp: ts,
      }),
      makeDecision({
        engineLayer: 'L1',
        decisionType: 'NUDGE',
        action: 'NUDGE',
        timestamp: ts - 5,
      }),
      makeDecision({
        engineLayer: 'L1+L2',
        decisionType: 'FRAUD_TRANSFER',
        action: 'BLOCK',
        timestamp: ts - 10,
      }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getMetrics(event, 'cid-007');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    const { totals, costEstimateUsd, asOf } = body.data;
    assert.equal(totals.total, 3);
    assert.equal(totals.l1, 2);
    assert.equal(totals.l1plus_l2, 1);
    // costEstimateUsd = 1 * 0.0006
    assert.ok(Math.abs(costEstimateUsd - 0.0006) < 0.00001);
    assert.ok(typeof asOf === 'number');
  });

  test('by_type and by_action maps are populated', async () => {
    const ts = nowSec();
    const items = [
      makeDecision({
        engineLayer: 'L1',
        decisionType: 'FRAUD_LOGIN',
        action: 'ALLOW',
        timestamp: ts,
      }),
      makeDecision({
        engineLayer: 'L1',
        decisionType: 'FRAUD_LOGIN',
        action: 'BLOCK',
        timestamp: ts - 1,
      }),
      makeDecision({
        engineLayer: 'L1',
        decisionType: 'NUDGE',
        action: 'NUDGE',
        timestamp: ts - 2,
      }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getMetrics(event, 'cid-008');
    const body = JSON.parse(resp.body);
    const { totals } = body.data;
    assert.equal(totals.by_type['FRAUD_LOGIN'], 2);
    assert.equal(totals.by_type['NUDGE'], 1);
    assert.equal(totals.by_action['ALLOW'], 1);
    assert.equal(totals.by_action['BLOCK'], 1);
    assert.equal(totals.by_action['NUDGE'], 1);
  });

  test('returns 403 for non-admin user', async () => {
    const token = Buffer.from('notAdmin:secret').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.getMetrics(event, 'cid-009');
    assert.equal(resp.statusCode, 403);
  });
});

// ---------------------------------------------------------------------------
// releaseDecision
// ---------------------------------------------------------------------------

describe('releaseDecision', () => {
  test('writes a DECISION_RELEASE row and returns released:true', async () => {
    const putCapture = [];
    const originalDecisionId = 'DEC#original-001';
    const blockedUser = {
      userId: 'user-001',
      decisionId: originalDecisionId,
      decisionType: 'FRAUD_LOGIN',
      isBlocked: true,
    };
    // getItem returns the original decision; scan returns nothing extra
    const ddb = {
      send: async (cmd) => {
        const name = cmd.constructor.name;
        if (name === 'ScanCommand') {
          return { Items: [blockedUser], LastEvaluatedKey: null };
        }
        if (name === 'PutCommand') {
          putCapture.push(cmd.input);
          return {};
        }
        if (name === 'UpdateCommand') {
          return {};
        }
        return { Items: [], Item: null };
      },
    };
    loadAdmin(ddb);

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      pathParameters: { id: originalDecisionId },
      queryStringParameters: {},
    };
    const resp = await admin.releaseDecision(event, 'cid-010');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.equal(body.data.released, true);
    assert.equal(body.data.originalDecisionId, originalDecisionId);
    assert.ok(typeof body.data.releasedAt === 'number');
    // A DECISION_RELEASE put should have been issued
    const releasePut = putCapture.find((p) => p.Item && p.Item.decisionType === 'DECISION_RELEASE');
    assert.ok(releasePut, 'should have written a DECISION_RELEASE row');
    assert.equal(releasePut.Item.originalDecisionId, originalDecisionId);
  });

  test('returns 404 when decision not found', async () => {
    loadAdmin(fakeDdb({ scanItems: [] }));
    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      pathParameters: { id: 'DEC#does-not-exist' },
      queryStringParameters: {},
    };
    const resp = await admin.releaseDecision(event, 'cid-011');
    assert.equal(resp.statusCode, 404);
  });

  test('returns 403 for non-admin user', async () => {
    const token = Buffer.from('notAdmin:secret').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      pathParameters: { id: 'DEC#x' },
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.releaseDecision(event, 'cid-012');
    assert.equal(resp.statusCode, 403);
  });
});

// ---------------------------------------------------------------------------
// getUsers
// ---------------------------------------------------------------------------

describe('getUsers', () => {
  test('strips passwordHash from returned users', async () => {
    const items = [
      { userId: 'user-001', username: 'alice', passwordHash: 'secret123', tier: 'gold' },
      { userId: 'user-002', username: 'bob', passwordHash: 'hunter2', tier: 'silver' },
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getUsers(event, 'cid-013');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.ok(Array.isArray(body.data.users));
    assert.ok(body.data.users.every((u) => u.passwordHash === undefined));
    assert.ok(body.data.users.every((u) => u.userId !== undefined));
  });

  test('applies default limit of 50 and caps at 100', async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      userId: `user-${i}`,
      username: `user${i}`,
      passwordHash: 'x',
    }));
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { limit: '150' },
    };
    const resp = await admin.getUsers(event, 'cid-014');
    const body = JSON.parse(resp.body);
    assert.ok(body.data.users.length <= 100);
  });

  test('cursor round-trips via base64', async () => {
    const lastKey = { userId: 'user-050' };
    const items = [{ userId: 'user-051', username: 'carol', passwordHash: 'y' }];
    // Return a LastEvaluatedKey to simulate more pages
    const ddb = {
      send: async (cmd) => {
        if (cmd.constructor.name === 'ScanCommand') {
          return { Items: items, LastEvaluatedKey: lastKey };
        }
        return {};
      },
    };
    loadAdmin(ddb);

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getUsers(event, 'cid-015');
    const body = JSON.parse(resp.body);
    assert.ok(body.data.nextCursor !== null);
    // Decode and verify round-trip
    const decoded = JSON.parse(Buffer.from(body.data.nextCursor, 'base64').toString('utf8'));
    assert.deepEqual(decoded, lastKey);
  });

  test('nextCursor is null when no more pages', async () => {
    const items = [{ userId: 'user-001', username: 'alice', passwordHash: 'x' }];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.getUsers(event, 'cid-016');
    const body = JSON.parse(resp.body);
    assert.equal(body.data.nextCursor, null);
  });

  test('returns 403 for non-admin user', async () => {
    const token = Buffer.from('hacker:pass').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.getUsers(event, 'cid-017');
    assert.equal(resp.statusCode, 403);
  });
});

// ---------------------------------------------------------------------------
// extractIdFromPath helper
// ---------------------------------------------------------------------------

describe('extractIdFromPath', () => {
  test('extracts id between prefix and suffix in a release path', () => {
    loadAdmin(fakeDdb({}));
    const id = admin.extractIdFromPath(
      '/admin/decisions/DEC%23abc-123/release',
      '/admin/decisions',
      '/release'
    );
    assert.equal(id, 'DEC%23abc-123');
  });

  test('returns null when path does not match', () => {
    loadAdmin(fakeDdb({}));
    const id = admin.extractIdFromPath('/admin/decisions', '/admin/decisions', '/release');
    assert.equal(id, null);
  });

  test('extracts id from a detail path (no suffix)', () => {
    loadAdmin(fakeDdb({}));
    const id = admin.extractIdFromPath('/admin/decisions/DEC%23xyz-789', '/admin/decisions', '');
    assert.equal(id, 'DEC%23xyz-789');
  });
});

// ---------------------------------------------------------------------------
// releaseDecision - path extraction from rawPath (bug fix)
// ---------------------------------------------------------------------------

describe('releaseDecision path extraction from rawPath', () => {
  test('finds the decision id from rawPath when pathParameters is absent', async () => {
    const putCapture = [];
    const originalDecisionId = 'DEC#rawpath-001';
    const blockedUser = {
      userId: 'user-raw',
      decisionId: originalDecisionId,
      decisionType: 'FRAUD_LOGIN',
      isBlocked: true,
    };
    const ddb = {
      send: async (cmd) => {
        const name = cmd.constructor.name;
        if (name === 'ScanCommand') return { Items: [blockedUser], LastEvaluatedKey: null };
        if (name === 'PutCommand') {
          putCapture.push(cmd.input);
          return {};
        }
        if (name === 'UpdateCommand') return {};
        return { Items: [], Item: null };
      },
    };
    loadAdmin(ddb);

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      pathParameters: null,
      rawPath: `/admin/decisions/${encodeURIComponent(originalDecisionId)}/release`,
      queryStringParameters: {},
    };
    const resp = await admin.releaseDecision(event, 'cid-018');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.equal(body.data.released, true);
  });
});

// ---------------------------------------------------------------------------
// getDecisionById
// ---------------------------------------------------------------------------

describe('getDecisionById', () => {
  test('returns 200 with decision and L1-only audit trail', async () => {
    const dec = makeDecision({ decisionId: 'DEC#001', engineLayer: 'L1', score: 15 });
    loadAdmin(fakeDdb({ scanItems: [dec] }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      rawPath: '/admin/decisions/DEC%23001',
      pathParameters: null,
      queryStringParameters: {},
    };
    const resp = await admin.getDecisionById(event, 'cid-019');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.ok(body.data.decision, 'decision field missing');
    assert.ok(Array.isArray(body.data.auditTrail), 'auditTrail must be an array');
    assert.equal(body.data.auditTrail.length, 1);
    assert.match(body.data.auditTrail[0].step, /L1/i);
  });

  test('returns 200 with L1+L2 audit trail of two steps', async () => {
    const dec = makeDecision({
      decisionId: 'DEC#002',
      engineLayer: 'L1+L2',
      score: 75,
      llmLatencyMs: 320,
      llmModel: 'gpt-4o-mini',
    });
    loadAdmin(fakeDdb({ scanItems: [dec] }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      rawPath: '/admin/decisions/DEC%23002',
      pathParameters: null,
      queryStringParameters: {},
    };
    const resp = await admin.getDecisionById(event, 'cid-020');
    assert.equal(resp.statusCode, 200);
    const body = JSON.parse(resp.body);
    assert.equal(body.data.auditTrail.length, 2);
    const llmStep = body.data.auditTrail[1];
    assert.ok(llmStep.llmLatencyMs !== undefined, 'L2 step should include llmLatencyMs');
    assert.equal(llmStep.llmModel, 'gpt-4o-mini');
  });

  test('returns 404 when decision does not exist', async () => {
    loadAdmin(fakeDdb({ scanItems: [] }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      rawPath: '/admin/decisions/DEC%23missing',
      pathParameters: null,
      queryStringParameters: {},
    };
    const resp = await admin.getDecisionById(event, 'cid-021');
    assert.equal(resp.statusCode, 404);
  });

  test('returns 403 for non-admin caller', async () => {
    const token = Buffer.from('nobody:secret').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      rawPath: '/admin/decisions/DEC%23001',
      pathParameters: null,
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.getDecisionById(event, 'cid-022');
    assert.equal(resp.statusCode, 403);
  });
});

// ---------------------------------------------------------------------------
// exportDecisions
// ---------------------------------------------------------------------------

describe('exportDecisions', () => {
  test('returns JSON array matching decisions shape (format=json)', async () => {
    const ts = nowSec();
    const items = [
      makeDecision({ timestamp: ts, score: 20, riskLevel: 'LOW', action: 'ALLOW' }),
      makeDecision({ timestamp: ts - 5, score: 80, riskLevel: 'HIGH', action: 'BLOCK' }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { window: '24h', format: 'json' },
    };
    const resp = await admin.exportDecisions(event, 'cid-023');
    assert.equal(resp.statusCode, 200);
    assert.match(resp.headers['Content-Type'], /application\/json/);
    const body = JSON.parse(resp.body);
    assert.ok(Array.isArray(body.data.decisions));
    assert.equal(body.data.decisions.length, 2);
  });

  test('returns CSV with header row and correct column count (format=csv)', async () => {
    const ts = nowSec();
    const items = [
      makeDecision({
        timestamp: ts,
        score: 30,
        riskLevel: 'LOW',
        action: 'ALLOW',
        reason: 'OK',
        engineLayer: 'L1',
      }),
    ];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { format: 'csv' },
    };
    const resp = await admin.exportDecisions(event, 'cid-024');
    assert.equal(resp.statusCode, 200);
    assert.match(resp.headers['Content-Type'], /text\/csv/);
    const lines = resp.body.trim().split('\n');
    assert.ok(lines.length >= 2, 'expected at least header + one data row');
    const headerCols = lines[0].split(',');
    assert.equal(headerCols.length, 11, 'CSV must have 11 columns');
  });

  test('CSV escapes values that contain commas', async () => {
    const ts = nowSec();
    const items = [makeDecision({ timestamp: ts, reason: 'score, high risk' })];
    loadAdmin(fakeDdb({ scanItems: items }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: { format: 'csv' },
    };
    const resp = await admin.exportDecisions(event, 'cid-025');
    assert.ok(resp.body.includes('"score, high risk"'), 'comma-containing value must be quoted');
  });

  test('defaults to json when format is omitted', async () => {
    loadAdmin(fakeDdb({ scanItems: [] }));

    const event = {
      headers: { authorization: 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0' },
      queryStringParameters: {},
    };
    const resp = await admin.exportDecisions(event, 'cid-026');
    assert.equal(resp.statusCode, 200);
    assert.match(resp.headers['Content-Type'], /application\/json/);
  });

  test('returns 403 for non-admin caller', async () => {
    const token = Buffer.from('nobody:x').toString('base64');
    const event = {
      headers: { authorization: `Basic ${token}` },
      queryStringParameters: {},
    };
    loadAdmin(fakeDdb({}));
    const resp = await admin.exportDecisions(event, 'cid-027');
    assert.equal(resp.statusCode, 403);
  });
});
