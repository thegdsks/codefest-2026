'use strict';

/**
 * Admin MFA status endpoint.
 *
 * Exports: getMfaStatus
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getDdb, json, requireAdmin, CFG } = require('./shared');

/**
 * GET /admin/mfa-status
 *
 * Returns total user count, enrolled count, and the percentage. Powers
 * the "MFA adoption" tile on the admin dashboard.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getMfaStatus(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  // Scan UserProfile projecting only the fields we need to keep the read cost
  // small. mfaEnabled and pendingMfaSecret tell us enrolled vs pending.
  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tUserProfile,
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

module.exports = { getMfaStatus };
