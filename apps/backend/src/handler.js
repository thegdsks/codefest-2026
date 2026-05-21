'use strict';

const { getHeader, basicAuthOk, err } = require('./lib/http');
const { _setDdb: libSetDdb, validateBearer } = require('./lib/ddb');
const { healthEndpoint } = require('./routes/health');
const {
  login,
  mfaVerify,
  mfaEnroll,
  mfaConfirmEnroll,
  mfaRecover,
  logout,
  sessionInfo,
} = require('./routes/auth');
const {
  transfer,
  transferMfaVerify,
  getOffers,
  offerAction,
  getNudges,
  nudgeAction,
  getProfile,
  dashboard,
  profileCompletenessEndpoint,
  surfaceEligibility,
} = require('./routes/customer');
const admin = require('./admin');
const { reseed, devConfig } = require('./routes/dev');
const {
  trackEvent,
  listRules,
  getRule: getEngagementRule,
  putRule,
  aiSuggestRule,
  testRule,
} = require('./routes/engagement');

// test-only seam; delegates to lib/ddb so every module in the graph sees the stub
function _setDdb(client) {
  libSetDdb(client);
}

/**
 * Routes authenticated via a per-user bearer token. For these, exports.main
 * skips the handler-level Basic Auth gate; the route itself calls
 * validateBearer/requireBearer and verifies the userId match.
 *
 * Auth handshake routes (/auth/login, /auth/mfa/verify), admin, and any
 * unknown path keep the Basic Auth client-id check.
 */
const BEARER_ROUTES = [
  ['POST', '/transactions/transfer'],
  ['POST', '/transactions/mfa/verify'],
  ['GET', '/user/profile'],
  ['GET', '/user/profile-completeness'],
  ['GET', '/offers'],
  ['POST', '/offers/action'],
  ['GET', '/nudges'],
  ['POST', '/nudges/action'],
  ['GET', '/dashboard'],
  ['POST', '/auth/logout'],
  ['GET', '/auth/session'],
  ['POST', '/auth/mfa/enroll'],
  ['POST', '/auth/mfa/confirm-enroll'],
  ['POST', '/engagement/event'],
  ['GET', '/customer/surface-eligibility'],
];

function isBearerRoute(method, path) {
  for (const [m, p] of BEARER_ROUTES) {
    if (m === method && p === path) return true;
  }
  return false;
}

