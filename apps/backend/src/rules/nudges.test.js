'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreNudge } = require('./nudges');

// --- All good: full profile, both verified ---
test('scoreNudge returns LOW/ALLOW when profile is complete and both verified', () => {
  const result = scoreNudge({
    profileCompletion: 0.9,
    emailVerified: true,
    phoneVerified: true,
  });
  assert.equal(result.score, 0);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.category, 'PROFILE');
  assert.equal(result.needsExplanation, false);
});

// --- Boundary: profileCompletion exactly 0.8 is complete ---
test('scoreNudge returns ALLOW when profileCompletion is exactly 0.8 and verified', () => {
  const result = scoreNudge({
    profileCompletion: 0.8,
    emailVerified: true,
    phoneVerified: true,
  });
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.score, 0);
});

// --- Nudge triggered by low completion ---
test('scoreNudge returns MEDIUM/NUDGE when profileCompletion < 0.8', () => {
  const result = scoreNudge({
    profileCompletion: 0.5,
    emailVerified: true,
    phoneVerified: true,
  });
  assert.equal(result.score, 70);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'NUDGE');
  assert.equal(result.reasonCode, 'PROFILE_INCOMPLETE');
  assert.equal(result.needsExplanation, true);
});

// --- Nudge triggered by email unverified ---
test('scoreNudge returns MEDIUM/NUDGE when email is not verified', () => {
  const result = scoreNudge({
    profileCompletion: 0.9,
    emailVerified: false,
    phoneVerified: true,
  });
  assert.equal(result.score, 70);
  assert.equal(result.action, 'NUDGE');
  assert.equal(result.needsExplanation, true);
});

// --- Nudge triggered by phone unverified ---
test('scoreNudge returns MEDIUM/NUDGE when phone is not verified', () => {
  const result = scoreNudge({
    profileCompletion: 0.9,
    emailVerified: true,
    phoneVerified: false,
  });
  assert.equal(result.score, 70);
  assert.equal(result.action, 'NUDGE');
  assert.equal(result.needsExplanation, true);
});

// --- All three conditions: completion low and both unverified ---
test('scoreNudge returns NUDGE when all three conditions are bad', () => {
  const result = scoreNudge({
    profileCompletion: 0.3,
    emailVerified: false,
    phoneVerified: false,
  });
  assert.equal(result.score, 70);
  assert.equal(result.action, 'NUDGE');
});

// --- Boundary: completion just below 0.8 ---
test('scoreNudge returns NUDGE when completion is 0.79', () => {
  const result = scoreNudge({
    profileCompletion: 0.79,
    emailVerified: true,
    phoneVerified: true,
  });
  assert.equal(result.action, 'NUDGE');
});

// --- Edge/fuzz: null inputs must not throw ---
test('scoreNudge does not throw on null inputs', () => {
  assert.doesNotThrow(() => {
    const result = scoreNudge({
      profileCompletion: null,
      emailVerified: null,
      phoneVerified: null,
    });
    assert.ok(typeof result.score === 'number');
  });
});

// --- Edge: undefined inputs ---
test('scoreNudge does not throw on empty object', () => {
  assert.doesNotThrow(() => {
    const result = scoreNudge({});
    assert.ok(typeof result.riskLevel === 'string');
  });
});

// --- Decision shape completeness ---
test('scoreNudge result includes all required L1 draft fields', () => {
  const result = scoreNudge({
    profileCompletion: 0.5,
    emailVerified: false,
    phoneVerified: true,
  });
  assert.ok(typeof result.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.riskLevel));
  assert.ok(['ALLOW', 'BLOCK', 'REVIEW', 'MFA', 'OFFER', 'NUDGE'].includes(result.action));
  assert.ok(typeof result.reasonCode === 'string');
  assert.ok(typeof result.reasonText === 'string');
  assert.equal(result.category, 'PROFILE');
  assert.ok(typeof result.needsExplanation === 'boolean');
});
