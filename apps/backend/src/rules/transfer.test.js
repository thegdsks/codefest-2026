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

// --- MFA fast path: high amount + unseen device ---
test('scoreTransfer returns MFA when amount >= threshold and device is unseen', () => {
  const result = scoreTransfer({ tc1h: 0, amount: 7500, deviceFingerprintSeenDays: 90 });
  assert.equal(result.action, 'MFA');
  assert.equal(result.ruleId, 'DEMO_HIGH_VALUE_UNSEEN_DEVICE');
  assert.equal(result.ruleName, 'High-value transfer from unseen device');
  assert.ok(Array.isArray(result.matched) && result.matched.length === 2);
  assert.equal(result.needsExplanation, false);
  assert.equal(result.category, 'EARN_REDEEM');
});

// --- MFA fast path: exactly at thresholds ---
test('scoreTransfer returns MFA at exact threshold values (5000 amount, 31 days)', () => {
  const result = scoreTransfer({ tc1h: 1, amount: 5000, deviceFingerprintSeenDays: 31 });
  assert.equal(result.action, 'MFA');
  assert.equal(result.ruleId, 'DEMO_HIGH_VALUE_UNSEEN_DEVICE');
});

// --- MFA fast path does NOT fire: known device (seenDays <= threshold) ---
test('scoreTransfer does not fire MFA when device is known (seenDays = 7)', () => {
  const result = scoreTransfer({ tc1h: 0, amount: 7500, deviceFingerprintSeenDays: 7 });
  assert.notEqual(result.action, 'MFA');
  assert.equal(result.action, 'ALLOW');
});

// --- MFA fast path does NOT fire: amount below threshold ---
test('scoreTransfer does not fire MFA when amount is below threshold', () => {
  const result = scoreTransfer({ tc1h: 0, amount: 100, deviceFingerprintSeenDays: 90 });
  assert.notEqual(result.action, 'MFA');
  assert.equal(result.action, 'ALLOW');
});

// --- MFA fast path: velocity check is skipped when MFA rule fires ---
test('scoreTransfer MFA path fires even when tc1h is low (device rule takes priority)', () => {
  const result = scoreTransfer({ tc1h: 1, amount: 7500, deviceFingerprintSeenDays: 90 });
  assert.equal(result.action, 'MFA');
});

// --- Velocity still fires for tc1h >= 4 when device is known ---
test('scoreTransfer returns BLOCK for high velocity even with known device', () => {
  const result = scoreTransfer({ tc1h: 5, amount: 100, deviceFingerprintSeenDays: 7 });
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'HIGH_VELOCITY');
});

// --- Missing amount/seenDays fields do not trigger MFA ---
test('scoreTransfer with no amount or deviceFingerprintSeenDays fields behaves as before', () => {
  const result = scoreTransfer({ tc1h: 1 });
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.score, 10);
});

// --- forceHighRisk override ---
test('scoreTransfer returns MFA when forceHighRisk=true regardless of small amount', () => {
  const result = scoreTransfer({
    tc1h: 0,
    amount: 50,
    deviceFingerprintSeenDays: 1,
    forceHighRisk: true,
  });
  assert.equal(result.action, 'MFA');
  assert.equal(result.ruleId, 'DEMO_HIGH_VALUE_UNSEEN_DEVICE');
  assert.ok(Array.isArray(result.matched) && result.matched.length > 0);
  assert.equal(result.matched[0].field, 'forceHighRisk');
});

test('scoreTransfer forceHighRisk wins over known device (no amount threshold met)', () => {
  const result = scoreTransfer({
    tc1h: 0,
    amount: 100,
    deviceFingerprintSeenDays: 7,
    forceHighRisk: true,
  });
  assert.equal(result.action, 'MFA');
  assert.equal(result.ruleId, 'DEMO_HIGH_VALUE_UNSEEN_DEVICE');
});

test('scoreTransfer forceHighRisk=false does not trigger MFA on low amount', () => {
  const result = scoreTransfer({
    tc1h: 0,
    amount: 50,
    deviceFingerprintSeenDays: 90,
    forceHighRisk: false,
  });
  assert.notEqual(result.action, 'MFA');
  assert.equal(result.action, 'ALLOW');
});

test('scoreTransfer forceHighRisk=true with high tc1h still returns MFA (not BLOCK)', () => {
  // forceHighRisk is highest precedence so it wins over the velocity block
  const result = scoreTransfer({
    tc1h: 5,
    amount: 50,
    deviceFingerprintSeenDays: 7,
    forceHighRisk: true,
  });
  assert.equal(result.action, 'MFA');
});

// --- forceBlock override ---

test('scoreTransfer returns score 90 + action BLOCK when forceBlock=true', () => {
  const result = scoreTransfer({ tc1h: 0, amount: 100, forceBlock: true });
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.score, 90);
  assert.equal(result.reasonCode, 'DEMO_FORCE_BLOCK');
  assert.equal(result.ruleId, 'DEMO_FORCE_BLOCK');
});

test('scoreTransfer forceBlock overrides forceHighRisk (BLOCK wins)', () => {
  const result = scoreTransfer({
    tc1h: 0,
    amount: 50,
    deviceFingerprintSeenDays: 7,
    forceHighRisk: true,
    forceBlock: true,
  });
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'DEMO_FORCE_BLOCK');
});

test('scoreTransfer forceBlock overrides high velocity (forceBlock wins)', () => {
  const result = scoreTransfer({
    tc1h: 5,
    amount: 100,
    forceBlock: true,
  });
  assert.equal(result.action, 'BLOCK');
  assert.equal(result.reasonCode, 'DEMO_FORCE_BLOCK');
});

test('scoreTransfer forceBlock=false is a no-op (normal path applies)', () => {
  const result = scoreTransfer({ tc1h: 0, amount: 100, forceBlock: false });
  assert.equal(result.action, 'ALLOW');
  assert.equal(result.score, 10);
});
