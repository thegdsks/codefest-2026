'use strict';

const ELITE_TIERS = new Set(['platinum', 'titanium', 'ambassador']);

/**
 * scoreOffer - pure L1 offer eligibility scoring function.
 *
 * Inputs:
 *   loyaltyScore  {number}  - user's loyalty score
 *   tier          {string}  - user's membership tier
 *   now           {number}  - current unix seconds
 *   cooldownUntil {number}  - unix seconds when offer cooldown expires (0 = no cooldown)
 *
 * Returns an L1 draft decision object (score 0..100).
 *
 * Offer triggers when:
 *   (loyaltyScore >= 700 OR tier in {platinum, titanium, ambassador})
 *   AND now >= cooldownUntil
 *
 * No gray zone for offers: score is 80 (OFFER) or 0 (no offer).
 */
function scoreOffer({ loyaltyScore, tier, now, cooldownUntil } = {}) {
  const score = Number.isFinite(Number(loyaltyScore)) ? Number(loyaltyScore) : 0;
  const tierStr = tier ? String(tier).toLowerCase() : '';
  const nowSec = Number.isFinite(Number(now)) ? Number(now) : 0;
  const cooldown = Number.isFinite(Number(cooldownUntil)) ? Number(cooldownUntil) : 0;

  const qualified = score >= 700 || ELITE_TIERS.has(tierStr);
  const cooledDown = nowSec >= cooldown;

  if (qualified && cooledDown) {
    return {
      score: 80,
      riskLevel: 'HIGH',
      action: 'OFFER',
      reasonCode: 'HIGH_INTENT',
      reasonText: 'High loyalty score or elite tier; incentive eligible.',
      category: 'OFFERS',
      needsExplanation: false,
    };
  }

  return {
    score: 0,
    riskLevel: 'LOW',
    action: 'ALLOW',
    reasonCode: 'NO_OFFER',
    reasonText: 'User does not meet offer criteria or is in cooldown.',
    category: 'OFFERS',
    needsExplanation: false,
  };
}

module.exports = { scoreOffer };
