'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreOffer } = require('./offers');

const ELITE_TIERS = ['platinum', 'titanium', 'ambassador'];

// --- Clear HIGH case: loyaltyScore >= 700, past cooldown ---
test('scoreOffer returns HIGH/OFFER for loyaltyScore >= 700 and cooldown passed', () => {
  const result = scoreOffer({
    loyaltyScore: 700,
    tier: 'gold',
    now: 2000,
    cooldownUntil: 1000,
  });
  assert.equal(result.score, 80);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'OFFER');
  assert.equal(result.reasonCode, 'HIGH_INTENT');
  assert.equal(result.category, 'OFFERS');
  assert.equal(result.needsExplanation, false);
});

// --- Clear HIGH case: elite tier, past cooldown ---
test('scoreOffer returns HIGH/OFFER for elite tier even with score < 700', () => {
  for (const tier of ELITE_TIERS) {
    const result = scoreOffer({
      loyaltyScore: 500,
      tier,
      now: 3000,
      cooldownUntil: 0,
    });
    assert.equal(result.score, 80, `expected 80 for tier ${tier}`);
    assert.equal(result.action, 'OFFER', `expected OFFER for tier ${tier}`);
  }
});

// --- Clear LOW case: score < 700 and non-elite tier ---
test('scoreOffer returns LOW/ALLOW when score below 700 and non-elite tier', () => {
  const result = scoreOffer({
    loyaltyScore: 699,
    tier: 'silver',
    now: 5000,
    cooldownUntil: 0,
  });
  assert.equal(result.score, 0);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.reasonCode, 'NO_OFFER');
  assert.equal(result.needsExplanation, false);
});

// --- Cooldown active: qualified user but still in cooldown ---
test('scoreOffer returns LOW/ALLOW when qualified but still in cooldown', () => {
  const result = scoreOffer({
    loyaltyScore: 800,
    tier: 'platinum',
    now: 1000,
    cooldownUntil: 2000, // cooldown not yet passed
  });
  assert.equal(result.score, 0);
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.reasonCode, 'NO_OFFER');
});

// --- Boundary: score exactly 700 qualifies ---
test('scoreOffer qualifies at loyaltyScore exactly 700', () => {
  const result = scoreOffer({
    loyaltyScore: 700,
    tier: 'member',
    now: 5000,
    cooldownUntil: 0,
  });
  assert.equal(result.action, 'OFFER');
});

// --- Boundary: cooldown exactly now ---
test('scoreOffer qualifies when now equals cooldownUntil', () => {
  const result = scoreOffer({
    loyaltyScore: 750,
    tier: 'gold',
    now: 1000,
    cooldownUntil: 1000,
  });
  assert.equal(result.action, 'OFFER');
});

// --- Edge/fuzz: null inputs must not throw ---
test('scoreOffer does not throw on null inputs', () => {
  assert.doesNotThrow(() => {
    const result = scoreOffer({ loyaltyScore: null, tier: null, now: null, cooldownUntil: null });
    assert.equal(result.riskLevel, 'LOW');
  });
});

// --- Case-insensitive tier ---
test('scoreOffer tier check is case-insensitive', () => {
  const result = scoreOffer({
    loyaltyScore: 100,
    tier: 'PLATINUM',
    now: 5000,
    cooldownUntil: 0,
  });
  assert.equal(result.action, 'OFFER');
});

// --- Decision shape completeness ---
test('scoreOffer result includes all required L1 draft fields', () => {
  const result = scoreOffer({
    loyaltyScore: 800,
    tier: 'platinum',
    now: 5000,
    cooldownUntil: 0,
  });
  assert.ok(typeof result.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.riskLevel));
  assert.ok(['ALLOW', 'BLOCK', 'REVIEW', 'MFA', 'OFFER', 'NUDGE'].includes(result.action));
  assert.ok(typeof result.reasonCode === 'string');
  assert.ok(typeof result.reasonText === 'string');
  assert.equal(result.category, 'OFFERS');
  assert.ok(typeof result.needsExplanation === 'boolean');
});
