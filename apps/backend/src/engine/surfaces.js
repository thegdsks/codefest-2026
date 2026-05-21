'use strict';

const PLATINUM_THRESHOLD = 1000;
const PLAT_TIER = 'platinum';
const GOLD_TIER = 'gold';
const RECENT_WINDOW_SEC = 60;
const BOOKING_WINDOW_SEC = 300;

/**
 * @typedef {'SHOWN'|'HIDDEN'|'PENDING'|'COMPLETED'} SurfaceState
 *
 * @typedef {Object} NextAction
 * @property {string} label
 * @property {'profileCompletion'|'tier'|'mfaEnrolled'|'flow.transfer'|'booking'} target
 * @property {object} [delta]
 *
 * @typedef {Object} SurfaceResult
 * @property {string} surfaceId
 * @property {SurfaceState} state
 * @property {string|null} ruleId
 * @property {string} reason
 * @property {object} context
 * @property {{headline:string,body:string}|null} copy
 * @property {NextAction|null} nextAction
 */

/**
 * Evaluate all surfaces for a user. Pure function - no DDB access, no HTTP.
 *
 * @param {{ profile: object, state: object, nowSec: number }} params
 * @returns {SurfaceResult[]}
 */
function evaluateSurfaces({ profile, state, nowSec }) {
  const st = state || {};
  const tier = String(profile.tier || '').toLowerCase();
  const isPlat = tier === PLAT_TIER;
  const loyaltyScore = Number(profile.loyaltyScore || 0);
  const pointsToNextTier = isPlat ? 0 : Math.max(PLATINUM_THRESHOLD - loyaltyScore, 0);
  const displayTier = profile.tier || '';
  const nextTier = 'Platinum';

  return [
    prestigeAdvance('PROPERTY_PRESTIGE_ADVANCE', {
      isPlat,
      pointsToNextTier,
      displayTier,
      nextTier,
      st,
      nowSec,
    }),
    prestigeAdvance('RESULTS_PRESTIGE_ADVANCE', {
      isPlat,
      pointsToNextTier,
      displayTier,
      nextTier,
      st,
      nowSec,
    }),
    profileCatalyst({ profile, isPlat, st, pointsToNextTier, displayTier, nextTier }),
    mfaEnrollmentNudge({ profile, tier, isPlat, st, nowSec }),
    transferAbandonOffer({ st, nowSec }),
    bookingConfirmationOffer({ st, nowSec }),
  ];
}

