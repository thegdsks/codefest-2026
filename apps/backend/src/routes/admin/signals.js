'use strict';

/**
 * GET /admin/signals?window=24h&signal=rage_click&userId=USER%23001&limit=100
 *
 * Returns ENGAGEMENT_SIGNAL rows from UserActivity with optional filters.
 * activityTime on these rows is stored as epoch milliseconds.
 *
 * Query params:
 *   window  - one of: 1h | 24h | 7d | 30d (default 24h)
 *   signal  - filter to a specific signal type (optional)
 *   userId  - filter to a specific user (optional)
 *   limit   - max results (default 100, cap 500)
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getDdb, nowSec, json, err, qstr, requireAdmin, WINDOW_SECONDS, CFG } = require('./shared');

const SIGNALS_DEFAULT_LIMIT = 100;
const SIGNALS_MAX_LIMIT = 500;

// Subset of window values supported for signals (activityTime is stored in ms).
const SIGNALS_VALID_WINDOWS = new Set(['1h', '24h', '7d', '30d']);

/**
 * Build a one-line context summary from a signal row.
 *
 * @param {object} row
 * @returns {string}
 */
function buildContextSummary(row) {
  const ctx = row.context || {};
  const signal = row.signal || '';

  if (signal === 'rage_click') {
    const clicks = typeof ctx.clickCount === 'number' ? ctx.clickCount : row.count;
    return clicks ? `${clicks} clicks` : 'rage click';
  }
  if (signal === 'dwell_no_action') {
    const ms = typeof ctx.dwellMs === 'number' ? ctx.dwellMs : null;
    return ms !== null ? `${ms}ms dwell` : 'dwell without action';
  }
  if (signal === 'abandoned_flow_step') {
    const step = ctx.step || row.step || null;
    const flow = ctx.flow || row.flow || null;
    const parts = [];
    if (step) parts.push(`step=${step}`);
    if (flow) parts.push(`flow=${flow}`);
    return parts.length ? parts.join(', ') : 'abandoned flow step';
  }
  if (signal === 'repeated_query') {
    const query = ctx.query || null;
    return query ? `query: ${query}` : 'repeated query';
  }
  if (signal === 'points_balance_stare') {
    const duration = typeof ctx.stareMs === 'number' ? ctx.stareMs : null;
    return duration !== null ? `${duration}ms stare` : 'balance stare';
  }

  // Generic fallback: join any interesting context keys.
  const interesting = Object.entries(ctx)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return interesting || signal || 'signal';
}

/**
 * Project a raw UserActivity row into the signal response shape.
 *
 * @param {object} row
 * @returns {object}
 */
function projectSignalRow(row) {
  return {
    activityId: row.activityId || `${row.userId || ''}-${row.activityTime || 0}`,
    userId: row.userId || '',
    signal: row.signal || '',
    target: row.target || '',
    activityTime: typeof row.activityTime === 'number' ? row.activityTime : 0,
    count: typeof row.count === 'number' ? row.count : 1,
    score: typeof row.score === 'number' ? row.score : 0,
    action: row.action || '',
    sessionId: row.sessionId || '',
    ruleId: row.ruleId || null,
    contextSummary: buildContextSummary(row),
    context: row.context || {},
    trustScore: typeof row.trustScore === 'number' ? row.trustScore : null,
    scrollDepth: typeof row.scrollDepth === 'number' ? row.scrollDepth : null,
  };
}

/**
 * GET /admin/signals
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function listSignals(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const windowParam = qstr(event, 'window') || '24h';
  if (!SIGNALS_VALID_WINDOWS.has(windowParam)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `window must be one of: ${[...SIGNALS_VALID_WINDOWS].join(', ')}`
    );
  }

  const windowSec = WINDOW_SECONDS[windowParam];
  // activityTime is stored as epoch ms, so cutoff is also in ms.
  const cutoffMs = (nowSec() - windowSec) * 1000;

  const signalFilter = qstr(event, 'signal');
  const userId = qstr(event, 'userId');

  const rawLimit = parseInt(qstr(event, 'limit') || String(SIGNALS_DEFAULT_LIMIT), 10);
  const limit = Math.min(
    Number.isNaN(rawLimit) ? SIGNALS_DEFAULT_LIMIT : rawLimit,
    SIGNALS_MAX_LIMIT
  );

  const filterParts = ['#at = :sig AND #act > :cutoffMs'];
  const exprNames = {
    '#at': 'activityType',
    '#act': 'activityTime',
  };
  const exprValues = {
    ':sig': 'ENGAGEMENT_SIGNAL',
    ':cutoffMs': cutoffMs,
  };

  if (userId) {
    filterParts.push('#uid = :uid');
    exprNames['#uid'] = 'userId';
    exprValues[':uid'] = userId;
  }

  if (signalFilter) {
    filterParts.push('#sig = :sigFilter');
    exprNames['#sig'] = 'signal';
    exprValues[':sigFilter'] = signalFilter;
  }

  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tUserActivity,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );

  let items = (result.Items || []).map(projectSignalRow);
  items.sort((a, b) => b.activityTime - a.activityTime);
  items = items.slice(0, limit);

  return json(200, correlationId, {
    data: { signals: items, count: items.length, window: windowParam },
  });
}

module.exports = { listSignals };
