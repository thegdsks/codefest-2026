'use strict';

/**
 * Admin endpoints module.
 *
 * Exports: getDecisions, getMetrics, releaseDecision, getUsers,
 *          getDecisionById, exportDecisions, extractIdFromPath
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
  DeleteCommand,
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
const TABLE_USER_SESSION = process.env.TABLE_USER_SESSION || 'UserSession';

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

/**
 * Extract a path segment between a known prefix and suffix from a raw path
 * string. Handles HTTP API v2 catch-all routes that do not populate
 * event.pathParameters.
 *
 * Example:
 *   extractIdFromPath('/admin/decisions/DEC%23abc/release', '/admin/decisions', '/release')
 *   // => 'DEC%23abc'
 *
 * @param {string} rawPath
 * @param {string} prefix  - path segment before the id
 * @param {string} suffix  - path segment after the id (empty string for detail routes)
 * @returns {string|null}
 */
function extractIdFromPath(rawPath, prefix, suffix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('^' + escapedPrefix + '\\/([^/]+)' + escapedSuffix + '$');
  const m = rawPath && rawPath.match(pattern);
  return m ? m[1] : null;
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
 * HTTP API v2 catch-all routing does NOT populate event.pathParameters.id.
 * The id is extracted from rawPath using extractIdFromPath.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function releaseDecision(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  // HTTP API v2 catch-all routes do not populate event.pathParameters.
  // Extract the id from rawPath (or path) directly.
  const rawPath = event.rawPath || event.path || '';
  const encoded =
    extractIdFromPath(rawPath, '/admin/decisions', '/release') ||
    (event.pathParameters && event.pathParameters.id) ||
    null;
  const decisionId = encoded ? decodeURIComponent(encoded) : null;

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
// Shared filter helper used by getDecisions and exportDecisions
// ---------------------------------------------------------------------------

/**
 * Fetch and filter decisions from DynamoDB based on event query params.
 * Shared by exportDecisions so the filtering logic is not duplicated.
 *
 * @param {object} event
 * @param {string} correlationId
 * @param {{ maxItems?: number }} opts
 * @returns {Promise<{ ok: boolean, response?: object, items?: object[] }>}
 */
async function fetchFilteredDecisions(event, correlationId, opts) {
  const windowParam = qstr(event, 'window') || '24h';
  if (!WINDOW_SECONDS[windowParam]) {
    return {
      ok: false,
      response: err(
        400,
        correlationId,
        'VALIDATION_ERROR',
        `window must be one of: ${Object.keys(WINDOW_SECONDS).join(', ')}`
      ),
    };
  }
  const cutoff = nowSec() - WINDOW_SECONDS[windowParam];

  const typeFilter = qstr(event, 'type');
  if (typeFilter && !VALID_TYPES.has(typeFilter)) {
    return {
      ok: false,
      response: err(
        400,
        correlationId,
        'VALIDATION_ERROR',
        `type must be one of: ${[...VALID_TYPES].join(', ')}`
      ),
    };
  }

  const userId = qstr(event, 'userId');
  let items = userId
    ? await fetchDecisionsByUser(cutoff, userId, typeFilter)
    : await fetchDecisionsScan(cutoff, typeFilter);

  if (typeFilter) {
    items = items.filter((i) => i.decisionType === typeFilter);
  }

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const cap = opts && opts.maxItems ? opts.maxItems : 10000;
  return { ok: true, items: items.slice(0, cap) };
}

// ---------------------------------------------------------------------------
// GET /admin/decisions/{id}
// ---------------------------------------------------------------------------

/**
 * Build a synthetic audit trail from a decision row.
 *
 * If engineLayer === 'L1+L2': two steps (L1 rule fired, L2 LLM called).
 * Otherwise: one step (L1 rule only).
 *
 * @param {object} row
 * @returns {object[]}
 */
function buildAuditTrail(row) {
  const l1Step = {
    step: 'L1 rule evaluated',
    score: row.score,
    riskLevel: row.riskLevel,
    action: row.action,
    reasonCode: row.reasonCode || row.reason || null,
  };

  if (row.engineLayer === 'L1+L2') {
    return [
      l1Step,
      {
        step: 'L2 LLM called',
        llmModel: row.llmModel || null,
        llmLatencyMs: row.llmLatencyMs !== undefined ? row.llmLatencyMs : null,
        label: row.action,
      },
    ];
  }

  return [l1Step];
}

/**
 * Return a single decision row plus a synthetic audit trail.
 *
 * The id is extracted from rawPath (HTTP API v2 does not populate pathParameters).
 * NOTE: switch to GetItem after we add a PK index.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getDecisionById(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath = event.rawPath || event.path || '';
  const encoded = extractIdFromPath(rawPath, '/admin/decisions', '');
  const decisionId = encoded ? decodeURIComponent(encoded) : null;

  if (!decisionId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Missing path parameter: id');
  }

  // NOTE: switch to GetItem after we add a PK index
  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: TABLE_DECISION,
      FilterExpression: 'decisionId = :did',
      ExpressionAttributeValues: { ':did': decisionId },
    })
  );
  const row = (scanResult.Items || [])[0];

  if (!row) {
    return err(404, correlationId, 'NOT_FOUND', `Decision not found: ${decisionId}`);
  }

  return json(200, correlationId, { data: { decision: row, auditTrail: buildAuditTrail(row) } });
}

// ---------------------------------------------------------------------------
// GET /admin/decisions/export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'decisionId',
  'userId',
  'timestamp',
  'decisionType',
  'score',
  'riskLevel',
  'action',
  'engineLayer',
  'llmModel',
  'llmLatencyMs',
  'reason',
];

/**
 * Escape a single value for RFC 4180 CSV.
 * Wraps in double-quotes when the value contains a comma, double-quote, or newline.
 *
 * @param {unknown} val
 * @returns {string}
 */
function csvCell(val) {
  const s = val === undefined || val === null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convert an array of decision objects to a CSV string with header row.
 *
 * @param {object[]} rows
 * @returns {string}
 */
function decisionsToCsv(rows) {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => csvCell(row[col])).join(','));
  return [header].concat(lines).join('\n');
}

/**
 * Export decisions as JSON or CSV.
 *
 * Query params: window, type, userId (same semantics as getDecisions), format (json|csv).
 * format defaults to json. Capped at 10,000 rows.
 *
 * NOTE on streaming: Lambda synchronous response payloads are capped at 6 MB.
 * At demo scale (30 seed records) a single response is well within limits.
 * For larger exports, switch to a pre-signed S3 URL pattern or Lambda Function
 * URL response streaming (requires a different invocation mode).
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function exportDecisions(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const result = await fetchFilteredDecisions(event, correlationId, { maxItems: 10000 });
  if (!result.ok) return result.response;

  const format = (qstr(event, 'format') || 'json').toLowerCase();

  if (format === 'csv') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="decisions.csv"',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      },
      body: decisionsToCsv(result.items),
    };
  }

  // Default: JSON
  return json(200, correlationId, {
    data: { decisions: result.items, count: result.items.length },
  });
}

// ---------------------------------------------------------------------------
// GET /admin/sessions, POST /admin/sessions/{id}/revoke, GET /admin/mfa-status
// ---------------------------------------------------------------------------

/**
 * Project a UserSession ACCESS row to the admin view. Strips the raw token
 * value so the admin UI never shows it (operators can revoke a session by
 * sessionId without knowing the bearer string).
 */
function projectSessionForAdmin(row) {
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    lastActivityAt: row.lastActivityAt,
    mfaVerified: !!row.mfaVerified,
    location: row.location || '',
    ipAddress: row.ipAddress || '',
    deviceId: row.deviceId || '',
    active: typeof row.expiresAt === 'number' && row.expiresAt > nowSec(),
  };
}

