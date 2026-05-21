'use strict';

/**
 * Shared helpers used by 2+ admin route modules.
 *
 * Exports: ddb, setDdb, nowSec, json, err, qstr, requireAdmin, extractIdFromPath
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CFG } = require('../../lib/config');

// Default DDB client, replaced by setDdb in tests.
let _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function setDdb(client) {
  _ddb = client;
}

function getDdb() {
  return _ddb;
}

// Comma-separated list of usernames allowed to call admin endpoints.
function adminUsernames() {
  return (process.env.ADMIN_USERNAMES || 'demoClient')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify({ correlationId: correlationId || '', ...payload }),
  };
}

function err(statusCode, correlationId, code, message) {
  return json(statusCode, correlationId, { error: { code, message } });
}

/**
 * Extract the Basic Auth username from the Authorization header.
 * Returns null if the header is absent or malformed.
 *
 * @param {object} headers
 * @returns {string|null}
 */
function extractBasicAuthUser(headers) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'authorization');
  const auth = key ? headers[key] : null;
  if (!auth?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.substring('Basic '.length).trim(), 'base64').toString('utf8');
    return decoded.split(':')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check that the caller's Basic Auth username is in ADMIN_USERNAMES.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {{ ok: boolean, response?: object }}
 */
function requireAdmin(event, correlationId) {
  const user = extractBasicAuthUser(event.headers);
  if (!user || !adminUsernames().includes(user)) {
    return {
      ok: false,
      response: err(403, correlationId, 'FORBIDDEN', 'Admin access required'),
    };
  }
  return { ok: true };
}

function qstr(event, key) {
  return event.queryStringParameters?.[key] || null;
}

/**
 * Extract a path segment between a known prefix and suffix from a raw path
 * string. Handles HTTP API v2 catch-all routes that do not populate
 * event.pathParameters.
 *
 * Example:
 *   extractIdFromPath('/admin/decisions/DEC%23abc/release', '/admin/decisions', '/release')
 *   // => 'DEC%23abc'
 *
 * @param {string} rawPath
 * @param {string} prefix  - path segment before the id
 * @param {string} suffix  - path segment after the id (empty string for detail routes)
 * @returns {string|null}
 */
function extractIdFromPath(rawPath, prefix, suffix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}\\/([^/]+)${escapedSuffix}$`);
  const m = rawPath?.match(pattern);
  return m ? m[1] : null;
}

// Allowed window values and their span in seconds.
const WINDOW_SECONDS = {
  '1h': 3600,
  '24h': 86400,
  '7d': 7 * 86400,
};

module.exports = {
  getDdb,
  setDdb,
  nowSec,
  json,
  err,
  qstr,
  requireAdmin,
  extractIdFromPath,
  WINDOW_SECONDS,
  CFG,
};
