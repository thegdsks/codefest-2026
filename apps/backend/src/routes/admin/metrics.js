'use strict';

/**
 * Admin metrics endpoint.
 *
 * Exports: getMetrics
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getStats: getBudgetStats } = require('../../engine/budget');
const { getDdb, nowSec, json, err, qstr, requireAdmin, WINDOW_SECONDS, CFG } = require('./shared');

// Unit cost per L1+L2 call. Overridable via EST_LLM_UNIT_USD env var.
function estLlmUnitUsd() {
  return Number(process.env.EST_LLM_UNIT_USD || 0.0006);
}

/**
 * GET /admin/metrics
 *
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
  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tDecision,
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
  const costEstimateUsd = l1plus_l2 * estLlmUnitUsd();

  const llmDailyBudgetUsd = CFG.llmDailyBudgetUsd;
  const remainingUsd = Math.max(0, llmDailyBudgetUsd - costEstimateUsd);
  const percentUsed =
    llmDailyBudgetUsd > 0 ? Math.round((costEstimateUsd / llmDailyBudgetUsd) * 1000) / 10 : 0;

  return json(200, correlationId, {
    data: {
      totals: { total, l1, l1plus_l2, by_type, by_action },
      costEstimateUsd,
      asOf: nowSec(),
      guard: getBudgetStats(),
      budget: {
        llmDailyUsd: llmDailyBudgetUsd,
        usedUsd: costEstimateUsd,
        remainingUsd,
        percentUsed,
      },
    },
  });
}

module.exports = { getMetrics };
