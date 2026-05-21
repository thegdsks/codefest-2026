'use strict';

/**
 * Admin demo-events endpoints.
 *
 * POST /admin/demo-events  - record an operator action from DemoPanel
 * GET  /admin/demo-events  - return recent operator events (since cursor)
 *
 * Events are stored in UserActivity with activityType: 'DEMO_EVENT'.
 * The activityId doubles as the partition key. No new table is required.
 */

const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');
const { getDdb, nowSec, json, err, qstr, requireAdmin, CFG } = require('./shared');

const VALID_TYPES = new Set([
  'USER_SWITCH',
  'LOCATION_OVERRIDE',
  'FORCE_HIGH_RISK',
  'SIGNAL_TRIGGER',
  'MFA_FORCED',
  'SURFACE_REEVALUATE',
]);

const MAX_GET_LIMIT = 50;

/**
 * POST /admin/demo-events
 *
 * Body: { type, actor?, payload?, timestamp? }
 *
 * Writes a UserActivity row with activityType DEMO_EVENT.
 * Requires admin Basic Auth.
 */
async function writeDemoEvent(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Invalid JSON body');
  }

  const { type, actor = 'demo', payload = {}, timestamp } = body;

  if (!type || typeof type !== 'string') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'type is required');
  }
  if (!VALID_TYPES.has(type)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `type must be one of: ${[...VALID_TYPES].join(', ')}`
    );
  }

  const tsSec = timestamp ? Math.floor(Number(timestamp) / 1000) : nowSec();
  const activityId = `DEMO#${randomUUID()}`;

  await getDdb().send(
    new PutCommand({
      TableName: CFG.tUserActivity,
      Item: {
        activityId,
        activityType: 'DEMO_EVENT',
        type,
        actor: actor || 'demo',
        payload: payload || {},
        timestamp: tsSec,
        createdAt: nowSec(),
      },
    })
  );

  return json(201, correlationId, {
    data: { activityId, type, actor, timestamp: tsSec },
  });
}

/**
 * GET /admin/demo-events?since=<epochMs>&limit=<n>
 *
 * Returns demo events from UserActivity (activityType=DEMO_EVENT)
 * that occurred after the since cursor. Newest first, max 50.
 */
async function listDemoEvents(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const sinceMs = parseInt(qstr(event, 'since') || '0', 10);
  const sinceSec = Math.floor((Number.isNaN(sinceMs) ? 0 : sinceMs) / 1000);
  const rawLimit = parseInt(qstr(event, 'limit') || String(MAX_GET_LIMIT), 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? MAX_GET_LIMIT : rawLimit, MAX_GET_LIMIT);

  const result = await getDdb().send(
    new ScanCommand({
      TableName: CFG.tUserActivity,
      FilterExpression: '#at = :demo AND #ts > :since',
      ExpressionAttributeNames: {
        '#at': 'activityType',
        '#ts': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':demo': 'DEMO_EVENT',
        ':since': sinceSec,
      },
    })
  );

  const items = (result.Items || [])
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);

  return json(200, correlationId, {
    data: {
      events: items,
      count: items.length,
    },
  });
}

module.exports = { writeDemoEvent, listDemoEvents };
