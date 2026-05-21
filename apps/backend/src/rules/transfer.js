'use strict';

const { CFG } = require('../lib/config');

/**
 * scoreTransfer - pure L1 transfer velocity and device scoring function.
 *
 * Inputs:
 *   tc1h {number}                    - transfer count in the past hour for this user
 *   amount {number}                  - transfer amount in USD (optional)
 *   deviceFingerprintSeenDays {number} - how many days ago the device was last seen (optional)
 *   forceHighRisk {boolean}          - DemoPanel override: forces MFA regardless of amount (optional)
 *   forceBlock {boolean}             - DemoPanel override: forces BLOCK unconditionally (optional)
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * BLOCK fast path (absolute highest precedence):
 *   forceBlock === true
 *   -> score 90, action: "BLOCK", reasonCode: "DEMO_FORCE_BLOCK"
 *
 * MFA fast path (second precedence):
 *   forceHighRisk === true
 *   -> action: "MFA", ruleId: "DEMO_HIGH_VALUE_UNSEEN_DEVICE", matched contains forceHighRisk
 *
 *   amount >= LARGE_TRANSFER_AMOUNT_USD AND deviceFingerprintSeenDays > UNSEEN_DEVICE_DAYS_THRESHOLD
 *   -> action: "MFA", ruleId: "DEMO_HIGH_VALUE_UNSEEN_DEVICE"
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Velocity thresholds:
 *   tc1h >= 4 AND amount > 50000  -> score 88, HIGH, BLOCK (BLOCK_REPEATED_HIGH_VALUE)
 *   tc1h >= 4                     -> score 90, HIGH, BLOCK (HIGH_VELOCITY)
 *   tc1h 2..3                     -> score 60, MEDIUM, REVIEW (gray zone)
 *   tc1h 0..1                     -> score 10, LOW, ALLOW
 */
function scoreTransfer({
  tc1h,
  amount,
  deviceFingerprintSeenDays,
  forceHighRisk,
  forceBlock,
} = {}) {
  const count = Number.isFinite(Number(tc1h)) ? Number(tc1h) : 0;
  const amt = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const seenDays = Number.isFinite(Number(deviceFingerprintSeenDays))
    ? Number(deviceFingerprintSeenDays)
    : 0;

  // BLOCK fast path: DemoPanel force-block wins over everything.
  if (forceBlock === true) {
    return {
      score: 90,
      riskLevel: 'HIGH',
      action: 'BLOCK',
      reasonCode: 'DEMO_FORCE_BLOCK',
      reasonText: 'Demo: forced BLOCK from admin panel.',
      category: 'EARN_REDEEM',
      needsExplanation: false,
      ruleId: 'DEMO_FORCE_BLOCK',
      ruleName: 'Demo force-block override',
      engineLayer: 'L1+L2',
      matched: [{ field: 'forceBlock', op: 'eq', threshold: true, value: true }],
    };
  }

  // MFA fast path: DemoPanel override wins unconditionally.
  if (forceHighRisk === true) {
    return {
      score: 75,
      riskLevel: 'HIGH',
      action: 'MFA',
      reasonCode: 'HIGH_VALUE_UNSEEN_DEVICE',
      reasonText: 'High-risk transfer forced by demo panel override.',
      category: 'EARN_REDEEM',
      needsExplanation: false,
      ruleId: 'DEMO_HIGH_VALUE_UNSEEN_DEVICE',
      ruleName: 'High-value transfer from unseen device',
      engineLayer: 'L1+L2',
      matched: [{ field: 'forceHighRisk', op: 'eq', threshold: true, value: true }],
    };
  }

  // MFA fast path: large transfer from an unseen (or very stale) device.
  if (amt >= CFG.largeTransferAmountUsd && seenDays > CFG.unseenDeviceDaysThreshold) {
    return {
      score: 75,
      riskLevel: 'HIGH',
      action: 'MFA',
      reasonCode: 'HIGH_VALUE_UNSEEN_DEVICE',
      reasonText: 'High-value transfer from a device not seen in the past 30 days.',
      category: 'EARN_REDEEM',
      needsExplanation: false,
      ruleId: 'DEMO_HIGH_VALUE_UNSEEN_DEVICE',
      ruleName: 'High-value transfer from unseen device',
      engineLayer: 'L1+L2',
      matched: [
        { field: 'amount', op: 'gte', threshold: CFG.largeTransferAmountUsd, value: amt },
        {
          field: 'deviceFingerprintSeenDays',
          op: 'gt',
          threshold: CFG.unseenDeviceDaysThreshold,
          value: seenDays,
        },
      ],
    };
  }

  // High-value repeated transfers: tc1h >= 4 AND amount > 50000 triggers the
  // BLOCK_REPEATED_HIGH_VALUE rule before the plain velocity BLOCK.
  if (count >= 4 && amt > 50000) {
    return {
      score: 88,
      riskLevel: 'HIGH',
      action: 'BLOCK',
      reasonCode: 'BLOCK_REPEATED_HIGH_VALUE',
      reasonText: 'Repeated high-value transfers detected within the hour.',
      category: 'EARN_REDEEM',
      needsExplanation: false,
      ruleId: 'BLOCK_REPEATED_HIGH_VALUE',
      ruleName: 'Block repeated high-value transfer',
      engineLayer: 'L1',
      matched: [
        { field: 'tc1h', op: 'gte', threshold: 4, value: count },
        { field: 'amount', op: 'gt', threshold: 50000, value: amt },
      ],
    };
  }

  if (count >= 4) {
    return {
      score: 90,
      riskLevel: 'HIGH',
      action: 'BLOCK',
      reasonCode: 'HIGH_VELOCITY',
      reasonText: 'Transfer volume exceeds safe threshold for this hour.',
      category: 'EARN_REDEEM',
      needsExplanation: false,
    };
  }

  if (count >= 2) {
    return {
      score: 60,
      riskLevel: 'MEDIUM',
      action: 'REVIEW',
      reasonCode: 'SUSPICIOUS_VELOCITY',
      reasonText: 'Transfer rate elevated; flagged for review.',
      category: 'EARN_REDEEM',
      needsExplanation: true,
    };
  }

  return {
    score: 10,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'NORMAL_VELOCITY',
    reasonText: 'Transfer rate within normal bounds.',
    category: 'EARN_REDEEM',
    needsExplanation: false,
  };
}

module.exports = { scoreTransfer };
