'use strict';

/**
 * Admin user endpoints.
 *
 * Exports: listUsers, getUserRisk
 */

const { ScanCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const {
  getDdb,
  nowSec,
  json,
  err,
  qstr,
  requireAdmin,
  extractIdFromPath,
  CFG,
} = require('./shared');

// Default and cap for the users list endpoint.
function usersDefaultLimit() {
  return Number(process.env.ADMIN_USERS_DEFAULT_LIMIT || 50);
}
function usersMaxLimit() {
  return Number(process.env.ADMIN_USERS_MAX_LIMIT || 100);
}

// Risk score half-life in seconds.
function riskHalfLifeSec() {
  return Number(process.env.RISK_HALF_LIFE_SEC || 24 * 3600);
}

// Number of days to look back for sparkline decisions.
function riskSparklineWindowDays() {
  return Number(process.env.RISK_SPARKLINE_WINDOW_DAYS || 7);
}

// Max recent decisions for the sparkline.
function riskSparklineLimit() {
  return Number(process.env.RISK_SPARKLINE_LIMIT || 20);
}

/**
 * GET /admin/users
 *
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
async function listUsers(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const defaultLimit = usersDefaultLimit();
  const maxLimit = usersMaxLimit();
  const rawLimit = parseInt(qstr(event, 'limit') || String(defaultLimit), 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? defaultLimit : rawLimit, maxLimit);

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
    TableName: CFG.tUserProfile,
    Limit: limit,
  };
  if (exclusiveStartKey) {
    scanParams.ExclusiveStartKey = exclusiveStartKey;
  }

  const result = await getDdb().send(new ScanCommand(scanParams));
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

/**
 * GET /admin/users/{userId}/risk
 *
 * Return the user's current risk score (with decay applied to "now") and
 * a snapshot of their most recent risk-relevant decisions. The decisions
 * column lets the admin UI render a sparkline next to the score so an
 * operator can tell at a glance whether risk is rising or fading.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getUserRisk(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath = event.requestContext?.http?.path || event.path || '';
  const rawId = extractIdFromPath(rawPath, '/admin/users', '/risk');
  if (!rawId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'userId missing from path');
  }
  const userId = decodeURIComponent(rawId);

  // UserState carries the rolling riskScore and riskUpdatedAt. Re-apply the
  // decay against "now" so the response reflects elapsed time since the
  // last write, not the last write itself.
  const stateRes = await getDdb().send(
    new GetCommand({ TableName: CFG.tUserState, Key: { userId } })
  );
  const state = stateRes.Item;
  const stored = state && typeof state.riskScore === 'number' ? state.riskScore : 0;
  const storedTs = state && typeof state.riskUpdatedAt === 'number' ? state.riskUpdatedAt : null;
  const now = nowSec();
  const halfLifeSec = riskHalfLifeSec();
  let decayed = stored;
  if (storedTs && stored > 0 && storedTs < now) {
    decayed = stored * 2 ** (-(now - storedTs) / halfLifeSec);
  }
  decayed = Number(decayed.toFixed(2));

  // Last N risk-relevant decisions for the sparkline.
  const cutoff = now - riskSparklineWindowDays() * 86400;
  const decRes = await getDdb().send(
    new QueryCommand({
      TableName: CFG.tDecision,
      IndexName: 'userId-timestamp-index',
      KeyConditionExpression: '#u = :u AND #ts >= :cutoff',
      ExpressionAttributeNames: { '#u': 'userId', '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':u': userId, ':cutoff': cutoff },
      ScanIndexForward: false,
      Limit: riskSparklineLimit(),
    })
  );
  const recent = (decRes.Items || []).map((it) => ({
    decisionId: it.decisionId,
    decisionType: it.decisionType,
    action: it.action,
    score: it.score,
    riskLevel: it.riskLevel,
    timestamp: it.timestamp,
  }));

  return json(200, correlationId, {
    data: {
      userId,
      riskScore: decayed,
      storedRiskScore: stored,
      riskUpdatedAt: storedTs,
      asOf: now,
      recentDecisions: recent,
    },
  });
}

module.exports = { listUsers, getUserRisk };
