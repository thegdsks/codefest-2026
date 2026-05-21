'use strict';

/**
 * Admin session endpoints.
 *
 * Exports: listSessions, revokeSession
 */

const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
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

// Default and cap for the sessions list endpoint.
function sessionsDefaultLimit() {
  return Number(process.env.ADMIN_SESSIONS_DEFAULT_LIMIT || 100);
}
function sessionsMaxLimit() {
  return Number(process.env.ADMIN_SESSIONS_MAX_LIMIT || 500);
}

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
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function listSessions(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const userIdFilter = qstr(event, 'userId');
  const activeFilter = qstr(event, 'active');
  if (activeFilter !== null && activeFilter !== 'true' && activeFilter !== 'false') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'active must be true or false');
  }
  const defaultLimit = sessionsDefaultLimit();
  const maxLimit = sessionsMaxLimit();
  const rawLimit = parseInt(qstr(event, 'limit') || String(defaultLimit), 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? defaultLimit : rawLimit, maxLimit);

  // Filter on recordType=ACCESS at the DDB layer to skip MFA-challenge rows.
  const exprNames = { '#rt': 'recordType' };
  const exprValues = { ':access': 'ACCESS' };
  const filterParts = ['#rt = :access'];
  if (userIdFilter) {
    exprNames['#uid'] = 'userId';
    exprValues[':uid'] = userIdFilter;
    filterParts.push('#uid = :uid');
  }

  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tUserSession,
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
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function revokeSession(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath = event.requestContext?.http?.path || event.path || '';
  const rawId = extractIdFromPath(rawPath, '/admin/sessions', '/revoke');
  if (!rawId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'sessionId missing from path');
  }
  const sessionId = decodeURIComponent(rawId);

  await getDdb().send(
    new DeleteCommand({
      TableName: CFG.tUserSession,
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

module.exports = { listSessions, revokeSession };
