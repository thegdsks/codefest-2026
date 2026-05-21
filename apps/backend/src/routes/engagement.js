'use strict';

/**
 * routes/engagement.js
 *
 * Exported handlers:
 *   trackEvent  POST /engagement/event   (bearer-auth)
 *   listRules   GET  /admin/rules        (basic-auth admin)
 *   getRule     GET  /admin/rules/{id}   (basic-auth admin)
 *   putRule     POST /admin/rules        (basic-auth admin, create)
 *               PUT  /admin/rules/{id}   (basic-auth admin, update)
 *
 * trackEvent flow:
 *   1. Validate body: { signal, userId, sessionId, params }
 *   2. Validate bearer (session must match userId)
 *   3. Load user profile for loyalty context
 *   4. Score with the appropriate L1 scorer from rules/engagement.js
 *   5. Evaluate active DDB rules via lib/jsonRulesEngine.js (merged score wins
 *      if the DDB rules produce a higher score)
 *   6. Route through engine/router.js (L1+L2 as needed)
 *   7. Write a DecisionStore row with decisionType=ENGAGEMENT
 *   8. Return { surface, copy, reasonCode, engineLayer, score }
 */

const { randomUUID } = require('node:crypto');

const { json, err, parseBody, requireField } = require('../lib/http');
const { getUserById, requireBearer, putDecision } = require('../lib/ddb');
const { decision } = require('../lib/activity');
const { route: engineRoute } = require('../engine/router');
const {
  scoreRageClick,
  scoreDwellNoAction,
  scoreAbandonedFlowStep,
  scoreRepeatedQuery,
  scorePointsBalanceStare,
} = require('../rules/engagement');
const { evaluate: evaluateRules } = require('../lib/jsonRulesEngine');
const ruleStore = require('../lib/ruleStore');
const { extractIdFromPath } = require('../admin');

// ---------------------------------------------------------------------------
// Signal dispatch table
// ---------------------------------------------------------------------------

const SIGNAL_SCORERS = {
  rage_click: scoreRageClick,
  dwell_no_action: scoreDwellNoAction,
  abandoned_flow_step: scoreAbandonedFlowStep,
  repeated_query: scoreRepeatedQuery,
  points_balance_stare: scorePointsBalanceStare,
};

const VALID_SIGNALS = new Set(Object.keys(SIGNAL_SCORERS));

// Admin-only username list (mirrors admin.js pattern)
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || 'demoClient')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

function requireAdmin(event, correlationId) {
  const user = extractBasicAuthUser(event.headers);
  if (!user || !ADMIN_USERNAMES.includes(user)) {
    return { ok: false, response: err(403, correlationId, 'FORBIDDEN', 'Admin access required') };
  }
  return { ok: true };
}

function qstr(event, key) {
  return (event.queryStringParameters && event.queryStringParameters[key]) || null;
}

// ---------------------------------------------------------------------------
// Default nudge/offer copy for L1 fallback
// ---------------------------------------------------------------------------

const DEFAULT_COPY = {
  NUDGE: 'Your loyalty points are waiting - explore what you can do with them.',
  OFFER: 'Complete this step to unlock a special offer.',
  HINT: 'Need help? Tap here to see what options are available.',
  ALLOW: '',
};

// Surface mapping: engagement action -> surface name
const ACTION_SURFACE = {
  NUDGE: 'nudge_banner',
  OFFER: 'offer_modal',
  HINT: 'inline_help_tooltip',
  ALLOW: null,
};

// ---------------------------------------------------------------------------
// trackEvent  POST /engagement/event
// ---------------------------------------------------------------------------

