'use strict';

/**
 * Tests for the cross-signal user-risk scoring helpers in lib/ddb.js.
 *
 * Covers the pure math (nextRiskScore, applyRiskDecay) and the integration
 * point (updateUserRisk + the putDecision wrapper) using the _setDdb seam.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const ddbModule = require('./ddb');

const { _riskInternals } = ddbModule;

function makeDdb(handlers = {}) {
  return {
    send(command) {
      const name = command.constructor.name;
      if (Object.hasOwn(handlers, name)) {
        const v = handlers[name];
        return Promise.resolve(typeof v === 'function' ? v(command) : v);
      }
      return Promise.resolve({ Item: undefined, Items: [] });
    },
  };
}

const HOUR = 3600;
const DAY = 24 * HOUR;

describe('applyRiskDecay', () => {
  const { applyRiskDecay } = _riskInternals;

  it('returns 0 for a zero or missing previous score', () => {
    assert.equal(applyRiskDecay(0, 1000, 2000), 0);
    assert.equal(applyRiskDecay(undefined, 1000, 2000), 0);
    assert.equal(applyRiskDecay(null, 1000, 2000), 0);
  });

  it('returns the original score when no time has elapsed', () => {
    assert.equal(applyRiskDecay(50, 1000, 1000), 50);
  });

  it('halves the score after one half-life (24h)', () => {
    const decayed = applyRiskDecay(60, 0, DAY);
    assert.ok(Math.abs(decayed - 30) < 0.01, `expected ~30, got ${decayed}`);
  });

  it('quarters the score after two half-lives (48h)', () => {
    const decayed = applyRiskDecay(80, 0, 2 * DAY);
    assert.ok(Math.abs(decayed - 20) < 0.01, `expected ~20, got ${decayed}`);
  });

  it('does not increase the score when prevTs is in the future', () => {
    assert.equal(applyRiskDecay(50, 2000, 1000), 50);
  });
});

describe('nextRiskScore', () => {
  const { nextRiskScore } = _riskInternals;

  it('adds the BLOCK delta to a zero baseline', () => {
    const r = nextRiskScore({ prev: 0, prevTs: 0, action: 'BLOCK', now: 0 });
    assert.equal(r.changed, true);
    assert.equal(r.score, 30);
  });

  it('adds the REVIEW delta to a zero baseline', () => {
    const r = nextRiskScore({ prev: 0, prevTs: 0, action: 'REVIEW', now: 0 });
    assert.equal(r.score, 15);
  });

  it('adds the MFA delta to a zero baseline', () => {
    const r = nextRiskScore({ prev: 0, prevTs: 0, action: 'MFA', now: 0 });
    assert.equal(r.score, 10);
  });

  it('reduces the score on ALLOW but never below zero', () => {
    const r1 = nextRiskScore({ prev: 5, prevTs: 0, action: 'ALLOW', now: 0 });
    assert.equal(r1.score, 3);
    const r2 = nextRiskScore({ prev: 1, prevTs: 0, action: 'ALLOW', now: 0 });
    assert.equal(r2.score, 0);
  });

  it('clamps the score at 100 even with stacked BLOCKs', () => {
    const r = nextRiskScore({ prev: 90, prevTs: 0, action: 'BLOCK', now: 0 });
    assert.equal(r.score, 100);
  });

  it('does not flag changed when action is not a risk signal (OFFER/NUDGE)', () => {
    const r = nextRiskScore({ prev: 20, prevTs: 0, action: 'OFFER', now: DAY });
    assert.equal(r.changed, false);
    // Score still reflects decay in the returned value, but the caller skips the write.
    assert.ok(r.score < 20 && r.score > 0);
  });

  it('decays the previous score before adding the new delta', () => {
    // prev=60 a day ago => decayed to ~30, then +30 BLOCK => 60
    const r = nextRiskScore({ prev: 60, prevTs: 0, action: 'BLOCK', now: DAY });
    assert.ok(Math.abs(r.score - 60) < 0.5, `expected ~60, got ${r.score}`);
  });
});

describe('updateUserRisk (integration via _setDdb)', () => {
  let updates;
  let stateRow;

  beforeEach(() => {
    updates = [];
    stateRow = null;
    ddbModule._setDdb(
      makeDdb({
        GetCommand: () => ({ Item: stateRow }),
        UpdateCommand: (cmd) => {
          updates.push(cmd.input);
          return {};
        },
        PutCommand: () => ({}),
      })
    );
  });

  it('writes the new score and timestamp on a BLOCK action with no prior state', async () => {
    const out = await ddbModule.updateUserRisk('U001', 'BLOCK', 1_000_000);
    assert.equal(out.written, true);
    assert.equal(out.score, 30);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].TableName, 'UserState');
    assert.equal(updates[0].Key.userId, 'U001');
    assert.equal(updates[0].ExpressionAttributeValues[':s'], 30);
    assert.equal(updates[0].ExpressionAttributeValues[':t'], 1_000_000);
  });

  it('combines decay of prior score with the new delta', async () => {
    stateRow = { userId: 'U001', riskScore: 60, riskUpdatedAt: 1_000_000 };
    // 24h later, BLOCK again: 60 decays to ~30, +30 = ~60.
    const out = await ddbModule.updateUserRisk('U001', 'BLOCK', 1_000_000 + DAY);
    assert.equal(out.written, true);
    assert.ok(out.score > 58 && out.score < 62, `expected ~60, got ${out.score}`);
  });

  it('does not write for engagement actions (OFFER) that carry no delta', async () => {
    stateRow = { userId: 'U001', riskScore: 25, riskUpdatedAt: 1_000_000 };
    const out = await ddbModule.updateUserRisk('U001', 'OFFER', 1_000_000 + HOUR);
    assert.equal(out.written, false);
    assert.equal(updates.length, 0);
  });
});

describe('putDecision auto-updates risk', () => {
  it('issues a UserState UpdateCommand after writing a BLOCK decision', async () => {
    const updates = [];
    const puts = [];
    ddbModule._setDdb(
      makeDdb({
        GetCommand: () => ({ Item: null }),
        PutCommand: (cmd) => {
          puts.push(cmd.input);
          return {};
        },
        UpdateCommand: (cmd) => {
          updates.push(cmd.input);
          return {};
        },
      })
    );

    await ddbModule.putDecision({
      decisionId: 'DEC#test-1',
      userId: 'U001',
      decisionType: 'FRAUD_LOGIN',
      action: 'BLOCK',
      timestamp: 0,
    });

    assert.equal(puts.length, 1);
    assert.equal(puts[0].TableName, 'DecisionStore');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].TableName, 'UserState');
    assert.equal(updates[0].Key.userId, 'U001');
    assert.equal(updates[0].ExpressionAttributeValues[':s'], 30);
  });

  it('writes the decision but skips the risk update for an OFFER action', async () => {
    const updates = [];
    const puts = [];
    ddbModule._setDdb(
      makeDdb({
        GetCommand: () => ({ Item: null }),
        PutCommand: (cmd) => {
          puts.push(cmd.input);
          return {};
        },
        UpdateCommand: (cmd) => {
          updates.push(cmd.input);
          return {};
        },
      })
    );

    await ddbModule.putDecision({
      decisionId: 'DEC#test-2',
      userId: 'U001',
      decisionType: 'ENGAGEMENT_OFFER',
      action: 'OFFER',
      timestamp: 0,
    });

    assert.equal(puts.length, 1);
    assert.equal(updates.length, 0);
  });
});

describe('readUserRisk', () => {
  it('returns zero when the user has no UserState row', async () => {
    ddbModule._setDdb(makeDdb({ GetCommand: () => ({ Item: undefined }) }));
    const r = await ddbModule.readUserRisk('U001');
    assert.equal(r.riskScore, 0);
    assert.equal(r.decayed, 0);
    assert.equal(r.riskUpdatedAt, null);
  });

  it('applies decay to the stored score against current time', async () => {
    const long_ago = Math.floor(Date.now() / 1000) - DAY;
    ddbModule._setDdb(
      makeDdb({
        GetCommand: () => ({ Item: { userId: 'U001', riskScore: 60, riskUpdatedAt: long_ago } }),
      })
    );
    const r = await ddbModule.readUserRisk('U001');
    assert.equal(r.riskScore, 60);
    assert.ok(r.decayed > 28 && r.decayed < 32, `expected ~30, got ${r.decayed}`);
  });
});