/**
 * GET /admin/sessions
 *
 * Query params:
 *   userId  - return only sessions belonging to this user
 *   active  - "true" or "false" to filter by current expiry
 *   limit   - cap on returned rows (default 100, max 500)
 *
 * Implementation: Scan with FilterExpression on recordType=ACCESS. This is
 * the per-token row written by issueAccessToken; legacy SESSION#<uuid>
 * challenge rows are skipped.
 *
 * Demo-scale only. For production we would add a GSI on userId for the
 * userId-filter path and TTL the rows so the scan stays bounded.
 */
async function getSessions(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const userIdFilter = qstr(event, 'userId');
  const activeFilter = qstr(event, 'active');
  if (activeFilter !== null && activeFilter !== 'true' && activeFilter !== 'false') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'active must be true or false');
  }
  const rawLimit = parseInt(qstr(event, 'limit') || '100', 10);
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);

  // Filter on recordType=ACCESS at the DDB layer to skip MFA-challenge rows.
  // userId can also be pushed down to reduce returned bytes; active is
  // applied in memory because expiresAt is compared against "now".
  const exprNames = { '#rt': 'recordType' };
  const exprValues = { ':access': 'ACCESS' };
  const filterParts = ['#rt = :access'];
  if (userIdFilter) {
    exprNames['#uid'] = 'userId';
    exprValues[':uid'] = userIdFilter;
    filterParts.push('#uid = :uid');
  }

  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_USER_SESSION,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );

  let items = (result.Items || []).map(projectSessionForAdmin);

  if (activeFilter === 'true') items = items.filter((it) => it.active);
  else if (activeFilter === 'false') items = items.filter((it) => !it.active);

  // Most-recent first by issuedAt.
  items.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
  const sessions = items.slice(0, limit);

  return json(200, correlationId, {
    data: {
      sessions,
      count: sessions.length,
      totalMatched: items.length,
      filters: {
        userId: userIdFilter || null,
        active: activeFilter,
      },
    },
  });
}

