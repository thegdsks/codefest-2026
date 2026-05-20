'use strict';

/**
 * Admin endpoints module.
 *
 * Exports: getDecisions, getMetrics, releaseDecision, getUsers
 * Test seam: _setDdb(client) - injects a DDB client stub for unit tests.
 *
 * Auth: every exported function checks that the Basic Auth subject belongs to
 * ADMIN_USERNAMES (comma-separated env var, defaults to "demoClient"). The
 * gateway already validates the secret; this layer validates the subject role.
 */

const { getStats: getBudgetStats } = require('./engine/budget');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

// Default DDB client, replaced by _setDdb in tests.
let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function _setDdb(client) {
  ddb = client;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TABLE_DECISION = process.env.TABLE_DECISION_STORE || 'DecisionStore';
const TABLE_USER_PROFILE = process.env.TABLE_USER_PROFILE || 'UserProfile';
const TABLE_USER_STATE = process.env.TABLE_USER_STATE || 'UserState';

// Comma-separated list of usernames allowed to call admin endpoints.
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || 'demoClient')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Unit cost per L1+L2 call (placeholder - tune once real LLM pricing lands).
// Source: rough estimate based on gpt-4o-mini input/output tokens per nudge call.
const EST_LLM_UNIT_USD = 0.0006;

// Allowed window values and their span in seconds.
const WINDOW_SECONDS = {
  '1h': 3600,
  '24h': 86400,
  '7d': 7 * 86400,
};

// Valid decision type values.
const VALID_TYPES = new Set([
  'FRAUD_LOGIN',
  'FRAUD_TRANSFER',
  'ENGAGEMENT_OFFER',
  'NUDGE',
  'PROFILE_COMPLETENESS',
  'MFA_VERIFY',
  'DECISION_RELEASE',
]);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify({ correlationId: correlationId || '', ...payload }),
  };
}

function err(statusCode, correlationId, code, message) {
  return json(statusCode, correlationId, { error: { code, message } });
}

/**
 * Extract the Basic Auth username from the Authorization header.
 * Returns null if the header is absent or malformed.
 *
 * @param {object} headers
 * @returns {string|null}
 */
function extractBasicAuthUser(headers) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization');
  const auth = key ? headers[key] : null;
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.substring('Basic '.length).trim(), 'base64').toString('utf8');
    return decoded.split(':')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check that the caller's Basic Auth username is in ADMIN_USERNAMES.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {{ ok: boolean, response?: object }}
 */
function requireAdmin(event, correlationId) {
  const user = extractBasicAuthUser(event.headers);
  if (!user || !ADMIN_USERNAMES.includes(user)) {
    return {
      ok: false,
      response: err(403, correlationId, 'FORBIDDEN', 'Admin access required'),
    };
  }
  return { ok: true };
}

function qstr(event, key) {
  return (event.queryStringParameters && event.queryStringParameters[key]) || null;
}

// ---------------------------------------------------------------------------
// GET /admin/decisions  (T9)
// ---------------------------------------------------------------------------

/**
 * Build the ExpressionAttributeNames and ExpressionAttributeValues for a
 * time-window filter, optionally extended with a decisionType equality check.
 *
 * @param {number} cutoff - epoch seconds lower bound
 * @param {string|null} typeFilter - optional decisionType value
 * @returns {{ filterParts: string[], exprNames: object, exprValues: object }}
 */
function buildDecisionFilter(cutoff, typeFilter) {
  const filterParts = ['#ts >= :cutoff'];
  const exprNames = { '#ts': 'timestamp' };
  const exprValues = { ':cutoff': cutoff };
  if (typeFilter) {
    filterParts.push('#dt = :dt');
    exprNames['#dt'] = 'decisionType';
    exprValues[':dt'] = typeFilter;
  }
  return { filterParts, exprNames, exprValues };
}

/**
 * Fetch decision items for a given user via Query (efficient).
 *
 * @param {number} cutoff
 * @param {string} userId
 * @param {string|null} typeFilter
 * @returns {Promise<object[]>}
 */
async function fetchDecisionsByUser(cutoff, userId, typeFilter) {
  const { filterParts, exprNames, exprValues } = buildDecisionFilter(cutoff, typeFilter);
  exprValues[':uid'] = userId;
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_DECISION,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );
  return result.Items || [];
}

/**
 * Fetch decision items across all users via Scan.
 * NOTE: switch to a GSI after the demo
 *
 * @param {number} cutoff
 * @param {string|null} typeFilter
 * @returns {Promise<object[]>}
 */
async function fetchDecisionsScan(cutoff, typeFilter) {
  const { filterParts, exprNames, exprValues } = buildDecisionFilter(cutoff, typeFilter);
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_DECISION,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );
  return result.Items || [];
}

