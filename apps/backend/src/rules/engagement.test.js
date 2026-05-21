'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreRageClick,
  scoreDwellNoAction,
  scoreAbandonedFlowStep,
  scoreRepeatedQuery,
  scorePointsBalanceStare,
} = require('./engagement');

// ---------------------------------------------------------------------------
// scoreRageClick
// ---------------------------------------------------------------------------

test('scoreRageClick LOW: clickCount 0 returns ALLOW score 10', () => {
  const r = scoreRageClick({ clickCount: 0 }, null);
  assert.equal(r.score, 10);
  assert.equal(r.riskLevel, 'LOW');
  assert.equal(r.action, 'ALLOW');
  assert.equal(r.reasonCode, 'RAGE_CLICK_LOW');
  assert.equal(r.needsExplanation, false);
  assert.equal(r.category, 'ENGAGEMENT');
});

test('scoreRageClick MID: clickCount 3 returns HINT score 55 grey-zone', () => {
  const r = scoreRageClick({ clickCount: 3 }, null);
  assert.equal(r.score, 55);
  assert.equal(r.riskLevel, 'MEDIUM');
  assert.equal(r.action, 'HINT');
  assert.equal(r.reasonCode, 'RAGE_CLICK_MID');
  assert.equal(r.needsExplanation, true);
});

test('scoreRageClick HIGH: clickCount 5 returns HINT score 75', () => {
  const r = scoreRageClick({ clickCount: 5 }, null);
  assert.equal(r.score, 75);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'HINT');
  assert.equal(r.reasonCode, 'RAGE_CLICK_HIGH');
  assert.equal(r.needsExplanation, false);
});

test('scoreRageClick HIGH: clickCount 10 still returns HIGH', () => {
  const r = scoreRageClick({ clickCount: 10 }, null);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.score, 75);
});

test('scoreRageClick: null params does not throw and returns LOW', () => {
  assert.doesNotThrow(() => {
    const r = scoreRageClick(null, null);
    assert.equal(r.riskLevel, 'LOW');
  });
});

test('scoreRageClick: result has draftAction matching action', () => {
  const r = scoreRageClick({ clickCount: 4 }, null);
  assert.equal(r.draftAction, r.action);
});

// ---------------------------------------------------------------------------
// scoreDwellNoAction
// ---------------------------------------------------------------------------

test('scoreDwellNoAction LOW: dwellMs 5000 returns ALLOW score 5', () => {
  const r = scoreDwellNoAction({ dwellMs: 5000 }, null);
  assert.equal(r.score, 5);
  assert.equal(r.riskLevel, 'LOW');
  assert.equal(r.action, 'ALLOW');
  assert.equal(r.needsExplanation, false);
});

test('scoreDwellNoAction MID: dwellMs 15000 returns NUDGE score 60', () => {
  const r = scoreDwellNoAction({ dwellMs: 15000 }, null);
  assert.equal(r.score, 60);
  assert.equal(r.riskLevel, 'MEDIUM');
  assert.equal(r.action, 'NUDGE');
  assert.equal(r.needsExplanation, true);
  assert.equal(r.reasonCode, 'DWELL_MID');
});

test('scoreDwellNoAction HIGH: dwellMs 30000 returns NUDGE score 80', () => {
  const r = scoreDwellNoAction({ dwellMs: 30000 }, null);
  assert.equal(r.score, 80);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'NUDGE');
  assert.equal(r.needsExplanation, false);
  assert.equal(r.reasonCode, 'DWELL_HIGH');
});

test('scoreDwellNoAction HIGH: dwellMs 60000 still returns HIGH', () => {
  const r = scoreDwellNoAction({ dwellMs: 60000 }, null);
  assert.equal(r.riskLevel, 'HIGH');
});

test('scoreDwellNoAction: missing dwellMs treated as 0 (LOW)', () => {
  const r = scoreDwellNoAction({}, null);
  assert.equal(r.riskLevel, 'LOW');
});

test('scoreDwellNoAction: result has all required L1 draft fields', () => {
  const r = scoreDwellNoAction({ dwellMs: 20000 }, null);
  assert.ok(typeof r.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.riskLevel));
  assert.ok(typeof r.reasonCode === 'string');
  assert.ok(typeof r.reasonText === 'string');
  assert.ok(typeof r.needsExplanation === 'boolean');
  assert.equal(r.category, 'ENGAGEMENT');
});

// ---------------------------------------------------------------------------
// scoreAbandonedFlowStep
// ---------------------------------------------------------------------------

test('scoreAbandonedFlowStep LOW: stepDepth 0 returns ALLOW score 15', () => {
  const r = scoreAbandonedFlowStep({ stepDepth: 0 }, null);
  assert.equal(r.score, 15);
  assert.equal(r.riskLevel, 'LOW');
  assert.equal(r.action, 'ALLOW');
  assert.equal(r.needsExplanation, false);
});

test('scoreAbandonedFlowStep MID: stepDepth 2 returns OFFER score 65', () => {
  const r = scoreAbandonedFlowStep({ stepDepth: 2 }, null);
  assert.equal(r.score, 65);
  assert.equal(r.riskLevel, 'MEDIUM');
  assert.equal(r.action, 'OFFER');
  assert.equal(r.needsExplanation, true);
  assert.equal(r.reasonCode, 'ABANDON_MID');
});

