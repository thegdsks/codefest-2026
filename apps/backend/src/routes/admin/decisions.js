'use strict';

/**
 * Admin decision endpoints.
 *
 * Exports: listDecisions, getDecision, releaseDecision, exportDecisions
 */

const { ScanCommand, QueryCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');
const { getDdb, nowSec, json, err, qstr, requireAdmin, extractIdFromPath, WINDOW_SECONDS, CFG } =
  require('./shared');

// Valid decision type values.
const VALID_TYPES = new Set([
  'FRAUD_LOGIN',
  'FRAUD_TRANSFER',
  'ENGAGEMENT_OFFER',
  'ENGAGEMENT',
  'NUDGE',
  'PROFILE_COMPLETENESS',
  'MFA_VERIFY',
  'DECISION_RELEASE',
]);

// Unit cost per L1+L2 call. Overridable via EST_LLM_UNIT_USD env var.
function _estLlmUnitUsd() {
  return Number(process.env.EST_LLM_UNIT_USD || 0.0006);
}

// Default and cap for the decisions list endpoint.
function decisionsDefaultLimit() {
  return Number(process.env.ADMIN_DECISIONS_DEFAULT_LIMIT || 50);
}
function decisionsMaxLimit() {
  return Number(process.env.ADMIN_DECISIONS_MAX_LIMIT || 200);
}

// Cap for export endpoint.
function decisionsExportMaxItems() {
  return Number(process.env.ADMIN_DECISIONS_EXPORT_MAX_ITEMS || 10000);
}

// ---------------------------------------------------------------------------
// Internal DDB helpers
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
  const exprNames = { '#ts': 'timestamp' };
  const exprValues = { ':uid': userId, ':cutoff': cutoff };
  const filterParts = [];
  if (typeFilter) {
    filterParts.push('#dt = :dt');
    exprNames['#dt'] = 'decisionType';
    exprValues[':dt'] = typeFilter;
  }
  const query = {
    TableName: CFG.tDecision,
    IndexName: 'userId-timestamp-index',
    KeyConditionExpression: 'userId = :uid AND #ts >= :cutoff',
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ScanIndexForward: false,
  };
  if (filterParts.length) {
    query.FilterExpression = filterParts.join(' AND ');
  }
  const result = await getDdb().send(new QueryCommand(query));
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
  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tDecision,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );
  return result.Items || [];
}

/**
 * Fetch and filter decisions from DynamoDB based on event query params.
 * Shared by listDecisions and exportDecisions so the filtering logic is not duplicated.
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

  const cap = opts?.maxItems ? opts.maxItems : decisionsExportMaxItems();
  return { ok: true, items: items.slice(0, cap) };
}

// ---------------------------------------------------------------------------
// CSV helpers
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
    return `"${s.replace(/"/g, '""')}"`;
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

// ---------------------------------------------------------------------------
// Audit trail helper
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

// ---------------------------------------------------------------------------
// Trace helper
// ---------------------------------------------------------------------------

/**
 * Build the trace sub-object from a decision row.
 *
 * Returns null when no trace data is present (older decisions written before
 * the engine started capturing ruleId/matched/llmRationale).
 *
 * The `latencyMs` field on the row represents total router latency, not just
 * the LLM call. For L1-only decisions llmLatencyMs may be absent.
 *
 * @param {object} row
 * @returns {object|null}
 */
function buildTrace(row) {
  // Require at least engineLayer to be present for a meaningful trace.
  // Very old seed rows won't have it; we return null so the UI shows the
  // "No trace recorded" placeholder.
  if (!row.engineLayer) return null;

  // matched: array of condition objects. Prefer the explicit `matched` field
  // captured by the engine. Fall back to a synthetic single-entry array
  // derived from the L1 reasonCode so every live decision shows something.
  let matched = null;
  if (Array.isArray(row.matched) && row.matched.length > 0) {
    matched = row.matched;
  } else if (row.reasonCode) {
    matched = [
      {
        field: 'reasonCode',
        operator: 'equals',
        value: row.reasonCode,
        satisfied: true,
      },
    ];
  } else {
    matched = [];
  }

  return {
    ruleId: row.ruleId || null,
    ruleName: row.ruleName || row.reasonCode || null,
    engineLayer: row.engineLayer,
    latencyMs: typeof row.latencyMs === 'number' ? row.latencyMs : null,
    matched,
    llmRationale: typeof row.llmRationale === 'string' ? row.llmRationale : null,
  };
}

// ---------------------------------------------------------------------------
// Row projection
// ---------------------------------------------------------------------------

