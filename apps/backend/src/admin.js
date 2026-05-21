'use strict';

/**
 * Admin endpoints facade.
 *
 * All route handlers live under ./routes/admin/. This file re-exports them
 * verbatim so handler.js and admin.test.js see the same public API without
 * modification.
 *
 * Exports: getDecisions, getMetrics, releaseDecision, getUsers,
 *          getDecisionById, exportDecisions, getSessions, revokeSession,
 *          getMfaStatus, getUserRisk, getAiConfig, extractIdFromPath
 * Test seam: _setDdb(client) - forwarded to the shared DDB reference used
 *            by all route modules.
 */

module.exports = require('./routes/admin/index.js');
