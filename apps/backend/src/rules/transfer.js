'use strict';

const { CFG } = require('../lib/config');

/**
 * scoreTransfer - pure L1 transfer velocity and device scoring function.
 *
 * Inputs:
 *   tc1h {number}                    - transfer count in the past hour for this user
 *   amount {number}                  - transfer amount in USD (optional)
 *   deviceFingerprintSeenDays {number} - how many days ago the device was last seen (optional)
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * MFA fast path (checked first, before velocity):
 *   amount >= LARGE_TRANSFER_AMOUNT_USD AND deviceFingerprintSeenDays > UNSEEN_DEVICE_DAYS_THRESHOLD
 *   -> action: "MFA", ruleId: "DEMO_HIGH_VALUE_UNSEEN_DEVICE"
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Velocity thresholds:
 *   tc1h >= 4  -> score 90, HIGH, BLOCK
 *   tc1h 2..3  -> score 60, MEDIUM, REVIEW (gray zone)
 *   tc1h 0..1  -> score 10, LOW, ALLOW
 */
function scoreTransfer({ tc1h, amount, deviceFingerprintSeenDays } = {}) {
  const count = Number.isFinite(Number(tc1h)) ? Number(tc1h) : 0;
  const amt = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const seenDays = Number.isFinite(Number(deviceFingerprintSeenDays))
    ? Number(deviceFingerprintSeenDays)
    : 0;

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
