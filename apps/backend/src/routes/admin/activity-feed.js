'use strict';

/**
 * GET /admin/activity-feed?since=<epochMs>&limit=<n>
 *
 * Merges three event sources into a single chronological array (newest first):
 *   1. Decisions from DecisionStore (filtered by timestamp > since)
 *   2. Sessions from UserSession (ACCESS rows with lastActivityAt > since)
 *   3. Demo events from UserActivity (activityType=DEMO_EVENT, timestamp > since)
 *
 * Total capped at 100. nextCursor is the epoch-ms of the newest event so the
 * client can poll incrementally.
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getDdb, nowSec, json, qstr, requireAdmin, CFG } = require('./shared');

const MAX_EVENTS = 100;

function decisionSummary(row) {
  const parts = [row.decisionType ?? 'DECISION', row.action ?? ''];
  if (typeof row.score === 'number') parts.push(`score=${Math.round(row.score)}`);
  if (row.engineLayer) parts.push(row.engineLayer);
  return parts.filter(Boolean).join(' ');
}

function sessionSummary(row) {
  const parts = [];
  if (row.location) parts.push(`from ${row.location}`);
  if (row.mfaVerified) parts.push('MFA verified');
  if (row.mfaPath) parts.push(`(${row.mfaPath})`);
  return parts.length ? `Login ${parts.join(', ')}` : 'Login session';
}

function demoEventSummary(row) {
  const p = row.payload || {};
  switch (row.type) {
    case 'USER_SWITCH':
      return `Operator switched user${p.to ? ` to ${p.to}` : ''}`;
    case 'LOCATION_OVERRIDE':
      return `Location override${p.location ? `: ${p.location}` : ''}`;
    case 'FORCE_HIGH_RISK':
      return `Force high-risk flag ${p.enabled ? 'enabled' : 'disabled'}`;
    case 'SIGNAL_TRIGGER':
      return `Signal triggered${p.signal ? `: ${p.signal}` : ''}`;
    case 'MFA_FORCED':
      return 'MFA flow forced by operator';
    case 'SURFACE_REEVALUATE':
      return 'Surface eligibility re-evaluated';
    default:
      return row.type ?? 'Demo action';
  }
}

async function fetchAllSources(effectiveSince) {
  const [decisionsResult, sessionsResult, demoEventsResult] = await Promise.all([
    getDdb().send(
      new ScanCommand({
        TableName: CFG.tDecision,
        FilterExpression: '#ts >= :since',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':since': effectiveSince },
      })
    ),
    getDdb().send(
      new ScanCommand({
        TableName: CFG.tUserSession,
        FilterExpression: '#rt = :access AND #la > :since',
        ExpressionAttributeNames: { '#rt': 'recordType', '#la': 'lastActivityAt' },
        ExpressionAttributeValues: { ':access': 'ACCESS', ':since': effectiveSince },
      })
    ),
    getDdb().send(
      new ScanCommand({
        TableName: CFG.tUserActivity,
        FilterExpression: '#at = :demo AND #ts > :since',
        ExpressionAttributeNames: { '#at': 'activityType', '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':demo': 'DEMO_EVENT', ':since': effectiveSince },
      })
    ),
  ]);

  return [decisionsResult.Items || [], sessionsResult.Items || [], demoEventsResult.Items || []];
}

function projectEvents(decisions, sessions, demoEvents) {
  const events = [];

  for (const row of decisions) {
    events.push({
      kind: 'DECISION',
      timestamp: (row.timestamp || 0) * 1000,
      userId: row.userId ?? '',
      summary: decisionSummary(row),
      decisionId: row.decisionId ?? '',
      engineLayer: row.engineLayer ?? '',
      raw: row,
    });
  }

  for (const row of sessions) {
    const ts = row.lastActivityAt || row.issuedAt || 0;
    events.push({
      kind: 'SESSION',
      timestamp: ts * 1000,
      userId: row.userId ?? '',
      summary: sessionSummary(row),
      sessionId: row.sessionId ?? '',
      raw: {
        sessionId: row.sessionId,
        userId: row.userId,
        location: row.location,
        mfaVerified: row.mfaVerified,
        mfaPath: row.mfaPath,
        issuedAt: row.issuedAt,
        lastActivityAt: row.lastActivityAt,
        expiresAt: row.expiresAt,
        deviceId: row.deviceId,
      },
    });
  }

  for (const row of demoEvents) {
    events.push({
      kind: 'DEMO_EVENT',
      timestamp: (row.timestamp || 0) * 1000,
      actor: row.actor ?? 'demo',
      summary: demoEventSummary(row),
      payload: row.payload ?? {},
    });
  }

  return events;
}

/**
 * GET /admin/activity-feed
 */
async function getActivityFeed(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const sinceMs = parseInt(qstr(event, 'since') || '0', 10);
  const sinceSec = Math.floor((Number.isNaN(sinceMs) ? 0 : sinceMs) / 1000);
  const rawLimit = parseInt(qstr(event, 'limit') || String(MAX_EVENTS), 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? MAX_EVENTS : rawLimit, MAX_EVENTS);

  const effectiveSince = sinceSec > 0 ? sinceSec : nowSec() - 3600;

  const [decisions, sessions, demoEvents] = await fetchAllSources(effectiveSince);
  const events = projectEvents(decisions, sessions, demoEvents);

  events.sort((a, b) => b.timestamp - a.timestamp);
  const sliced = events.slice(0, limit);
  const nextCursor = sliced.length > 0 ? sliced[0].timestamp : Date.now();

  return json(200, correlationId, {
    data: { events: sliced, nextCursor },
  });
}

module.exports = { getActivityFeed };
