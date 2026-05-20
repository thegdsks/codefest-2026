'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreTransfer } = require('./transfer');

// --- Clear LOW case: tc1h 0 ---
test('scoreTransfer returns LOW/ALLOW when tc1h is 0', () => {
  const result = scoreTransfer({ tc1h: 0 });
  assert.equal(result.score, 10);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.reasonCode, 'NORMAL_VELOCITY');
  assert.equal(result.category, 'EARN_REDEEM');
  assert.equal(result.needsExplanation, false);
});

// --- Clear LOW case: tc1h 1 ---
test('scoreTransfer returns LOW/ALLOW when tc1h is 1', () => {
  const result = scoreTransfer({ tc1h: 1 });
  assert.equal(result.score, 10);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.action, 'ALLOW');
});

// --- Gray zone lower edge: tc1h 2 ---
test('scoreTransfer returns MEDIUM/REVIEW when tc1h is 2', () => {
  const result = scoreTransfer({ tc1h: 2 });
  assert.equal(result.score, 60);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reasonCode, 'SUSPICIOUS_VELOCITY');
  assert.equal(result.needsExplanation, true);
});

// --- Gray zone: tc1h 3 ---
test('scoreTransfer returns MEDIUM/REVIEW when tc1h is 3', () => {
  const result = scoreTransfer({ tc1h: 3 });
  assert.equal(result.score, 60);
  assert.equal(result.riskLevel, 'MEDIUM');
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.needsExplanation, true);
});

// --- Clear HIGH case: tc1h 4 ---
test('scoreTransfer returns HIGH/BLOCK when tc1h is 4', () => {
  const result = scoreTransfer({ tc1h: 4 });
  assert.equal(result.score, 90);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'HIGH_VELOCITY');
  assert.equal(result.needsExplanation, false);
});

// --- Clear HIGH case: tc1h above 4 ---
test('scoreTransfer returns HIGH/BLOCK when tc1h is 10', () => {
  const result = scoreTransfer({ tc1h: 10 });
  assert.equal(result.score, 90);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.action, 'BLOCK');
});

// --- Edge/fuzz: null must not throw ---
test('scoreTransfer does not throw on null tc1h', () => {
  assert.doesNotThrow(() => {
    const result = scoreTransfer({ tc1h: null });
    assert.equal(result.riskLevel, 'LOW');
    assert.equal(result.score, 10);
  });
});

// --- Edge: undefined tc1h ---
test('scoreTransfer treats undefined tc1h as 0 (LOW)', () => {
  assert.doesNotThrow(() => {
    const result = scoreTransfer({});
    assert.equal(result.riskLevel, 'LOW');
  });
});

// --- Decision shape completeness ---
test('scoreTransfer result includes all required L1 draft fields', () => {
  const result = scoreTransfer({ tc1h: 3 });
  assert.ok(typeof result.score === 'number');
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.riskLevel));
  assert.ok(['ALLOW', 'BLOCK', 'REVIEW', 'MFA', 'OFFER', 'NUDGE'].includes(result.action));
  assert.ok(typeof result.reasonCode === 'string');
  assert.ok(typeof result.reasonText === 'string');
  assert.equal(result.category, 'EARN_REDEEM');
  assert.ok(typeof result.needsExplanation === 'boolean');
});
