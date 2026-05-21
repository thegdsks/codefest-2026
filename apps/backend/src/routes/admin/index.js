'use strict';

/**
 * Barrel: re-exports all admin route handlers and the shared DDB seam.
 *
 * handler.js consumes this via admin.js (the thin facade). The _setDdb seam
 * is forwarded here so that admin.test.js can inject a stub without touching
 * the real DDB client.
 */

const { listDecisions, getDecision, releaseDecision, exportDecisions } = require('./decisions');
const { listUsers, getUserRisk } = require('./users');
const { listSessions, revokeSession } = require('./sessions');
const { getMetrics } = require('./metrics');
const { getMfaStatus } = require('./mfa');
const { getAiConfig } = require('./ai-config');
const { mutateDemoUser } = require('./demo-actions');
const { setDdb, extractIdFromPath } = require('./shared');

/**
 * Test seam: inject a DDB Document Client stub for unit tests.
 * All modules in this package call getDdb() at invocation time, so swapping
 * the reference here is sufficient.
 *
 * @param {object} client
 */
function _setDdb(client) {
  setDdb(client);
}

module.exports = {
  // decisions
  getDecisions: listDecisions,
  getDecisionById: getDecision,
  releaseDecision,
  exportDecisions,
  // users
  getUsers: listUsers,
  getUserRisk,
  // sessions
  getSessions: listSessions,
  revokeSession,
  // metrics
  getMetrics,
  // mfa
  getMfaStatus,
  // ai config
  getAiConfig,
  // demo actions
  mutateDemoUser,
  // helpers (re-exported for test assertions in admin.test.js)
  extractIdFromPath,
  // test seam
  _setDdb,
};
