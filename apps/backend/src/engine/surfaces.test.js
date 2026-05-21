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
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum' }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'HIDDEN');
    assert.equal(s.copy, null);
  });

  test('PROPERTY_PRESTIGE_ADVANCE is COMPLETED when platinumReachedAt within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum' }),
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
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Silver' }),
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
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum', loyaltyScore: 1000, mfaSecret: null }),
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

  test('returns all 7 surfaces in every call', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    assert.equal(result.length, 7);
  });

  test('PROPERTY_PERSONALIZED_OFFER is PENDING when dwell < 5s and Gold', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Gold' }),
      state: baseState({ propertyDwellMs: 2000, currentPropertyId: 'prop-001' }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PERSONALIZED_OFFER');
    assert.equal(s.state, 'PENDING');
    assert.equal(s.context.propertyId, 'prop-001');
  });

  test('PROPERTY_PERSONALIZED_OFFER is SHOWN when dwell > 5s and Gold', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Gold' }),
      state: baseState({ propertyDwellMs: 8000, currentPropertyId: 'prop-001' }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PERSONALIZED_OFFER');
    assert.equal(s.state, 'SHOWN');
  });

  test('PROPERTY_PERSONALIZED_OFFER is HIDDEN when booking flow active', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Gold' }),
      state: baseState({ propertyDwellMs: 8000, bookingFlowActive: true }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PERSONALIZED_OFFER');
    assert.equal(s.state, 'HIDDEN');
    assert.ok(s.reason.includes('booking flow'));
  });

  test('PROPERTY_PERSONALIZED_OFFER is HIDDEN when recently booked', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Gold' }),
      state: baseState({ propertyDwellMs: 8000, recentBookingAt: NOW - 60 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PERSONALIZED_OFFER');
    assert.equal(s.state, 'HIDDEN');
    assert.ok(s.reason.includes('recently booked'));
  });

  test('PROPERTY_PERSONALIZED_OFFER is HIDDEN for Silver tier', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Silver' }),
      state: baseState({ propertyDwellMs: 8000 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PERSONALIZED_OFFER');
    assert.equal(s.state, 'HIDDEN');
    assert.ok(s.reason.includes('eligible'));
  });
});