function prestigeAdvance(
  surfaceId,
  { isPlat, pointsToNextTier, displayTier, nextTier, st, nowSec }
) {
  const platinumReachedAt = st.platinumReachedAt ? Number(st.platinumReachedAt) : null;
  const justReachedPlat = platinumReachedAt && nowSec - platinumReachedAt <= RECENT_WINDOW_SEC;

  if (justReachedPlat) {
    return {
      surfaceId,
      state: 'COMPLETED',
      ruleId: 'RULE#TIER_GAP_NUDGE',
      reason: 'User just reached Platinum',
      context: { pointsToNextTier: 0, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (isPlat) {
    return {
      surfaceId,
      state: 'HIDDEN',
      ruleId: null,
      reason: 'User is at top tier already',
      context: { pointsToNextTier: 0, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (pointsToNextTier <= 10000) {
    return {
      surfaceId,
      state: 'SHOWN',
      ruleId: 'RULE#TIER_GAP_NUDGE',
      reason: `Within ${pointsToNextTier.toLocaleString()} pts of ${nextTier}`,
      context: { pointsToNextTier, currentTier: displayTier, nextTier },
      copy: {
        headline: 'Prestige Advance Benefit',
        body: `You are only ${pointsToNextTier.toLocaleString()} points away from ${nextTier}. Book 4 nights in the next 3 hours to get double points and reach ${nextTier} tier.`,
      },
      nextAction: {
        label: 'Book 4 nights to reach Platinum',
        target: 'tier',
        delta: { tier: 'Platinum' },
      },
    };
  }

  return {
    surfaceId,
    state: 'HIDDEN',
    ruleId: null,
    reason: `More than 10000 pts from ${nextTier}`,
    context: { pointsToNextTier, currentTier: displayTier, nextTier },
    copy: null,
    nextAction: null,
  };
}

function profileCatalyst({ profile, isPlat, st, pointsToNextTier, displayTier, nextTier }) {
  const completion = Number(profile.profileCompletion || 0);
  const profileCompletionReachedAt = st.profileCompletionReachedAt
    ? Number(st.profileCompletionReachedAt)
    : null;

  if (profileCompletionReachedAt && !isPlat) {
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'COMPLETED',
      ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
      reason: 'Profile completion just reached 90%',
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (isPlat || completion >= 90) {
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'HIDDEN',
      ruleId: null,
      reason: isPlat
        ? 'Already Platinum - card hidden'
        : `Profile already ${completion}% complete - card hidden`,
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (st.profileEditInProgress) {
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'PENDING',
      ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
      reason: 'Profile update in progress',
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'PROFILE_CATALYST_ELEVATE',
    state: 'SHOWN',
    ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
    reason: `Profile ${completion}% complete and user is below Platinum`,
    context: { profileCompletion: completion, currentTier: displayTier, nextTier },
    copy: {
      headline: 'Catalyst Elevate Benefit',
      body: `As a valued ${displayTier} Status member, you are only ${pointsToNextTier.toLocaleString()} SFC points away from ${nextTier}. Update your details to increase your ${completion}% Registry Completeness.`,
    },
    nextAction: {
      label: 'Update mobile phone',
      target: 'profileCompletion',
      delta: { profileCompletion: 90 },
    },
  };
}

function mfaEnrollmentNudge({ profile, tier, isPlat, st, nowSec }) {
  const hasMfa = !!profile.mfaSecret;
  const mfaEnrolledAt = st.mfaEnrolledAt ? Number(st.mfaEnrolledAt) : null;
  const justEnrolled = mfaEnrolledAt && nowSec - mfaEnrolledAt <= RECENT_WINDOW_SEC;

  if (justEnrolled) {
    return {
      surfaceId: 'MFA_ENROLLMENT_NUDGE',
      state: 'COMPLETED',
      ruleId: 'RULE#MFA_ENROLLMENT_GAP',
      reason: 'MFA just enrolled',
      context: { hasMfa: true, currentTier: profile.tier || '' },
      copy: null,
      nextAction: null,
    };
  }

  const eligibleTier = isPlat || tier === GOLD_TIER;

  if (!eligibleTier || hasMfa) {
    return {
      surfaceId: 'MFA_ENROLLMENT_NUDGE',
      state: 'HIDDEN',
      ruleId: null,
      reason: hasMfa ? 'MFA already enrolled' : 'Tier not eligible for MFA nudge',
      context: { hasMfa, currentTier: profile.tier || '' },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'MFA_ENROLLMENT_NUDGE',
    state: 'SHOWN',
    ruleId: 'RULE#MFA_ENROLLMENT_GAP',
    reason: `${profile.tier} member without MFA enrolled`,
    context: { hasMfa: false, currentTier: profile.tier || '' },
    copy: {
      headline: 'Secure Your Account',
      body: `As a ${profile.tier} Status member, protect your points with two-factor authentication.`,
    },
    nextAction: {
      label: 'Enroll MFA',
      target: 'mfaEnrolled',
      delta: { mfaEnrolled: true },
    },
  };
}

function transferAbandonOffer({ st, nowSec }) {
  const draft = st.transferDraft;
  const lastTransferCompletedAt = st.lastTransferCompletedAt
    ? Number(st.lastTransferCompletedAt)
    : null;
  const justCompleted =
    lastTransferCompletedAt && nowSec - lastTransferCompletedAt <= RECENT_WINDOW_SEC;

  if (justCompleted) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'COMPLETED',
      ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
      reason: 'Transfer just completed',
      context: { hasDraft: false },
      copy: null,
      nextAction: null,
    };
  }

  if (!draft) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'HIDDEN',
      ruleId: null,
      reason: 'No transfer draft',
      context: { hasDraft: false },
      copy: null,
      nextAction: null,
    };
  }

  const lastUpdatedAt = Number(draft.lastUpdatedAt || 0);
  const isPending = nowSec - lastUpdatedAt <= RECENT_WINDOW_SEC;

  if (isPending) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'PENDING',
      ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
      reason: 'Transfer draft active within last 60s',
      context: { hasDraft: true, lastUpdatedAt },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'TRANSFER_ABANDON_OFFER',
    state: 'SHOWN',
    ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
    reason: 'Abandoned transfer draft detected',
    context: { hasDraft: true, lastUpdatedAt },
    copy: {
      headline: 'Pick Up Where You Left Off',
      body: 'Complete your transfer in the next 5 minutes and earn 2x bonus points.',
    },
    nextAction: {
      label: 'Continue transfer with 2x points bonus',
      target: 'flow.transfer',
      delta: { resume: true },
    },
  };
}

function bookingConfirmationOffer({ st, nowSec }) {
  const recentBookingAt = st.recentBookingAt ? Number(st.recentBookingAt) : null;
  const bookingOfferDismissedAt = st.bookingOfferDismissedAt
    ? Number(st.bookingOfferDismissedAt)
    : null;

  if (!recentBookingAt || nowSec - recentBookingAt > BOOKING_WINDOW_SEC) {
    return {
      surfaceId: 'BOOKING_CONFIRMATION_OFFER',
      state: 'HIDDEN',
      ruleId: null,
      reason: 'No recent booking',
      context: { hasRecentBooking: false },
      copy: null,
      nextAction: {
        label: 'Complete a booking',
        target: 'booking',
        delta: { trigger: true },
      },
    };
  }

  if (bookingOfferDismissedAt && bookingOfferDismissedAt > recentBookingAt) {
    return {
      surfaceId: 'BOOKING_CONFIRMATION_OFFER',
      state: 'COMPLETED',
      ruleId: 'RULE#POST_BOOKING_UPSELL',
      reason: 'Booking offer was dismissed',
      context: { hasRecentBooking: true },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'BOOKING_CONFIRMATION_OFFER',
    state: 'SHOWN',
    ruleId: 'RULE#POST_BOOKING_UPSELL',
    reason: 'Recent booking detected',
    context: { hasRecentBooking: true, recentBookingAt },
    copy: {
      headline: 'Thank You for Your Booking',
      body: 'Earn 500 bonus points when you add breakfast to your reservation.',
    },
    nextAction: null,
  };
}

module.exports = { evaluateSurfaces };
