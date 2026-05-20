'use strict';

/**
 * scoreTransfer - pure L1 transfer velocity scoring function.
 *
 * Inputs:
 *   tc1h {number} - transfer count in the past hour for this user
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * Gray zone: 40..70 inclusive triggers needsExplanation = true.
 *
 * Thresholds:
 *   tc1h >= 4  -> score 90, HIGH, BLOCK
 *   tc1h 2..3  -> score 60, MEDIUM, REVIEW (gray zone)
 *   tc1h 0..1  -> score 10, LOW, ALLOW
 */
function scoreTransfer({ tc1h } = {}) {
  const count = Number.isFinite(Number(tc1h)) ? Number(tc1h) : 0;

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
