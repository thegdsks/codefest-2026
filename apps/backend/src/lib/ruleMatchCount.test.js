'use strict';

/**
 * Tests for lib/ruleMatchCount.js.
 *
 * Injects a fake DDB client via _setDdb to return a fixed set of ENGAGEMENT
 * decision rows. The fake jsonRulesEngine is the real one -- we want to
 * exercise the wiring end to end (definition -> evaluate -> count).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const ruleMatchCount = require('./ruleMatchCount.js');

function fakeDdb({ scanItems = [] } = {}) {
  return {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'ScanCommand') {
        return { Items: scanItems, LastEvaluatedKey: null };
      }
      throw new Error(`Unexpected command: ${name}`);
    },
  };
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function makeRow(overrides = {}) {
  return {
    decisionId: `DEC#ENG#${Math.random().toString(36).slice(2, 10)}`,
    userId: 'user-001',
    decisionType: 'ENGAGEMENT',
    timestamp: nowSec() - 60,
    signal: 'points_balance_stare',
    params: { dwellMs: 9000, target: 'points_balance' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Two of five rows match the rule definition
// ---------------------------------------------------------------------------

describe('getRuleMatchCount', () => {
  test('counts matching rows and returns slim samples', async () => {
    const rows = [
      // matches: signal AND dwellMs >= 8000
      makeRow({
        decisionId: 'DEC#ENG#match1',
        signal: 'points_balance_stare',
        params: { dwellMs: 9000 },
      }),
      // misses: dwellMs too low
      makeRow({
        decisionId: 'DEC#ENG#miss1',
        signal: 'points_balance_stare',
        params: { dwellMs: 4000 },
      }),
      // matches: signal AND dwellMs >= 8000
      makeRow({
        decisionId: 'DEC#ENG#match2',
        signal: 'points_balance_stare',
        params: { dwellMs: 15000 },
      }),
      // misses: wrong signal
      makeRow({
        decisionId: 'DEC#ENG#miss2',
        signal: 'rage_click',
        params: { dwellMs: 9000 },
      }),
      // misses: no params (undefined dwellMs)
      makeRow({
        decisionId: 'DEC#ENG#miss3',
        signal: 'points_balance_stare',
        params: undefined,
      }),
    ];

    ruleMatchCount._setDdb(fakeDdb({ scanItems: rows }));

    const definition = {
      conditions: {
        all: [
          { fact: 'signal', operator: 'equal', value: 'points_balance_stare' },
          { fact: 'dwellMs', operator: 'greaterThanInclusive', value: 8000 },
        ],
      },
      event: {
        type: 'preview',
        params: { action: 'NUDGE', surface: 'nudge_banner', score: 60 },
      },
    };

    const result = await ruleMatchCount.getRuleMatchCount(definition, 86400);
    assert.equal(result.count, 2, 'two rows should match the rule');
    assert.equal(result.samples.length, 2, 'samples should contain the two matched rows');

    const ids = result.samples.map((s) => s.decisionId).sort();
    assert.deepEqual(ids, ['DEC#ENG#match1', 'DEC#ENG#match2']);

    // Samples are slim -- they should not carry the original params bag.
    for (const sample of result.samples) {
      assert.equal(Object.hasOwn(sample, 'params'), false);
      assert.ok(Object.hasOwn(sample, 'signal'));
      assert.ok(Object.hasOwn(sample, 'userId'));
      assert.ok(Object.hasOwn(sample, 'timestamp'));
    }
  });

  test('returns count 0 and empty samples when the table is empty', async () => {
    ruleMatchCount._setDdb(fakeDdb({ scanItems: [] }));

    const definition = {
      conditions: {
        all: [{ fact: 'signal', operator: 'equal', value: 'points_balance_stare' }],
      },
      event: { type: 'preview', params: { action: 'NUDGE', surface: 'nudge_banner', score: 50 } },
    };

    const result = await ruleMatchCount.getRuleMatchCount(definition);
    assert.equal(result.count, 0);
    assert.deepEqual(result.samples, []);
  });

  test('caps samples at five even when many rows match', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({
        decisionId: `DEC#ENG#m${i}`,
        signal: 'points_balance_stare',
        params: { dwellMs: 9000 + i },
      })
    );
    ruleMatchCount._setDdb(fakeDdb({ scanItems: rows }));

    const definition = {
      conditions: {
        all: [{ fact: 'signal', operator: 'equal', value: 'points_balance_stare' }],
      },
      event: { type: 'preview', params: { action: 'NUDGE', surface: 'nudge_banner', score: 50 } },
    };

    const result = await ruleMatchCount.getRuleMatchCount(definition, 3600);
    assert.equal(result.count, 10, 'all ten rows match the simple condition');
    assert.equal(result.samples.length, 5, 'samples capped at five');
  });
});
