'use strict';

/**
 * Centralised tier definitions and threshold helpers.
 *
 * Tier ladder (ascending):
 *   Silver   -> Gold     at 25,000 pts
 *   Gold     -> Platinum at 50,000 pts
 *   Platinum -> Diamond  at 100,000 pts
 *   Diamond  is the ceiling tier.
 *
 * All callers that need to resolve a tier or compute progress import from here
 * so thresholds live in exactly one place.
 */

/** @type {Array<{tier: string, min: number, max: number | null}>} */
const TIER_THRESHOLDS = [
  { tier: 'Silver', min: 0, max: 24999 },
  { tier: 'Gold', min: 25000, max: 49999 },
  { tier: 'Platinum', min: 50000, max: 99999 },
  { tier: 'Diamond', min: 100000, max: null },
];

/** Map of tier name -> benefits list shown on the loyalty card */
const TIER_BENEFITS = {
  Silver: ['1x points on all stays', 'Standard check-out', 'Member-only rates'],
  Gold: [
    '2x points on weekend stays',
    'Late checkout up to 2pm',
    'Free room upgrades when available',
  ],
  Platinum: [
    '3x points on all stays',
    'Guaranteed room upgrades',
    'Priority customer support',
    'Free breakfast',
  ],
  Diamond: [
    '4x points on all stays',
    'Butler service',
    'Suite upgrades guaranteed',
    'Private airport transfer',
    'Personal concierge',
  ],
};

/**
 * Derive the current tier from a raw points balance.
 * Falls back to 'Silver' when below the first threshold.
 *
 * @param {number} points
 * @returns {string}
 */
function getCurrentTier(points) {
  const p = typeof points === 'number' ? points : 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (p >= TIER_THRESHOLDS[i].min) {
      return TIER_THRESHOLDS[i].tier;
    }
  }
  return 'Silver';
}

/**
 * Return the next tier above the current one, or null at Diamond.
 *
 * @param {string} currentTier
 * @returns {string | null}
 */
function getNextTier(currentTier) {
  const idx = TIER_THRESHOLDS.findIndex((t) => t.tier === currentTier);
  if (idx < 0 || idx === TIER_THRESHOLDS.length - 1) return null;
  return TIER_THRESHOLDS[idx + 1].tier;
}

/**
 * Points remaining until the next tier boundary.
 * Returns 0 when the user is at the ceiling tier.
 *
 * @param {number} points
 * @returns {number}
 */
function pointsToNextTier(points) {
  const p = typeof points === 'number' ? points : 0;
  const current = getCurrentTier(p);
  const threshold = TIER_THRESHOLDS.find((t) => t.tier === current);
  if (!threshold || threshold.max === null) return 0;
  return Math.max(0, threshold.max + 1 - p);
}

/**
 * Fractional progress through the current tier band, in [0, 1].
 * At Diamond always returns 1.
 *
 * @param {number} points
 * @returns {number}
 */
function tierProgress(points) {
  const p = typeof points === 'number' ? points : 0;
  const current = getCurrentTier(p);
  const threshold = TIER_THRESHOLDS.find((t) => t.tier === current);
  if (!threshold || threshold.max === null) return 1;
  const bandWidth = threshold.max - threshold.min + 1;
  const inBand = p - threshold.min;
  return Number(Math.min(1, Math.max(0, inBand / bandWidth)).toFixed(4));
}

/**
 * Return the benefit strings for a given tier.
 *
 * @param {string} tier
 * @returns {string[]}
 */
function getTierBenefits(tier) {
  return TIER_BENEFITS[tier] || [];
}

module.exports = {
  TIER_THRESHOLDS,
  TIER_BENEFITS,
  getCurrentTier,
  getNextTier,
  pointsToNextTier,
  tierProgress,
  getTierBenefits,
};
