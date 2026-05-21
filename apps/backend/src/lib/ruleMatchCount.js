'use strict';

/**
 * lib/ruleMatchCount.js
 *
 * Preview helper: given a rule definition (conditions + event) and a lookback
 * window, scan DecisionStore for ENGAGEMENT rows and report how many would
 * have matched if the rule had been active. Used by the admin "test rule"
 * endpoint so authors can sanity-check a draft before flipping it ACTIVE.
 *
 * Scan with FilterExpression is fine at demo scale (30 seed rows, low write
 * volume during a hackathon). For production we would page through or move
 * to a per-userId GSI scan.
 *
 * Test seam:
 *   _setDdb(client) replaces the live DDB document client with a stub.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const { evaluate: evaluateRules } = require('./jsonRulesEngine');

const TABLE_DECISION = process.env.TABLE_DECISION_STORE || 'DecisionStore';
const DEFAULT_WINDOW_SEC = 86400;
const SAMPLE_LIMIT = 5;

let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Replace the DDB client. Used in tests only.
 *
 * @param {object} client
 */
function _setDdb(client) {
  ddb = client;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Reconstruct the facts object that was evaluated when the original event
 * came in. The engagement route builds facts as
 *   { signal, userId, ...params }
 * and stores the params bag on the decision row. Mirror that shape here.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToFacts(row) {
  const params = row && row.params && typeof row.params === 'object' ? row.params : {};
  return { signal: row.signal, userId: row.userId, ...params };
}

/**
 * Slim a matched row down to the columns the admin UI needs to render a
 * preview list. Avoids returning the entire decision blob, which can be
 * large and includes fields irrelevant to the count.
 *
 * @param {object} row
 * @returns {object}
 */
function slimSample(row) {
  return {
    decisionId: row.decisionId || null,
    signal: row.signal || null,
    userId: row.userId || null,
    timestamp: typeof row.timestamp === 'number' ? row.timestamp : null,
  };
}

/**
 * Count how many recent ENGAGEMENT decisions would have matched the given
 * rule definition. Returns the count plus up to five sample rows for the
 * admin UI to render as a "would have fired on..." preview.
 *
 * @param {object} definition - { conditions, event } as stored in EngagementRules
 * @param {number} [windowSec=86400] - lookback window in seconds
 * @returns {Promise<{ count: number, samples: object[] }>}
 */
async function getRuleMatchCount(definition, windowSec) {
  const span = typeof windowSec === 'number' && windowSec > 0 ? windowSec : DEFAULT_WINDOW_SEC;
  const cutoff = nowSec() - span;

  // Wrap the bare definition as a rule document that jsonRulesEngine accepts.
  const previewDoc = {
    ruleId: 'PREVIEW',
    version: 'preview',
    status: 'ACTIVE',
    definition,
  };

  const result = await ddb.send(
    new ScanCommand({
      TableName: TABLE_DECISION,
      FilterExpression: '#dt = :dt AND #ts >= :cutoff',
      ExpressionAttributeNames: { '#dt': 'decisionType', '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':dt': 'ENGAGEMENT', ':cutoff': cutoff },
    })
  );
  const rows = result.Items || [];

  let count = 0;
  const samples = [];

  for (const row of rows) {
    try {
      const facts = rowToFacts(row);
      const evalResult = await evaluateRules([previewDoc], facts);
      if (evalResult.matched && evalResult.matched.length > 0) {
        count += 1;
        if (samples.length < SAMPLE_LIMIT) {
          samples.push(slimSample(row));
        }
      }
    } catch (_e) {
      // Malformed row should not poison the count; skip it.
    }
  }

  return { count, samples };
}

module.exports = { getRuleMatchCount, _setDdb };