/**
 * Project a raw DecisionStore row to the shape returned by list/export endpoints.
 * Includes context sub-fields needed for richer per-type labels in the UI.
 *
 * @param {object} row
 * @returns {object}
 */
function projectDecisionRow(row) {
  return {
    decisionId: row.decisionId,
    userId: row.userId,
    decisionType: row.decisionType,
    action: row.action,
    score: row.score,
    riskLevel: row.riskLevel,
    engineLayer: row.engineLayer,
    channel: row.channel,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    reason: row.reason,
    explanation: row.explanation,
    llmLatencyMs: row.llmLatencyMs,
    llmModel: row.llmModel,
    timestamp: row.timestamp,
    isFinalDecision: row.isFinalDecision,
    modelVersion: row.modelVersion,
    originalDecisionId: row.originalDecisionId,
    correlationId: row.correlationId,
    aiExplanation: row.aiExplanation,
    // Context fields for per-type labels
    location: row.location ?? null,
    deviceType: row.deviceType ?? null,
    browser: row.browser ?? null,
    amount: row.amount !== undefined ? row.amount : null,
    recipientId: row.recipientId ?? null,
    velocity: row.velocity ?? null,
    signal: row.signal ?? null,
    target: row.target ?? null,
    ruleId: row.ruleId ?? null,
    mfaPath: row.mfaPath ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /admin/decisions
 *
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
async function listDecisions(event, correlationId) {
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
  const defaultLimit = decisionsDefaultLimit();
  const maxLimit = decisionsMaxLimit();
  const rawLimit = parseInt(qstr(event, 'limit') || String(defaultLimit), 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? defaultLimit : rawLimit, maxLimit);

  let items = userId
    ? await fetchDecisionsByUser(cutoff, userId, typeFilter)
    : await fetchDecisionsScan(cutoff, typeFilter);

  // Apply in-memory type filter (DDB FilterExpression is best-effort at scale;
  // this ensures correctness against the test fake and small datasets).
  if (typeFilter) {
    items = items.filter((i) => i.decisionType === typeFilter);
  }

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const decisions = items.slice(0, limit).map(projectDecisionRow);

  return json(200, correlationId, { data: { decisions, count: decisions.length } });
}

/**
 * GET /admin/decisions/{id}
 *
 * Return a single decision row plus a synthetic audit trail.
 *
 * The id is extracted from rawPath (HTTP API v2 does not populate pathParameters).
 * NOTE: switch to GetItem after we add a PK index.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getDecision(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath = event.rawPath || event.path || '';
  const encoded = extractIdFromPath(rawPath, '/admin/decisions', '');
  const decisionId = encoded ? decodeURIComponent(encoded) : null;

  if (!decisionId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Missing path parameter: id');
  }

  // NOTE: switch to GetItem after we add a PK index
  const scanResult = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tDecision,
      FilterExpression: 'decisionId = :did',
      ExpressionAttributeValues: { ':did': decisionId },
    })
  );
  const row = (scanResult.Items || [])[0];

  if (!row) {
    return err(404, correlationId, 'NOT_FOUND', `Decision not found: ${decisionId}`);
  }

  return json(200, correlationId, {
    data: { decision: row, auditTrail: buildAuditTrail(row), trace: buildTrace(row) },
  });
}

/**
 * POST /admin/decisions/{id}/release
 *
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

  const rawPath = event.rawPath || event.path || '';
  const encoded =
    extractIdFromPath(rawPath, '/admin/decisions', '/release') || event.pathParameters?.id || null;
  const decisionId = encoded ? decodeURIComponent(encoded) : null;

  if (!decisionId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Missing path parameter: id');
  }

  // NOTE: switch to a GSI after the demo
  const scanResult = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tDecision,
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

  await getDdb().send(new PutCommand({ TableName: CFG.tDecision, Item: releaseRow }));

  // Clear the block on the user if set
  if (original.userId) {
    await getDdb().send(
      new UpdateCommand({
        TableName: CFG.tUserState,
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

/**
 * GET /admin/decisions/export
 *
 * Export decisions as JSON or CSV.
 *
 * Query params: window, type, userId (same semantics as listDecisions), format (json|csv).
 * format defaults to json. Capped at ADMIN_DECISIONS_EXPORT_MAX_ITEMS rows (default 10000).
 *
 * NOTE on streaming: Lambda synchronous response payloads are capped at 6 MB.
 * At demo scale (30 seed records) a single response is well within limits.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function exportDecisions(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const result = await fetchFilteredDecisions(event, correlationId, {
    maxItems: decisionsExportMaxItems(),
  });
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

module.exports = {
  listDecisions,
  getDecision,
  releaseDecision,
  exportDecisions,
};
