'use strict';

/**
 * ruleStore.js
 *
 * DynamoDB CRUD for the EngagementRules table.
 *
 * Table schema:
 *   PK  ruleId  (S)
 *   SK  version (S)
 *   status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
 *   name: string
 *   definition: map
 *   createdAt: number (epoch seconds)
 *   updatedAt: number (epoch seconds)
 *
 * Cache:
 *   listActiveRules() caches the result for CACHE_TTL_MS (default 60 s).
 *   Any mutation (putRule) calls bustCache() to invalidate it.
 *   Tests can call bustCache() directly after injecting a DDB stub.
 *
 * Test seam:
 *   _setDdb(client) replaces the live DDB document client with a stub.
 *   Pattern mirrors apps/backend/src/lib/ddb.js.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const TABLE_NAME = process.env.TABLE_ENGAGEMENT_RULES || 'EngagementRules';
const CACHE_TTL_MS = 60 * 1000;

let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** @type {{ items: object[]|null, expiresAt: number }} */
let _cache = { items: null, expiresAt: 0 };

/**
 * Replace the DDB client. Used in tests only.
 *
 * @param {object} client
 */
function _setDdb(client) {
  ddb = client;
}

/**
 * Expire the in-memory cache immediately.
 */
function bustCache() {
  _cache = { items: null, expiresAt: 0 };
}

/**
 * Return the current epoch in milliseconds.
 *
 * @returns {number}
 */
function nowMs() {
  return Date.now();
}

/**
 * Return the current epoch in seconds.
 *
 * @returns {number}
 */
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// listActiveRules
// ---------------------------------------------------------------------------

/**
 * Return all ACTIVE rules from EngagementRules.
 *
 * Results are cached for CACHE_TTL_MS milliseconds. Call bustCache() after
 * writes to ensure the next call fetches fresh data.
 *
 * @returns {Promise<object[]>}
 */
async function listActiveRules() {
  if (_cache.items !== null && nowMs() < _cache.expiresAt) {
    return _cache.items;
  }

  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':active': 'ACTIVE' },
    })
  );

  const items = result.Items || [];
  _cache = { items, expiresAt: nowMs() + CACHE_TTL_MS };
  return items;
}

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------

/**
 * Return all rules (all statuses), optionally filtered by status.
 *
 * @param {{ status?: string }} [opts]
 * @returns {Promise<object[]>}
 */
async function listRules(opts) {
  const status = opts && opts.status ? opts.status : null;

  if (status) {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status },
      })
    );
    return result.Items || [];
  }

  const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  return result.Items || [];
}

// ---------------------------------------------------------------------------
// getRule
// ---------------------------------------------------------------------------

/**
 * Fetch a single rule by ruleId. Returns the latest version row.
 * Uses GetItem with version='latest' as the canonical entry point.
 * Falls back to a Scan when the latest row is absent (legacy data).
 *
 * @param {string} ruleId
 * @returns {Promise<object|null>}
 */
async function getRule(ruleId) {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { ruleId, version: 'latest' },
    })
  );
  if (result.Item) return result.Item;

  // Fallback: scan for the ruleId (handles rules written without 'latest' version)
  const scan = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'ruleId = :id',
      ExpressionAttributeValues: { ':id': ruleId },
      Limit: 1,
    })
  );
  return (scan.Items || [])[0] || null;
}

// ---------------------------------------------------------------------------
// putRule
// ---------------------------------------------------------------------------

/**
 * Write (create or update) an EngagementRule row.
 *
 * When ruleId is absent a new UUID-based id is generated.
 * Always writes two rows: one with version='latest' (the current live version)
 * and one with version=ISO-timestamp (immutable history entry).
 *
 * Calls bustCache() after the write so the next listActiveRules() is fresh.
 *
 * @param {object} rule - { ruleId?, version?, name, status, definition, ... }
 * @returns {Promise<object>} the saved rule (with ruleId and version populated)
 */
async function putRule(rule) {
  const ruleId = rule.ruleId || `RULE#${randomUUID().slice(0, 8)}`;
  const versionTs = new Date().toISOString();
  const now = nowSec();

  const base = {
    ...rule,
    ruleId,
    updatedAt: now,
  };

  // Immutable history row keyed by timestamp version
  const historyRow = { ...base, version: versionTs, createdAt: rule.createdAt || now };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: historyRow }));

  // 'latest' row (always overwritten)
  const latestRow = { ...base, version: 'latest', createdAt: rule.createdAt || now };
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: latestRow }));

  bustCache();
  return latestRow;
}

module.exports = {
  listActiveRules,
  listRules,
  getRule,
  putRule,
  bustCache,
  _setDdb,
};
