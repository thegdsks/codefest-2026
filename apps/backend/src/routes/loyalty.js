'use strict';

const { randomUUID } = require('node:crypto');

const { json, err, qparam } = require('../lib/http');
const { getUserById, recentActivity, requireBearer } = require('../lib/ddb');
const {
  getCurrentTier,
  getNextTier,
  pointsToNextTier,
  tierProgress,
  getTierBenefits,
} = require('../lib/tiers');

/**
 * Derive a displayable SFC points balance from UserProfile.
 *
 * Priority:
 *   1. profile.loyaltyPointsBalance  (explicit field, when seed provides it)
 *   2. profile.loyaltyScore as raw points when >= 1000 (curated personas store
 *      realistic point totals directly, e.g. dre032 = 49,500)
 *   3. profile.loyaltyScore * 82 otherwise (legacy seed user001-030 stored a
 *      0-1000 rating; scale to points so the UI shows a believable balance)
 */
const POINTS_SCALE = 82;
const RAW_POINTS_THRESHOLD = 1000;

function deriveLoyaltyPoints(profile) {
  if (typeof profile.loyaltyPointsBalance === 'number' && profile.loyaltyPointsBalance >= 0) {
    return profile.loyaltyPointsBalance;
  }
  const raw = Number(profile.loyaltyScore || 0);
  if (raw >= RAW_POINTS_THRESHOLD) return Math.round(raw);
  return Math.round(raw * POINTS_SCALE);
}

function activityId(row) {
  return row.activityId || `ACT#${randomUUID().slice(0, 8)}`;
}

function balanceAfterField(row) {
  return typeof row.balanceAfter === 'number' ? row.balanceAfter : null;
}

function baseEntry(row, resolvedType, amount) {
  return {
    id: activityId(row),
    type: resolvedType,
    amount,
    timestamp: row.activityTime,
    balanceAfter: balanceAfterField(row),
  };
}

/**
 * Map a raw UserActivity row into a miles-transaction object.
 * Returns null for activity types that do not affect the points balance.
 */
function toMilesEntry(row) {
  const type = row.activityType || '';
  const amount = Number(row.amount || 0);

  if (type === 'TRANSFER_OUT' || type === 'TRANSFER') {
    // TRANSFER is a legacy alias for TRANSFER_OUT
    return {
      ...baseEntry(row, 'TRANSFER_OUT', -Math.abs(amount)),
      counterparty: row.recipientId || null,
    };
  }
  if (type === 'TRANSFER_IN') {
    return {
      ...baseEntry(row, 'TRANSFER_IN', Math.abs(amount)),
      counterparty: row.recipientId || null,
    };
  }
  if (type === 'BOOKING_EARNED') {
    return {
      ...baseEntry(row, 'BOOKING_EARNED', Math.abs(amount)),
      property: row.metadata || null,
    };
  }
  if (type === 'PROMO_BONUS') {
    return {
      ...baseEntry(row, 'PROMO_BONUS', Math.abs(amount)),
      campaign: row.metadata || null,
    };
  }
  if (type === 'REDEMPTION') {
    return baseEntry(row, 'REDEMPTION', -Math.abs(amount));
  }
  return null;
}

/**
 * GET /customer/loyalty-summary?userId={id}
 *
 * Returns the full loyalty picture for the authenticated user:
 *   - current tier and points balance (derived or explicit)
 *   - next tier name, points to reach it, and fractional progress
 *   - tier benefit strings for both current and next tier
 *   - up to 10 recent points-affecting activities (recentMiles)
 *
 * Bearer auth: token must match the requested userId.
 */
async function loyaltySummary(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const currentPoints = deriveLoyaltyPoints(profile);
  const currentTier = getCurrentTier(currentPoints);
  const nextTier = getNextTier(currentTier);
  const ptsToNext = pointsToNextTier(currentPoints);
  const progress = tierProgress(currentPoints);
  const tierBenefits = getTierBenefits(currentTier);
  const nextTierBenefits = nextTier ? getTierBenefits(nextTier) : [];

  // Pull up to 20 recent activity rows then filter to points-affecting types.
  // We over-fetch to ensure we get at least 10 miles entries even if there are
  // many non-miles rows in the window.
  const rawActivity = await recentActivity(userId, 20);
  const recentMiles = rawActivity.map(toMilesEntry).filter(Boolean).slice(0, 10);

  return json(200, correlationId, {
    data: {
      userId,
      currentTier,
      currentPoints,
      nextTier,
      pointsToNextTier: ptsToNext,
      tierProgress: progress,
      tierBenefits,
      nextTierBenefits,
      recentMiles,
    },
  });
}

module.exports = { loyaltySummary };