test('scoreAbandonedFlowStep HIGH: stepDepth 3 returns OFFER score 85', () => {
  const r = scoreAbandonedFlowStep({ stepDepth: 3 }, null);
  assert.equal(r.score, 85);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'OFFER');
  assert.equal(r.needsExplanation, false);
  assert.equal(r.reasonCode, 'ABANDON_DEEP');
});

test('scoreAbandonedFlowStep: stepDepth 1 is LOW', () => {
  const r = scoreAbandonedFlowStep({ stepDepth: 1 }, null);
  assert.equal(r.riskLevel, 'LOW');
});

test('scoreAbandonedFlowStep: null params returns LOW', () => {
  const r = scoreAbandonedFlowStep(null, null);
  assert.equal(r.riskLevel, 'LOW');
});

test('scoreAbandonedFlowStep: draftAction equals action', () => {
  const r = scoreAbandonedFlowStep({ stepDepth: 3 }, null);
  assert.equal(r.draftAction, r.action);
});

// ---------------------------------------------------------------------------
// scoreRepeatedQuery
// ---------------------------------------------------------------------------

test('scoreRepeatedQuery LOW: queryCount 1 returns ALLOW score 5', () => {
  const r = scoreRepeatedQuery({ queryCount: 1 }, null);
  assert.equal(r.score, 5);
  assert.equal(r.riskLevel, 'LOW');
  assert.equal(r.action, 'ALLOW');
  assert.equal(r.needsExplanation, false);
});

test('scoreRepeatedQuery MID: queryCount 2 returns HINT score 50', () => {
  const r = scoreRepeatedQuery({ queryCount: 2 }, null);
  assert.equal(r.score, 50);
  assert.equal(r.riskLevel, 'MEDIUM');
  assert.equal(r.action, 'HINT');
  assert.equal(r.needsExplanation, true);
  assert.equal(r.reasonCode, 'REPEATED_QUERY_MID');
});

test('scoreRepeatedQuery HIGH: queryCount 4 returns HINT score 78', () => {
  const r = scoreRepeatedQuery({ queryCount: 4 }, null);
  assert.equal(r.score, 78);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'HINT');
  assert.equal(r.needsExplanation, false);
  assert.equal(r.reasonCode, 'REPEATED_QUERY_HIGH');
});

test('scoreRepeatedQuery HIGH: queryCount 10 still HIGH', () => {
  const r = scoreRepeatedQuery({ queryCount: 10 }, null);
  assert.equal(r.riskLevel, 'HIGH');
});

test('scoreRepeatedQuery: missing queryCount treated as 0 (LOW)', () => {
  const r = scoreRepeatedQuery({}, null);
  assert.equal(r.riskLevel, 'LOW');
});

test('scoreRepeatedQuery: result shape is complete', () => {
  const r = scoreRepeatedQuery({ queryCount: 3 }, null);
  assert.ok(typeof r.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.riskLevel));
  assert.ok(typeof r.reasonCode === 'string');
  assert.equal(r.category, 'ENGAGEMENT');
  assert.ok(typeof r.draftAction === 'string');
});

// ---------------------------------------------------------------------------
// scorePointsBalanceStare
// ---------------------------------------------------------------------------

test('scorePointsBalanceStare LOW: dwellMs 1000 returns ALLOW score 5', () => {
  const r = scorePointsBalanceStare({ dwellMs: 1000 }, null);
  assert.equal(r.score, 5);
  assert.equal(r.riskLevel, 'LOW');
  assert.equal(r.action, 'ALLOW');
  assert.equal(r.needsExplanation, false);
});

test('scorePointsBalanceStare MID: dwellMs 4000 returns OFFER score 62', () => {
  const r = scorePointsBalanceStare({ dwellMs: 4000 }, null);
  assert.equal(r.score, 62);
  assert.equal(r.riskLevel, 'MEDIUM');
  assert.equal(r.action, 'OFFER');
  assert.equal(r.needsExplanation, true);
  assert.equal(r.reasonCode, 'POINTS_STARE_MID');
});

test('scorePointsBalanceStare HIGH: dwellMs 8000 returns OFFER score 82', () => {
  const r = scorePointsBalanceStare({ dwellMs: 8000 }, null);
  assert.equal(r.score, 82);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'OFFER');
  assert.equal(r.needsExplanation, false);
  assert.equal(r.reasonCode, 'POINTS_STARE_HIGH');
});

test('scorePointsBalanceStare HIGH: dwellMs 20000 still HIGH', () => {
  const r = scorePointsBalanceStare({ dwellMs: 20000 }, null);
  assert.equal(r.riskLevel, 'HIGH');
});

test('scorePointsBalanceStare: missing dwellMs is LOW', () => {
  const r = scorePointsBalanceStare({}, null);
  assert.equal(r.riskLevel, 'LOW');
});

test('scorePointsBalanceStare: draftAction equals action', () => {
  const r = scorePointsBalanceStare({ dwellMs: 5000 }, null);
  assert.equal(r.draftAction, r.action);
});

test('scorePointsBalanceStare: profile param is ignored gracefully', () => {
  const profile = { userId: 'USER#001', pointsBalance: 12400 };
  const r = scorePointsBalanceStare({ dwellMs: 9000 }, profile);
  assert.equal(r.riskLevel, 'HIGH');
  assert.equal(r.action, 'OFFER');
});
