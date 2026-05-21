'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSurfaces } = require('./surfaces');

function baseProfile(overrides = {}) {
  return {
    userId: 'user001',
    tier: 'Gold',
    loyaltyScore: 600,
    profileCompletion: 70,
    emailVerified: true,
    phoneVerified: false,
    mfaSecret: null,
    ...overrides,
  };
}

function baseState(overrides = {}) {
  return { userId: 'user001', ...overrides };
}

const NOW = 1716300000;

describe('evaluateSurfaces', () => {
  test('PROPERTY_PRESTIGE_ADVANCE is SHOWN when tier=Gold and close to threshold', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'SHOWN');
    assert.ok(s.copy !== null);
    assert.ok(s.nextAction !== null);
    assert.equal(s.nextAction.target, 'tier');
  });

  test('PROPERTY_PRESTIGE_ADVANCE is HIDDEN when already Platinum', () => {
    // loyaltyScore must be >= 50000 so getCurrentTier returns Platinum
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 60000 }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'HIDDEN');
    assert.equal(s.copy, null);
  });

  test('PROPERTY_PRESTIGE_ADVANCE is COMPLETED when platinumReachedAt within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 60000 }),
      state: baseState({ platinumReachedAt: NOW - 30 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'COMPLETED');
  });

  test('RESULTS_PRESTIGE_ADVANCE mirrors PROPERTY_PRESTIGE_ADVANCE logic', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const prop = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    const res = result.find((r) => r.surfaceId === 'RESULTS_PRESTIGE_ADVANCE');
    assert.equal(prop.state, res.state);
  });

  test('PROFILE_CATALYST_ELEVATE is SHOWN when incomplete and not Platinum', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'SHOWN');
  });

  test('PROFILE_CATALYST_ELEVATE is PENDING when profileEditInProgress', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ profileEditInProgress: true }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'PENDING');
    assert.equal(s.copy, null);
  });

  test('PROFILE_CATALYST_ELEVATE is HIDDEN when profileCompletion >= 90', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ profileCompletion: 90 }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'HIDDEN');
  });

  test('PROFILE_CATALYST_ELEVATE is COMPLETED when profileCompletionReachedAt is set', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ profileCompletion: 95 }),
      state: baseState({ profileCompletionReachedAt: NOW - 30 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'COMPLETED');
  });

  test('MFA_ENROLLMENT_NUDGE is SHOWN when Gold with no mfaSecret', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'SHOWN');
    assert.equal(s.ruleId, 'RULE#MFA_ENROLLMENT_GAP');
  });

  test('MFA_ENROLLMENT_NUDGE is HIDDEN when Silver', () => {
    // loyaltyScore must be < 25000 so getCurrentTier returns Silver
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Silver', loyaltyScore: 10000 }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'HIDDEN');
  });

  test('MFA_ENROLLMENT_NUDGE is HIDDEN when already has mfaSecret', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ mfaSecret: 'BASE32SECRET' }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'HIDDEN');
  });

  test('MFA_ENROLLMENT_NUDGE is SHOWN for Platinum without mfaSecret', () => {
    // loyaltyScore must be >= 50000 so getCurrentTier returns Platinum
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 60000, mfaSecret: null }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'SHOWN');
  });

  test('MFA_ENROLLMENT_NUDGE is COMPLETED when mfaEnrolledAt within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ mfaSecret: 'BASE32SECRET' }),
      state: baseState({ mfaEnrolledAt: NOW - 30 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'COMPLETED');
  });

  test('TRANSFER_ABANDON_OFFER is PENDING when draft updated within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ transferDraft: { lastUpdatedAt: NOW - 30 } }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'PENDING');
  });

  test('TRANSFER_ABANDON_OFFER is SHOWN when draft is stale', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ transferDraft: { lastUpdatedAt: NOW - 120 } }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'SHOWN');
  });

  test('TRANSFER_ABANDON_OFFER is HIDDEN when no draft', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'HIDDEN');
  });

  test('TRANSFER_ABANDON_OFFER is COMPLETED when lastTransferCompletedAt within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ lastTransferCompletedAt: NOW - 20 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'COMPLETED');
  });

  test('BOOKING_CONFIRMATION_OFFER is SHOWN when recentBookingAt within 5 min', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ recentBookingAt: NOW - 60 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'SHOWN');
  });

  test('BOOKING_CONFIRMATION_OFFER is HIDDEN when no recent booking', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'HIDDEN');
    assert.ok(s.nextAction !== null);
  });

  test('BOOKING_CONFIRMATION_OFFER is COMPLETED when dismissed after booking', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ recentBookingAt: NOW - 60, bookingOfferDismissedAt: NOW - 30 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'COMPLETED');
  });

  test('returns all 6 surfaces in every call', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    assert.equal(result.length, 6);
  });

  // ------------------------------------------------------------------
  // Dual-shape recentBooking (P0-2)
  // ------------------------------------------------------------------

  test('BOOKING_CONFIRMATION_OFFER SHOWN when state has nested recentBooking.bookedAt', () => {
    // Seed shape: { recentBooking: { bookedAt: <epochSec> } }
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({
        recentBooking: { propertyId: 'PROP#42', nights: 3, bookedAt: NOW - 60 },
      }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'SHOWN', 'nested recentBooking.bookedAt should trigger SHOWN');
  });

  test('BOOKING_CONFIRMATION_OFFER flat recentBookingAt takes precedence over nested', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({
        recentBookingAt: NOW - 30,
        recentBooking: { bookedAt: NOW - 99999 }, // stale nested should be ignored
      }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'SHOWN', 'flat recentBookingAt should win when present');
  });

  // ------------------------------------------------------------------
  // Tier consistency: surfaces derive from loyaltyScore not profile.tier (P1-1)
  // ------------------------------------------------------------------

  test('PROPERTY_PRESTIGE_ADVANCE is HIDDEN for Diamond persona (120000 pts)', () => {
    // priya033: loyaltyScore=120000 -> Diamond (>= 100000 threshold)
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 120000 }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    // Diamond is top-tier so isPlat flag should be true -> HIDDEN
    assert.equal(s.state, 'HIDDEN', 'Diamond tier should hide prestige advance surface');
    assert.equal(
      s.context.currentTier,
      'Diamond',
      'currentTier in context should reflect computed tier from loyaltyScore'
    );
  });

  test('displayTier is Diamond when loyaltyScore >= 100000 even if profile.tier says Platinum', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 100000 }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.context.currentTier, 'Diamond');
  });
});