/**
 * Accepts a behavioral signal from the frontend, evaluates L1 rules, routes
 * through the L1+L2 engine, and writes an ENGAGEMENT decision row.
 *
 * Request body: { signal, userId, sessionId, params }
 * Response: { surface, copy, reasonCode, engineLayer, score, decisionId }
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function trackEvent(event, correlationId) {
  const body = parseBody(event);
  const signal = requireField(body, 'signal');
  const userId = requireField(body, 'userId');

  if (!VALID_SIGNALS.has(signal)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      `signal must be one of: ${[...VALID_SIGNALS].join(', ')}`
    );
  }

  // Bearer validation: session must belong to the claimed userId
  await requireBearer(event, userId);

  const params = (body && body.params) || {};

  // L1 score from the static scorer
  const profile = await getUserById(userId);
  const scorer = SIGNAL_SCORERS[signal];
  let l1Draft = scorer(params, profile);

  // Merge in DDB rule engine result if any rules fire at higher score
  try {
    const activeDocs = await ruleStore.listActiveRules();
    if (activeDocs.length > 0) {
      const facts = { signal, userId, ...params };
      const ruleResult = await evaluateRules(activeDocs, facts);
      if (ruleResult.matched.length > 0 && ruleResult.score > l1Draft.score) {
        const topMatch = ruleResult.matched[0];
        l1Draft = {
          ...l1Draft,
          score: ruleResult.score,
          action: topMatch.action || l1Draft.action,
          reasonCode: `RULE_${topMatch.ruleId}`,
          reasonText: `Rule ${topMatch.ruleId} matched.`,
          needsExplanation: ruleResult.escalate,
        };
      }
    }
  } catch (_) {
    // Rule store errors must not block the event; degrade gracefully
  }

  // Route through L1+L2 engine
  const ctx = {
    userId,
    category: 'ENGAGEMENT',
    payload: { signal, ...params },
    missingFields: [],
  };
  const final = await engineRoute(l1Draft, ctx);

  // Determine surface and copy
  const surface = ACTION_SURFACE[final.action] || null;
  const copy = final.generatedText || DEFAULT_COPY[final.action] || '';

  // Write DecisionStore row (skip for ALLOW to reduce noise)
  let decisionId = null;
  if (final.action !== 'ALLOW') {
    decisionId = `DEC#ENG#${randomUUID().slice(0, 8)}`;
    const row = decision(
      userId,
      'ENGAGEMENT',
      final.score,
      final.riskLevel,
      final.action,
      final.reasonCode,
      final.reasonText,
      'ENGAGEMENT',
      correlationId,
      final
    );
    row.decisionId = decisionId;
    row.signal = signal;
    row.surface = surface || '';
    await putDecision(row);
  }

  return json(200, correlationId, {
    data: {
      surface,
      copy,
      reasonCode: final.reasonCode,
      engineLayer: final.engineLayer || 'L1',
      score: final.score,
      action: final.action,
      decisionId,
    },
  });
}

// ---------------------------------------------------------------------------
// listRules  GET /admin/rules
// ---------------------------------------------------------------------------

/**
 * Return all engagement rules, optionally filtered by status.
 *
 * Query params:
 *   status - 'ACTIVE' | 'DRAFT' | 'ARCHIVED' (optional)
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function listRules(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const statusFilter = qstr(event, 'status');
  const validStatuses = new Set(['ACTIVE', 'DRAFT', 'ARCHIVED']);
  if (statusFilter && !validStatuses.has(statusFilter)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      'status must be one of: ACTIVE, DRAFT, ARCHIVED'
    );
  }

  const rules = await ruleStore.listRules(statusFilter ? { status: statusFilter } : undefined);
  rules.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return json(200, correlationId, { data: { rules, count: rules.length } });
}

// ---------------------------------------------------------------------------
// getRule  GET /admin/rules/{id}
// ---------------------------------------------------------------------------

/**
 * Return a single rule by ruleId.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function getRule(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const rawPath = event.rawPath || event.path || '';
  const ruleId = extractIdFromPath(rawPath, '/admin/rules', '');
  if (!ruleId) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Missing path parameter: id');
  }

  const rule = await ruleStore.getRule(decodeURIComponent(ruleId));
  if (!rule) {
    return err(404, correlationId, 'NOT_FOUND', `Rule not found: ${ruleId}`);
  }

  return json(200, correlationId, { data: { rule } });
}

// ---------------------------------------------------------------------------
// putRule  POST /admin/rules  +  PUT /admin/rules/{id}
// ---------------------------------------------------------------------------

/**
 * Create (POST) or update (PUT) an engagement rule.
 *
 * Body: {
 *   ruleId?:    string  (omit for create; required for update)
 *   name:       string
 *   status:     'ACTIVE' | 'DRAFT' | 'ARCHIVED'
 *   definition: { conditions: {...}, event: { params: { action, surface, score } } }
 * }
 *
 * For PUT, the ruleId is also accepted from the path parameter.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function putRule(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const body = parseBody(event);
  if (!body) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Request body is required');
  }

  const rawPath = event.rawPath || event.path || '';
  const pathId = extractIdFromPath(rawPath, '/admin/rules', '');

  // For PUT, prefer path id; for POST, prefer body ruleId or generate a new one.
  const ruleId = pathId ? decodeURIComponent(pathId) : body.ruleId || null;

  const name = requireField(body, 'name');
  const status = requireField(body, 'status');

  const validStatuses = new Set(['ACTIVE', 'DRAFT', 'ARCHIVED']);
  if (!validStatuses.has(status)) {
    return err(
      400,
      correlationId,
      'VALIDATION_ERROR',
      'status must be one of: ACTIVE, DRAFT, ARCHIVED'
    );
  }

  if (!body.definition || typeof body.definition !== 'object') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'definition object is required');
  }

  const rule = {
    ...body,
    ruleId: ruleId || undefined,
    name,
    status,
    definition: body.definition,
  };

  const saved = await ruleStore.putRule(rule);
  const isCreate = !pathId && !body.ruleId;

  return json(isCreate ? 201 : 200, correlationId, { data: { rule: saved } });
}

module.exports = { trackEvent, listRules, getRule, putRule };