/**
 * Return a filtered, sorted list of decision records.
 *
 * Query params:
 *   window  - "1h" | "24h" | "7d" (default "24h")
 *   type    - one of VALID_TYPES (optional)
 *   userId  - filters to that user only; uses Query instead of Scan
 *   limit   - max results (default 50, cap 200)
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getDecisions(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const windowParam = qstr(event, 'window') || '24h';
  if (!WINDOW_SECONDS[windowParam]) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `window must be one of: ${Object.keys(WINDOW_SECONDS).join(', ')}`
    );
  }
  const cutoff = nowSec() - WINDOW_SECONDS[windowParam];

  const typeFilter = qstr(event, 'type');
  if (typeFilter && !VALID_TYPES.has(typeFilter)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `type must be one of: ${[...VALID_TYPES].join(', ')}`
    );
  }

  const userId = qstr(event, 'userId');
  const rawLimit = parseInt(qstr(event, 'limit') || '50', 10);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 200);

  let items = userId
    ? await fetchDecisionsByUser(cutoff, userId, typeFilter)
    : await fetchDecisionsScan(cutoff, typeFilter);

  // Apply in-memory type filter (DDB FilterExpression is best-effort at scale;
  // this ensures correctness against the test fake and small datasets).
  if (typeFilter) {
    items = items.filter((i) => i.decisionType === typeFilter);
  }

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const decisions = items.slice(0, limit);

  return json(200, correlationId, { data: { decisions, count: decisions.length } });
}

// ---------------------------------------------------------------------------
// GET /admin/metrics  (T10)
// ---------------------------------------------------------------------------

/**
 * Return aggregate tile counts for the dashboard.
 *
 * Response shape:
 * {
 *   totals: { total, l1, l1plus_l2, by_type: {...}, by_action: {...} },
 *   costEstimateUsd,
 *   asOf
 * }
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getMetrics(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const windowParam = qstr(event, 'window') || '24h';
  if (!WINDOW_SECONDS[windowParam]) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `window must be one of: ${Object.keys(WINDOW_SECONDS).join(', ')}`
    );
  }
  const windowSecs = WINDOW_SECONDS[windowParam];
  const cutoff = nowSec() - windowSecs;

  // NOTE: switch to a GSI after the demo
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_DECISION,
      FilterExpression: '#ts >= :cutoff',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':cutoff': cutoff },
    })
  );
  const items = result.Items || [];

  let l1 = 0;
  let l1plus_l2 = 0;
  const by_type = {};
  const by_action = {};

  for (const item of items) {
    if (item.engineLayer === 'L1+L2') {
      l1plus_l2++;
    } else {
      l1++;
    }
    const dt = item.decisionType || 'UNKNOWN';
    by_type[dt] = (by_type[dt] || 0) + 1;
    const act = item.action || 'UNKNOWN';
    by_action[act] = (by_action[act] || 0) + 1;
  }

  const total = items.length;
  const costEstimateUsd = l1plus_l2 * EST_LLM_UNIT_USD;

  return json(200, correlationId, {
    data: {
      totals: { total, l1, l1plus_l2, by_type, by_action },
      costEstimateUsd,
      asOf: nowSec(),
      guard: getBudgetStats(),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /admin/decisions/{id}/release  (T11)
// ---------------------------------------------------------------------------

/**
 * Release a blocked decision.
 *
 * Path param: id - the decisionId of the original decision.
 *
 * Steps:
 *   1. Scan DecisionStore for the given decisionId.
 *   2. Write a DECISION_RELEASE row referencing the original.
 *   3. If the user's UserState has isBlocked=true, clear it.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function releaseDecision(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const decisionId =
    (event.pathParameters && event.pathParameters.id) ||
    (event.pathParameters && event.pathParameters['id']);

  if (!decisionId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Missing path parameter: id');
  }

  // NOTE: switch to a GSI after the demo
  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: TABLE_DECISION,
      FilterExpression: 'decisionId = :did',
      ExpressionAttributeValues: { ':did': decisionId },
    })
  );
  const original = (scanResult.Items || [])[0];

  if (!original) {
    return err(404, correlationId, 'NOT_FOUND', `Decision not found: ${decisionId}`);
  }

  const releasedAt = nowSec();
  const releaseRow = {
    decisionId: `DEC#REL#${randomUUID().slice(0, 8)}`,
    userId: original.userId,
    decisionType: 'DECISION_RELEASE',
    score: 0,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'ADMIN_RELEASE',
    reasonText: 'Decision manually released by admin',
    channel: original.channel || 'ADMIN',
    correlationId: correlationId || '',
    isFinalDecision: true,
    engineLayer: 'L1',
    originalDecisionId: decisionId,
    timestamp: releasedAt,
    modelVersion: 'v1',
  };

  await ddb.send(new PutCommand({ TableName: TABLE_DECISION, Item: releaseRow }));

  // Clear the block on the user if set
  if (original.userId) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_USER_STATE,
        Key: { userId: original.userId },
        UpdateExpression: 'SET isBlocked = :f, updatedAt = :now',
        ExpressionAttributeValues: { ':f': false, ':now': releasedAt },
      })
    );
  }

  return json(200, correlationId, {
    data: { released: true, originalDecisionId: decisionId, releasedAt },
  });
}

// ---------------------------------------------------------------------------
// GET /admin/users  (T12)
// ---------------------------------------------------------------------------

/**
 * Paginated list of user profiles, passwordHash stripped.
 *
 * Query params:
 *   limit  - default 50, cap 100
 *   cursor - base64-encoded LastEvaluatedKey from a previous response
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getUsers(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawLimit = parseInt(qstr(event, 'limit') || '50', 10);
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);

  const cursorParam = qstr(event, 'cursor');
  let exclusiveStartKey;
  if (cursorParam) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf8'));
    } catch {
      return err(400, correlationId, 'VALIDATION_ERROR', 'Invalid cursor value');
    }
  }

  const scanParams = {
    TableName: TABLE_USER_PROFILE,
    Limit: limit,
  };
  if (exclusiveStartKey) {
    scanParams.ExclusiveStartKey = exclusiveStartKey;
  }

  const result = await ddb.send(new ScanCommand(scanParams));
  // Slice to limit: real DDB respects Limit but the in-process fake returns all items.
  const rawUsers = (result.Items || []).slice(0, limit);

  // Strip passwordHash before returning
  const users = rawUsers.map((u) => {
    const safe = { ...u };
    delete safe.passwordHash;
    return safe;
  });

  let nextCursor = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return json(200, correlationId, { data: { users, nextCursor } });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { getDecisions, getMetrics, releaseDecision, getUsers, _setDdb };
