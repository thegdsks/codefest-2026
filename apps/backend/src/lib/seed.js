'use strict';

/**
 * Shared reseed logic.
 *
 * Reads BatchWriteItem JSON files from seed_data/ and writes them back to
 * DynamoDB. Called by both the /admin/dev/reseed HTTP endpoint and (optionally)
 * the standalone scripts/seed-ddb.js CLI.
 *
 * The seed JSON files use the raw DynamoDB wire format (PutRequest.Item with
 * typed attribute values, e.g. { "S": "..." }). The underlying BatchWriteItem
 * command works with raw attribute values, so we bypass DynamoDBDocumentClient
 * and use the base DynamoDBClient directly.
 */

const fs = require('node:fs');
const path = require('node:path');
const { BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');

const BATCH_SIZE = 25;
const MAX_RETRIES = 3;

// Resolved relative to the repo root. Works whether this module is imported
// from apps/backend/src/lib/ or from scripts/.
const SEED_DATA_DIR = path.resolve(__dirname, '../../../../seed_data');

const TABLE_NAMES = [
  'UserProfile',
  'UserSession',
  'UserActivity',
  'DecisionStore',
  'UserState',
  'EngagementRules',
];

/**
 * Load all batch files for a table.
 * Files are named <TableName>_batch_<n>.json (1-indexed, stop when missing).
 *
 * @param {string} tableName
 * @returns {Array<object>} array of raw DDB PutRequest objects
 */
function loadSeedRequests(tableName) {
  const requests = [];
  let batch = 1;
  while (true) {
    const filePath = path.join(SEED_DATA_DIR, `${tableName}_batch_${batch}.json`);
    if (!fs.existsSync(filePath)) break;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`[seed] Failed to parse ${filePath}: ${err.message}`);
      break;
    }
    const tableData = parsed[tableName];
    if (!Array.isArray(tableData)) {
      console.error(`[seed] Unexpected shape in ${filePath}: no array at key "${tableName}"`);
      break;
    }
    requests.push(...tableData);
    batch++;
  }
  return requests;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send one batch (up to 25 PutRequests) with exponential-backoff retry for
 * UnprocessedItems. Returns the number of items that permanently failed.
 *
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
 * @param {string} tableName
 * @param {Array<object>} batch
 * @returns {Promise<number>} items failed
 */
async function sendBatchWithRetry(client, tableName, batch) {
  let pending = batch;
  let attempt = 0;
  while (pending.length > 0 && attempt < MAX_RETRIES) {
    if (attempt > 0) {
      await sleep(100 * 2 ** attempt);
    }
    try {
      const cmd = new BatchWriteItemCommand({ RequestItems: { [tableName]: pending } });
      const resp = await client.send(cmd);
      const unprocessed = resp.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        pending = unprocessed;
        attempt++;
      } else {
        pending = [];
      }
    } catch (err) {
      console.error(`[seed] ${tableName} batch attempt ${attempt + 1} error: ${err.message}`);
      attempt++;
      if (attempt >= MAX_RETRIES) {
        const failed = pending.length;
        pending = [];
        return failed;
      }
    }
  }
  if (pending.length > 0) {
    console.error(
      `[seed] ${tableName}: ${pending.length} items failed after ${MAX_RETRIES} retries`
    );
    return pending.length;
  }
  return 0;
}

/**
 * Write all seed requests for one table. Returns written and error counts.
 *
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
 * @param {string} tableName
 * @param {Array<object>} requests
 * @returns {Promise<{ written: number, errors: number }>}
 */
async function writeTable(client, tableName, requests) {
  const batches = chunk(requests, BATCH_SIZE);
  let errors = 0;
  for (const batch of batches) {
    errors += await sendBatchWithRetry(client, tableName, batch);
  }
  return { written: requests.length - errors, errors };
}

/**
 * Reseed the specified tables (or all tables when omitted).
 * Uses BatchWriteItem with the raw wire-format seed files from seed_data/.
 *
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
 * @param {string[]} [tables] - defaults to TABLE_NAMES
 * @returns {Promise<{
 *   tablesReset: string[],
 *   itemsWritten: number,
 *   errors: number,
 * }>}
 */
async function reseedAll(client, tables) {
  const targets = tables || TABLE_NAMES;
  let itemsWritten = 0;
  let totalErrors = 0;
  const tablesReset = [];

  for (const tableName of targets) {
    const requests = loadSeedRequests(tableName);
    if (requests.length === 0) {
      console.warn(`[seed] No seed files found for ${tableName} - skipping`);
      continue;
    }
    const { written, errors } = await writeTable(client, tableName, requests);
    itemsWritten += written;
    totalErrors += errors;
    if (errors === 0) {
      tablesReset.push(tableName);
    } else {
      console.error(`[seed] ${tableName}: ${errors} items failed`);
    }
  }

  return { tablesReset, itemsWritten, errors: totalErrors };
}

module.exports = { reseedAll, TABLE_NAMES, loadSeedRequests };
