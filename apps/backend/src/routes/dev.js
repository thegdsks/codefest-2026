'use strict';

/**
 * Dev/demo-only routes. Gated by DEMO_MODE=1.
 *
 * Exports: reseed
 * Test seam: _setDdbClient(client) - injects a raw DynamoDBClient stub.
 *
 * Auth: same Basic Auth subject check as other admin routes (mirrors admin.js
 * requireAdmin). Does NOT import from admin.js because a parallel agent is
 * refactoring that module.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CFG } = require('../lib/config');
const { json, err, getHeader } = require('../lib/http');
const { reseedAll } = require('../lib/seed');

// Default raw DDB client (no DocumentClient - seed uses BatchWriteItemCommand directly).
let ddbClient = new DynamoDBClient({});

/** Test seam: replace the DynamoDB client used by this module. */
function _setDdbClient(client) {
  ddbClient = client;
}

// Comma-separated list of usernames allowed to call admin endpoints.
// Mirrors the same logic in admin.js so that adding a new admin user
// in env covers both modules.
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || 'demoClient')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Extract the Basic Auth username from the Authorization header.
 * Returns null when the header is absent or malformed.
 *
 * @param {Record<string, string>} headers
 * @returns {string|null}
 */
function extractBasicAuthUser(headers) {
  if (!headers) return null;
  const auth = getHeader(headers, 'authorization');
  if (!auth?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.substring('Basic '.length).trim(), 'base64').toString('utf8');
    return decoded.split(':')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Require the caller's Basic Auth username to be in ADMIN_USERNAMES.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {{ ok: boolean, response?: object }}
 */
function requireAdmin(event, correlationId) {
  const user = extractBasicAuthUser(event.headers);
  if (!user || !ADMIN_USERNAMES.includes(user)) {
    return {
      ok: false,
      response: err(403, correlationId, 'FORBIDDEN', 'Admin access required'),
    };
  }
  return { ok: true };
}

/**
 * POST /admin/dev/reseed
 *
 * Restores all seeded tables from seed_data/ JSON files.
 * Gated by DEMO_MODE=1 (returns 403 when disabled) and admin Basic Auth.
 *
 * Response: { ok: true, tablesReset: string[], itemsWritten: number, durationMs: number }
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
 */
async function reseed(event, correlationId) {
  if (!CFG.demoMode) {
    return json(403, correlationId, { ok: false, error: 'demo-mode-disabled' });
  }

  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  const start = Date.now();

  let result;
  try {
    result = await reseedAll(ddbClient);
  } catch (error) {
    console.error(`[dev/reseed] Fatal error: ${error instanceof Error ? error.message : error}`);
    return err(500, correlationId, 'RESEED_FAILED', 'Reseed failed unexpectedly');
  }

  const durationMs = Date.now() - start;

  return json(200, correlationId, {
    ok: true,
    tablesReset: result.tablesReset,
    itemsWritten: result.itemsWritten,
    durationMs,
  });
}

/**
 * GET /admin/dev/config
 *
 * Returns dev/demo feature flags visible to the admin UI. Does not require
 * DEMO_MODE to be active - the UI needs to know demoMode status to decide
 * whether to show or hide the Demo controls section.
 *
 * Requires admin Basic Auth.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {object}
 */
function devConfig(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  return json(200, correlationId, { demoMode: CFG.demoMode });
}

module.exports = { reseed, devConfig, _setDdbClient };