/**
 * POST /admin/sessions/{sessionId}/revoke
 *
 * Delete a single UserSession row. Idempotent: returns 204 whether the row
 * existed or not, so a double-revoke from the admin UI is harmless. Path
 * parameter is URL-decoded because access tokens are base64url, which is
 * safe, but legacy SESSION#... rows contain '#'.
 */
async function revokeSession(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath =
    (event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
    event.path ||
    '';
  const rawId = extractIdFromPath(rawPath, '/admin/sessions', '/revoke');
  if (!rawId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'sessionId missing from path');
  }
  const sessionId = decodeURIComponent(rawId);

  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_USER_SESSION,
      Key: { sessionId },
    })
  );

  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'x-correlation-id': correlationId || '',
    },
    body: '',
  };
}

/**
 * GET /admin/mfa-status
 *
 * Returns total user count, enrolled count, and the percentage. Powers
 * the "MFA adoption" tile on the admin dashboard.
 */
async function getMfaStatus(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  // Scan UserProfile projecting only the fields we need to keep the read cost
  // small. mfaEnabled and pendingMfaSecret tell us enrolled vs pending.
  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_USER_PROFILE,
      ProjectionExpression: '#u, #e, #p',
      ExpressionAttributeNames: {
        '#u': 'userId',
        '#e': 'mfaEnabled',
        '#p': 'pendingMfaSecret',
      },
    })
  );

  const items = result.Items || [];
  let enrolled = 0;
  let pending = 0;
  for (const it of items) {
    if (it.mfaEnabled === true) enrolled += 1;
    else if (it.pendingMfaSecret) pending += 1;
  }
  const total = items.length;
  const enrolledPercent = total === 0 ? 0 : Math.round((enrolled / total) * 1000) / 10;

  return json(200, correlationId, {
    data: {
      total,
      enrolled,
      pending,
      notEnrolled: Math.max(0, total - enrolled - pending),
      enrolledPercent,
    },
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getDecisions,
  getMetrics,
  releaseDecision,
  getUsers,
  getDecisionById,
  exportDecisions,
  getSessions,
  revokeSession,
  getMfaStatus,
  extractIdFromPath,
  _setDdb,
};