async function route(event, correlationId) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.path;

  // normalize: strip stage prefix for REST API (if any)
  const p = path || '/';

  if (method === 'POST' && p === '/auth/login') return login(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/verify') return mfaVerify(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/enroll') return mfaEnroll(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/confirm-enroll')
    return mfaConfirmEnroll(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/recover') return mfaRecover(event, correlationId);
  if (method === 'POST' && p === '/auth/logout') return logout(event, correlationId);
  if (method === 'GET' && p === '/auth/session') return sessionInfo(event, correlationId);
  if (method === 'POST' && p === '/transactions/transfer') return transfer(event, correlationId);
  if (method === 'POST' && p === '/transactions/mfa/verify')
    return transferMfaVerify(event, correlationId);
  if (method === 'GET' && p === '/offers') return getOffers(event, correlationId);
  if (method === 'POST' && p === '/offers/action') return offerAction(event, correlationId);
  if (method === 'GET' && p === '/nudges') return getNudges(event, correlationId);
  if (method === 'POST' && p === '/nudges/action') return nudgeAction(event, correlationId);
  if (method === 'GET' && p === '/user/profile') return getProfile(event, correlationId);
  if (method === 'GET' && p === '/user/profile-completeness')
    return profileCompletenessEndpoint(event, correlationId);
  if (method === 'GET' && p === '/dashboard') return dashboard(event, correlationId);
  if (method === 'GET' && p === '/customer/surface-eligibility')
    return surfaceEligibility(event, correlationId);
  // Demo-only routes. reseed is gated by DEMO_MODE=1 inside the handler.
  if (method === 'GET' && p === '/admin/dev/config') return devConfig(event, correlationId);
  if (method === 'POST' && p === '/admin/dev/reseed') return reseed(event, correlationId);

  if (method === 'GET' && p === '/admin/decisions') return admin.getDecisions(event, correlationId);
  if (method === 'GET' && p === '/admin/decisions/export')
    return admin.exportDecisions(event, correlationId);
  if (method === 'GET' && p === '/admin/metrics') return admin.getMetrics(event, correlationId);
  if (method === 'POST' && p.match(/^\/admin\/decisions\/[^/]+\/release$/))
    return admin.releaseDecision(event, correlationId);
  if (method === 'GET' && p.match(/^\/admin\/decisions\/[^/]+$/) && p !== '/admin/decisions/export')
    return admin.getDecisionById(event, correlationId);
  if (method === 'GET' && p === '/admin/users') return admin.getUsers(event, correlationId);
  if (method === 'GET' && p.match(/^\/admin\/users\/[^/]+\/risk$/))
    return admin.getUserRisk(event, correlationId);
  if (method === 'GET' && p === '/admin/sessions') return admin.getSessions(event, correlationId);
  if (method === 'GET' && p === '/admin/mfa-status')
    return admin.getMfaStatus(event, correlationId);
  if (method === 'POST' && p.match(/^\/admin\/sessions\/[^/]+\/revoke$/))
    return admin.revokeSession(event, correlationId);
  if (method === 'GET' && p === '/admin/ai-config') return admin.getAiConfig(event, correlationId);
  if (method === 'POST' && p === '/admin/demo-actions/mutate-user')
    return admin.mutateDemoUser(event, correlationId);
  if (method === 'POST' && p === '/admin/demo-events')
    return admin.writeDemoEvent(event, correlationId);
  if (method === 'GET' && p === '/admin/demo-events')
    return admin.listDemoEvents(event, correlationId);
  if (method === 'GET' && p === '/admin/activity-feed')
    return admin.getActivityFeed(event, correlationId);

  // Engagement routes
  if (method === 'POST' && p === '/engagement/event') return trackEvent(event, correlationId);
  if (method === 'GET' && p === '/admin/rules') return listRules(event, correlationId);
  if (method === 'POST' && p === '/admin/rules') return putRule(event, correlationId);
  if (method === 'POST' && p === '/admin/rules/ai-suggest')
    return aiSuggestRule(event, correlationId);
  if (method === 'POST' && p === '/admin/rules/test') return testRule(event, correlationId);
  if (method === 'GET' && p.match(/^\/admin\/rules\/[^/]+$/))
    return getEngagementRule(event, correlationId);
  if (method === 'PUT' && p.match(/^\/admin\/rules\/[^/]+$/)) return putRule(event, correlationId);

  return err(404, correlationId, 'NOT_FOUND', `Unknown endpoint: ${method} ${p}`);
}

exports._setDdb = _setDdb;
// Exported for unit tests; not part of the HTTP-facing public API.
exports._validateBearer = validateBearer;

exports.main = async (event) => {
  const correlationId = getHeader(event.headers, 'x-correlation-id') || '';

  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const rawP = event.requestContext?.http?.path || event.path || '/';

    // CORS preflight: browsers send OPTIONS without credentials, so the auth
    // gate below would 401 the preflight and break every browser request.
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Max-Age': '600',
        },
        body: '',
      };
    }

    // /health is intentionally unauthenticated.
    if (method === 'GET' && rawP === '/health') return healthEndpoint();

    // Bearer routes carry their own auth via validateBearer in the route
    // handler. Skip the handler-level Basic Auth gate so a client that
    // already has a bearer doesn't need to also present Basic credentials.
    if (!isBearerRoute(method, rawP)) {
      if (!basicAuthOk(event)) {
        return err(401, correlationId, 'UNAUTHORIZED_CLIENT', 'Missing/invalid Basic Auth');
      }
    }

    return await route(event, correlationId);
  } catch (e) {
    if (e?.status) return err(e.status, correlationId, e.code || 'ERROR', e.message || 'Error');
    console.error(e);
    return err(500, correlationId, 'INTERNAL_ERROR', 'Unexpected server error');
  }
};
