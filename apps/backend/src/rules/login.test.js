'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreLogin } = require('./login');

// --- Impossible travel: same location always safe ---
test('scoreLogin returns LOW/ALLOW for same location regardless of time delta', () => {
  const result = scoreLogin({
    lastLocation: 'New York',
    lastTime: 1000,
    currentLocation: 'New York',
    now: 1100,
  });
  assert.equal(result.score, 10);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.reasonCode, 'NORMAL_LOGIN');
  assert.equal(result.category, 'AUTH');
  assert.equal(result.needsExplanation, false);
});

// --- Clear HIGH case: different location, delta <= 300s ---
test('scoreLogin returns HIGH/BLOCK for impossible travel within 300s', () => {
  const result = scoreLogin({
    lastLocation: 'New York',
    lastTime: 1000,
    currentLocation: 'Los Angeles',
    now: 1200, // 200s delta, <= 300
  });
  assert.equal(result.score, 90);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'IMPOSSIBLE_TRAVEL');
  assert.equal(result.needsExplanation, false);
});

// --- Gray zone upper edge: delta 301..600s ---
test('scoreLogin returns MEDIUM/MFA for travel between 300s and 600s', () => {
  const result = scoreLogin({
    lastLocation: 'New York',
    lastTime: 1000,
    currentLocation: 'Los Angeles',
    now: 1400, // 400s delta, > 300 and <= 600
  });
  assert.equal(result.score, 70);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'MFA');
  assert.equal(result.reasonCode, 'IMPOSSIBLE_TRAVEL');
  assert.equal(result.needsExplanation, true);
});

// --- Gray zone lower edge: score 70 is still needsExplanation ---
test('scoreLogin at exactly 300s delta is BLOCK (not gray zone)', () => {
  const result = scoreLogin({
    lastLocation: 'Chicago',
    lastTime: 1000,
    currentLocation: 'Miami',
    now: 1300, // exactly 300s
  });
  assert.equal(result.score, 90);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'BLOCK');
});

// --- Clear LOW case: delta > 600s, different location ---
test('scoreLogin returns LOW/ALLOW when delta > 600s even with different location', () => {
  const result = scoreLogin({
    lastLocation: 'Tokyo',
    lastTime: 1000,
    currentLocation: 'London',
    now: 2000, // 1000s delta, > 600
  });
  assert.equal(result.score, 10);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
});

// --- No prior session: null lastLocation is safe ---
test('scoreLogin returns LOW/ALLOW when there is no prior login (null lastLocation)', () => {
  const result = scoreLogin({
    lastLocation: null,
    lastTime: null,
    currentLocation: 'Paris',
    now: 9999,
  });
  assert.equal(result.score, 10);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
});

// --- Edge/fuzz: null inputs must not throw ---
test('scoreLogin does not throw on fully null inputs', () => {
  assert.doesNotThrow(() => {
    const result = scoreLogin({
      lastLocation: null,
      lastTime: null,
      currentLocation: null,
      now: null,
    });
    assert.equal(result.riskLevel, 'LOW');
  });
});

// --- Case-insensitive location match ---
test('scoreLogin treats location comparison as case-insensitive', () => {
  const result = scoreLogin({
    lastLocation: 'new york',
    lastTime: 1000,
    currentLocation: 'NEW YORK',
    now: 1100,
  });
  assert.equal(result.action, 'ALLOW');
});

// --- Boundary: exactly 601s delta should be ALLOW ---
test('scoreLogin returns ALLOW at exactly 601s delta', () => {
  const result = scoreLogin({
    lastLocation: 'Boston',
    lastTime: 1000,
    currentLocation: 'Denver',
    now: 1601,
  });
  assert.equal(result.score, 10);
  assert.equal(result.action, 'ALLOW');
});

// --- Decision shape completeness ---
test('scoreLogin result includes all required L1 draft fields', () => {
  const result = scoreLogin({
    lastLocation: null,
    lastTime: null,
    currentLocation: 'Austin',
    now: 5000,
  });
  assert.ok(typeof result.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.riskLevel));
  assert.ok(['ALLOW', 'BLOCK', 'REVIEW', 'MFA', 'OFFER', 'NUDGE'].includes(result.action));
  assert.ok(typeof result.reasonCode === 'string');
  assert.ok(typeof result.reasonText === 'string');
  assert.equal(result.category, 'AUTH');
  assert.ok(typeof result.needsExplanation === 'boolean');
});
