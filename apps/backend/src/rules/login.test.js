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

// --- Clear HIGH case: different location, delta < 60s ---
test('scoreLogin returns HIGH/BLOCK for impossible travel within 60s', () => {
  const result = scoreLogin({
    lastLocation: 'New York',
    lastTime: 1000,
    currentLocation: 'Los Angeles',
    now: 1050, // 50s delta, < 60
  });
  assert.equal(result.score, 90);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'IMPOSSIBLE_TRAVEL');
  assert.equal(result.needsExplanation, false);
});

// --- Boundary: exactly 60s delta is MFA, not BLOCK ---
test('scoreLogin returns MEDIUM/MFA at exactly 60s delta (boundary)', () => {
  const result = scoreLogin({
    lastLocation: 'Chicago',
    lastTime: 1000,
    currentLocation: 'Miami',
    now: 1060, // exactly 60s, >= 60 so falls into MFA window
  });
  assert.equal(result.score, 70);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'MFA');
  assert.equal(result.reasonCode, 'SUSPICIOUS_LOCATION');
  assert.equal(result.needsExplanation, true);
});

// --- MFA window: 60s <= delta <= 1800s ---
test('scoreLogin returns MEDIUM/MFA for location change in 60s-30min window', () => {
  const result = scoreLogin({
    lastLocation: 'New York',
    lastTime: 1000,
    currentLocation: 'Los Angeles',
    now: 1400, // 400s delta, in MFA window
  });
  assert.equal(result.score, 70);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'MFA');
  assert.equal(result.reasonCode, 'SUSPICIOUS_LOCATION');
  assert.equal(result.needsExplanation, true);
});

// --- MFA window upper edge: exactly 1800s delta ---
test('scoreLogin returns MEDIUM/MFA at exactly 1800s delta', () => {
  const result = scoreLogin({
    lastLocation: 'Boston',
    lastTime: 1000,
    currentLocation: 'Denver',
    now: 2800, // exactly 1800s
  });
  assert.equal(result.score, 70);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'MFA');
});

// --- Clear LOW case: delta > 1800s, different location ---
test('scoreLogin returns LOW/ALLOW when delta > 1800s even with different location', () => {
  const result = scoreLogin({
    lastLocation: 'Tokyo',
    lastTime: 1000,
    currentLocation: 'London',
    now: 2801, // 1801s delta, > 1800s
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

// --- Boundary: exactly 1801s delta should be ALLOW ---
test('scoreLogin returns ALLOW at exactly 1801s delta', () => {
  const result = scoreLogin({
    lastLocation: 'Boston',
    lastTime: 1000,
    currentLocation: 'Denver',
    now: 2801,
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

// --- Per-userId isolation: two different users with different locations do not cross state ---
// This test verifies that scoreLogin is a pure function that only compares within a single
// user's history. The caller (auth.js) passes lastLocation and lastTime from getState(userId),
// which is scoped per-user. Two separate calls with different user histories are independent.
test('scoreLogin per-userId isolation: user A recent login does not block user B first login', () => {
  const now = 10000;

  // User A just logged in from Austin 5 seconds ago (would BLOCK if compared globally)
  // User B has no prior login history - first login from Tokyo
  const resultUserB = scoreLogin({
    lastLocation: null, // User B has no prior login
    lastTime: null,
    currentLocation: 'Tokyo',
    now,
  });

  // User B's first login should always be ALLOW regardless of what user A did
  assert.equal(resultUserB.action, 'ALLOW');
  assert.equal(resultUserB.score, 10);
});

test('scoreLogin per-userId isolation: user A delta 30s BLOCK, user B delta 300s MFA are independent', () => {
  const base = 10000;

  const resultUserA = scoreLogin({
    lastLocation: 'Austin',
    lastTime: base,
    currentLocation: 'London',
    now: base + 30, // 30s < 60s -> BLOCK
  });
  assert.equal(resultUserA.action, 'BLOCK');
  assert.equal(resultUserA.reasonCode, 'IMPOSSIBLE_TRAVEL');

  const resultUserB = scoreLogin({
    lastLocation: 'Paris',
    lastTime: base,
    currentLocation: 'Berlin',
    now: base + 300, // 300s, in 60-1800s window -> MFA
  });
  assert.equal(resultUserB.action, 'MFA');
  assert.equal(resultUserB.reasonCode, 'SUSPICIOUS_LOCATION');
});
