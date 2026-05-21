'use strict';

const { randomUUID } = require('node:crypto');

const { CFG } = require('../lib/config');
const { nowSec, json, err, parseBody, requireField, qparam } = require('../lib/http');
const {
  getUserById,
  getState,
  incrementTransferCounters,
  updateLastTransferRecipient,
  bumpOfferShown,
  bumpNudgeShown,
  putActivity,
  recentActivity,
  putDecision,
  putSession,
  getSession,
  requireBearer,
  setTransferDraft,
  clearTransferDraft,
  setRecentBooking,
  updateCustomerProfile,
} = require('../lib/ddb');
const {
  activityTransfer,
  activityOfferAction,
  activityNudgeAction,
  decision,
} = require('../lib/activity');
const { scoreTransfer } = require('../rules/transfer');
const { scoreOffer } = require('../rules/offers');
const { scoreNudge } = require('../rules/nudges');
const { profileCompleteness } = require('../rules/profile');
const { route: engineRoute } = require('../engine/router');
const { evaluateSurfaces } = require('../engine/surfaces');
const { prioritize: aiPrioritize } = require('../engine/ai-surface-prioritizer');
const { explain: aiExplain } = require('../engine/ai-fraud-explainer');
const { composeOffer: aiComposeOffer } = require('../engine/ai-offer-composer');

// Demo-only: these property IDs are always marked as fully booked.
const FULLY_BOOKED_PROPERTY_IDS = new Set(['prop-fully-booked-demo']);
const { evaluateMfaCode } = require('./auth');

/**
 * Resolve how many days ago the given device fingerprint was last seen by
 * comparing it against the user's demo.knownDevicesLast30d array stored on
 * their UserProfile.
 *
 * Returns 7 when the device is in the known list (recent enough to pass),
 * or 90 when it is not found (very stale, triggers the unseen-device rule).
 */
function resolveDeviceSeenDays(profile, deviceFingerprint) {
  if (!deviceFingerprint) return 90;
  const known =
    profile && profile.demo && Array.isArray(profile.demo.knownDevicesLast30d)
      ? profile.demo.knownDevicesLast30d
      : [];
  return known.includes(deviceFingerprint) ? 7 : 90;
}

async function transfer(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);
  const recipientId = requireField(body, 'recipientId');
  const amount = Number(requireField(body, 'amount'));
  const channel = body.channel || 'APP';
  const deviceFingerprint = body.deviceFingerprint || '';
  const forceHighRisk = body.forceHighRisk === true;

  if (!Number.isFinite(amount) || amount <= 0)
    return err(400, correlationId, 'VALIDATION_ERROR', 'amount must be > 0');

  const sender = await getUserById(userId);
  if (!sender) return err(404, correlationId, 'USER_NOT_FOUND', 'Sender not found');
  const receiver = await getUserById(recipientId);
  if (!receiver) return err(404, correlationId, 'USER_NOT_FOUND', 'Recipient not found');

  const st0 = await getState(userId);
  if (st0 && st0.isBlocked) return err(403, correlationId, 'ACCOUNT_BLOCKED', 'Sender is blocked');

  const now = nowSec();
  await incrementTransferCounters(userId, now);
  await updateLastTransferRecipient(userId, recipientId);

  const st = await getState(userId);
  const tc1h = st && st.transferCount1h ? st.transferCount1h : 0;

  const deviceFingerprintSeenDays = resolveDeviceSeenDays(sender, deviceFingerprint);

  const l1Draft = scoreTransfer({ tc1h, amount, deviceFingerprintSeenDays, forceHighRisk });
  const final = await engineRoute(l1Draft, { userId, category: 'EARN_REDEEM' });

  const transferId = `XFER#${randomUUID().slice(0, 8)}`;
  await putActivity(activityTransfer(userId, now, amount, recipientId, channel, correlationId));

  if (final.action === 'BLOCK') {
    // Generate AI explanation inline (2s timeout; decision proceeds if LLM is slow)
    const blockExplanation = await aiExplain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'BLOCK',
      score: final.score,
      reasonCode: final.reasonCode,
      reasonText: final.reasonText,
      context: { amount, recipientId, deviceFingerprint, channel },
      priorDecisions: [],
    });

    await putDecision(
      decision(
        userId,
        'FRAUD_TRANSFER',
        final.score,
        final.riskLevel,
        'BLOCK',
        final.reasonCode,
        final.reasonText,
        'EARN_REDEEM',
        correlationId,
        { ...final, aiExplanation: blockExplanation || undefined }
      )
    );
    return err(403, correlationId, 'TRANSFER_BLOCKED', 'Transfer blocked due to high fraud risk');
  }

  if (final.action === 'MFA') {
    // Generate AI explanation inline (2s timeout)
    const mfaExplanation = await aiExplain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'MFA',
      score: final.score,
      reasonCode: final.reasonCode,
      reasonText: final.reasonText,
      context: { amount, recipientId, deviceFingerprint, channel },
      priorDecisions: [],
    });

    const decRow = decision(
      userId,
      'FRAUD_TRANSFER',
      final.score,
      final.riskLevel,
      'MFA',
      final.reasonCode,
      final.reasonText,
      'EARN_REDEEM',
      correlationId,
      { ...final, aiExplanation: mfaExplanation || undefined }
    );
    await putDecision(decRow);

    const challengeId = `TXMFA#${randomUUID().slice(0, 8)}`;
    const expiresAt = now + CFG.transferMfaTtlSec;
    await putSession({
      sessionId: challengeId,
      recordType: 'MFA_CHALLENGE',
      challengeType: 'TRANSFER',
      userId,
      pendingTransfer: { userId, recipientId, amount, deviceFingerprint },
      decisionId: decRow.decisionId,
      issuedAt: now,
      expiresAt,
      mfaPath: 'TRANSFER_RISK',
    });

    return json(200, correlationId, {
      data: {
        action: 'MFA',
        challengeId,
        mfaPath: 'TRANSFER_RISK',
        decisionId: decRow.decisionId,
        expiresInSec: CFG.transferMfaTtlSec,
      },
    });
  }

  if (final.action === 'REVIEW') {
    // Generate AI explanation inline (2s timeout)
    const reviewExplanation = await aiExplain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'REVIEW',
      score: final.score,
      reasonCode: final.reasonCode,
      reasonText: final.reasonText,
      context: { amount, recipientId, deviceFingerprint, channel },
      priorDecisions: [],
    });

    await putDecision(
      decision(
        userId,
        'FRAUD_TRANSFER',
        final.score,
        final.riskLevel,
        'REVIEW',
        final.reasonCode,
        final.reasonText,
        'EARN_REDEEM',
        correlationId,
        { ...final, aiExplanation: reviewExplanation || undefined }
      )
    );
    return json(200, correlationId, {
      data: { status: 'UNDER_REVIEW', transferId, reason: 'SUSPICIOUS_TRANSFER_PATTERN' },
    });
  }

  await putDecision(
    decision(
      userId,
      'FRAUD_TRANSFER',
      final.score,
      final.riskLevel,
      'ALLOW',
      final.reasonCode,
      final.reasonText,
      'EARN_REDEEM',
      correlationId,
      final
    )
  );
  return json(200, correlationId, {
    data: { status: 'SUCCESS', transferId, message: 'Transfer completed' },
  });
}

async function getOffers(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const loyaltyScore = Number(profile.loyaltyScore || 0);
  const tier = String(profile.tier || '');

  const now = nowSec();
  const st = await getState(userId);
  const cooldownUntil = st && st.offerCooldownUntil ? st.offerCooldownUntil : 0;

  const l1Draft = scoreOffer({ loyaltyScore, tier, now, cooldownUntil });
  // Offers has no gray zone; score is either 80 (OFFER) or 0 (ALLOW).
  // The router will return L1 verbatim in both cases.
  const final = await engineRoute(l1Draft, { userId, category: 'OFFERS' });

  const offers = [];
  if (final.action === 'OFFER') {
    const validUntil = now + 2 * 3600;
    offers.push({
      offerId: 'OFF#001',
      title: 'Free night award + 2000 points',
      reason: 'HIGH_ENGAGEMENT_SCORE',
      validUntil,
    });
    await bumpOfferShown(userId, now + 1800);
    await putDecision(
      decision(
        userId,
        'ENGAGEMENT_OFFER',
        final.score,
        final.riskLevel,
        'OFFER',
        final.reasonCode,
        final.reasonText,
        'OFFERS',
        correlationId,
        final
      )
    );
  }

  const payload = { data: { userId, offers } };
  if (offers.length === 0) return json(204, correlationId, payload);
  return json(200, correlationId, payload);
}

async function offerAction(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);
  const offerId = requireField(body, 'offerId');
  const action = requireField(body, 'action').toUpperCase();

  if (!['IMPRESSION', 'CLICK', 'BOOK'].includes(action))
    return err(400, correlationId, 'VALIDATION_ERROR', 'action must be IMPRESSION|CLICK|BOOK');
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const now = nowSec();
  await putActivity(activityOfferAction(userId, now, offerId, action, correlationId));
  await putDecision(
    decision(
      userId,
      'ENGAGEMENT_OFFER',
      0.0,
      'LOW',
      'ALLOW',
      'OFFER_ACTION',
      'Offer action tracked',
      'OFFERS',
      correlationId
    )
  );
  return json(200, correlationId, { data: { status: 'TRACKED' } });
}

async function getNudges(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const completion = Number(profile.profileCompletion || 0);
  const emailVerified = !!profile.emailVerified;
  const phoneVerified = !!profile.phoneVerified;

  const now = nowSec();
  const { missingFields } = profileCompleteness({ profile });

  const l1Draft = scoreNudge({ profileCompletion: completion, emailVerified, phoneVerified });
  const final = await engineRoute(l1Draft, { userId, category: 'PROFILE', missingFields });

  const nudges = [];
  if (final.action === 'NUDGE') {
    const nudgeMessage = final.generatedText || 'Complete your profile now to speed up booking';
    nudges.push({
      nudgeId: 'NUDGE#PROFILE',
      message: nudgeMessage,
      reason: final.reasonCode,
    });
    await bumpNudgeShown(userId, now);
    await putDecision(
      decision(
        userId,
        'NUDGE',
        final.score,
        final.riskLevel,
        'NUDGE',
        final.reasonCode,
        final.reasonText,
        'PROFILE',
        correlationId,
        final
      )
    );
  }

  const payload = { data: { userId, nudges } };
  if (nudges.length === 0) return json(204, correlationId, payload);
  return json(200, correlationId, payload);
}

async function nudgeAction(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);
  const nudgeId = requireField(body, 'nudgeId');
  const action = requireField(body, 'action').toUpperCase();

  if (!['SHOWN', 'DISMISSED', 'COMPLETED'].includes(action))
    return err(400, correlationId, 'VALIDATION_ERROR', 'action must be SHOWN|DISMISSED|COMPLETED');
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const now = nowSec();
  await putActivity(activityNudgeAction(userId, now, nudgeId, action, correlationId));
  await putDecision(
    decision(
      userId,
      'NUDGE',
      0.0,
      'LOW',
      'ALLOW',
      'NUDGE_ACTION',
      'Nudge action tracked',
      'PROFILE',
      correlationId
    )
  );
  return json(200, correlationId, { data: { status: 'UPDATED' } });
}

async function getProfile(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const data = {
    userId,
    username: profile.username,
    tier: profile.tier,
    loyaltyScore: profile.loyaltyScore || 0,
    profileCompletion: profile.profileCompletion || 0,
    emailVerified: !!profile.emailVerified,
    phoneVerified: !!profile.phoneVerified,
  };
  return json(200, correlationId, { data });
}

async function dashboard(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const st = (await getState(userId)) || {};
  const recent = await recentActivity(userId, 10);

  const user = { userId, tier: profile.tier };
  const fraudStatus = {
    isBlocked: !!st.isBlocked,
    transferCount1h: st.transferCount1h || 0,
    lastLoginLocation: st.lastLoginLocation || null,
  };

  // compute offers and nudges inline
  const now = nowSec();
  const offers = [];
  const loyaltyScore = Number(profile.loyaltyScore || 0);
  const tier = String(profile.tier || '');
  const cooldownUntil = st.offerCooldownUntil || 0;
  if (
    now >= cooldownUntil &&
    (loyaltyScore >= 700 || ['platinum', 'titanium', 'ambassador'].includes(tier.toLowerCase()))
  ) {
    offers.push({
      offerId: 'OFF#001',
      title: 'Free night award + 2000 points',
      reason: 'HIGH_ENGAGEMENT_SCORE',
      validUntil: now + 2 * 3600,
    });
  }

  const nudges = [];
  const completion = Number(profile.profileCompletion || 0);
  const emailVerified = !!profile.emailVerified;
  const phoneVerified = !!profile.phoneVerified;
  if (completion < 0.8 || !emailVerified || !phoneVerified) {
    nudges.push({
      nudgeId: 'NUDGE#PROFILE',
      message: 'Complete your profile now to speed up booking',
      reason: 'PROFILE_INCOMPLETE',
    });
  }

  const activityList = recent.map((it) => ({
    activityTime: it.activityTime,
    activityType: it.activityType,
    channel: it.channel,
    amount: it.amount,
    recipientId: it.recipientId,
    searchQuery: it.searchQuery,
  }));

  return json(200, correlationId, {
    data: { user, fraudStatus, offers, nudges, recentActivity: activityList },
  });
}

/**
 * GET /user/profile-completeness
 *
 * Return profile completeness percent, missing fields, and a personalized
 * nudge text. The nudge text is generated via the engine router (L2 LLM when
 * available, templated fallback when not).
 *
 * A PROFILE_COMPLETENESS decision row is written each time so the admin
 * metrics endpoint can account for this call type.
 */
async function profileCompletenessEndpoint(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const { percent, missingFields } = profileCompleteness({ profile });

  const completion = Number(profile.profileCompletion || 0);
  const emailVerified = !!profile.emailVerified;
  const phoneVerified = !!profile.phoneVerified;

  // Build an L1 draft via scoreNudge so the router decides whether to call LLM.
  const l1Draft = scoreNudge({ profileCompletion: completion, emailVerified, phoneVerified });
  const final = await engineRoute(l1Draft, { userId, category: 'PROFILE', missingFields });

  const nudgeText =
    final.generatedText || 'Complete your profile to unlock faster booking and exclusive rewards';

  const decRow = decision(
    userId,
    'PROFILE_COMPLETENESS',
    final.score,
    final.riskLevel,
    final.action,
    final.reasonCode,
    final.reasonText,
    'PROFILE',
    correlationId,
    final
  );
  await putDecision(decRow);

  return json(200, correlationId, {
    data: { userId, percent, missingFields, nudgeText },
  });
}

/**
 * POST /transactions/mfa/verify
 *
 * Completes a pending transfer MFA challenge. On valid OTP:
 *   - executes the pending transfer
 *   - writes a FRAUD_TRANSFER ALLOW decision
 *   - marks the challenge row as MFA_VERIFIED
 *   - returns { action: "ALLOW", transferId, completedAt, mfaPath }
 */
async function transferMfaVerify(event, correlationId) {
  const body = parseBody(event);
  const challengeId = requireField(body, 'challengeId');
  const otp = requireField(body, 'otp');

  const row = await getSession(challengeId);
  const now = nowSec();

  if (
    !row ||
    row.recordType !== 'MFA_CHALLENGE' ||
    row.challengeType !== 'TRANSFER' ||
    row.expiresAt <= now
  ) {
    return err(
      400,
      correlationId,
      'MFA_CHALLENGE_INVALID',
      'Transfer MFA challenge not found, expired, or already consumed'
    );
  }

  const userId = row.userId;
  const profile = await getUserById(userId);
  const path = evaluateMfaCode(otp, profile);

  if (!path) {
    await putDecision(
      decision(
        userId,
        'MFA_EVENT',
        0.0,
        'LOW',
        'BLOCK',
        'OTP_INVALID',
        'Transfer MFA code invalid',
        'EARN_REDEEM',
        correlationId
      )
    );
    return err(401, correlationId, 'OTP_INVALID', 'OTP invalid');
  }

  // Mark the challenge row consumed before executing so a replay gets INVALID.
  await putSession({
    ...row,
    recordType: 'MFA_VERIFIED',
    verifiedAt: now,
  });

  const pending = row.pendingTransfer;
  const transferId = `XFER#${randomUUID().slice(0, 8)}`;
  const recipientProfile = await getUserById(pending.recipientId);
  if (!recipientProfile) {
    return err(404, correlationId, 'USER_NOT_FOUND', 'Recipient no longer found');
  }

  await putActivity(
    activityTransfer(pending.userId, now, pending.amount, pending.recipientId, 'APP', correlationId)
  );

  await putDecision(
    decision(
      userId,
      'FRAUD_TRANSFER',
      0.0,
      'LOW',
      'ALLOW',
      path === 'TOTP' ? 'TOTP_VALID' : 'STATIC_OTP_VALID',
      `Transfer MFA verified via ${path}`,
      'EARN_REDEEM',
      correlationId,
      { mfaPath: 'TRANSFER_RISK' }
    )
  );

  return json(200, correlationId, {
    data: {
      action: 'ALLOW',
      transferId,
      completedAt: now,
      mfaPath: 'TRANSFER_RISK',
    },
  });
}

/**
 * GET /customer/surface-eligibility
 *
 * Returns state-aware surface evaluation for all known surfaces. Each surface
 * carries state (SHOWN | HIDDEN | PENDING | COMPLETED), the triggering ruleId,
 * a human-readable reason, raw context inputs, copy (null when not SHOWN), and
 * a nextAction the DemoPanel can use to flip state live.
 *
 * Query params:
 *   userId  - required
 *   aiMode  - "on" (default) or "off". When "on", each surface gets AI verdict
 *             fields (aiAction, aiPriority, aiRationale) from L2 LLM. When "off"
 *             returns deterministic output only.
 *
 * Surface IDs:
 *   PROPERTY_PRESTIGE_ADVANCE  - booking card on property detail page
 *   RESULTS_PRESTIGE_ADVANCE   - inline card on results listing
 *   PROFILE_CATALYST_ELEVATE   - profile completeness card on profile page
 *   MFA_ENROLLMENT_NUDGE       - MFA onboarding nudge for Gold/Platinum users
 *   TRANSFER_ABANDON_OFFER     - 2x points offer on abandoned transfer
 *   BOOKING_CONFIRMATION_OFFER - post-booking upsell
 */
async function surfaceEligibility(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);

  // ?aiMode=on|off  (default on; query param is optional)
  const aiModeParam = qparam(event, 'aiMode', 'on');
  const aiMode = aiModeParam !== 'off';

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const state = (await getState(userId)) || {};
  const now = nowSec();

  const surfaces = evaluateSurfaces({ profile, state, nowSec: now });

  if (!aiMode) {
    return json(200, correlationId, { data: { userId, surfaces } });
  }

  // Fetch recent signals for LLM context (last 10 activity rows)
  const signals = await recentActivity(userId, 10);

  const verdicts = await aiPrioritize(surfaces, profile, signals, now, userId);

  if (!verdicts) {
    // LLM unavailable or timed out - return deterministic result with flag
    return json(200, correlationId, {
      data: { userId, surfaces, aiUnavailable: true },
    });
  }

  // Merge AI verdict fields onto each surface (original state fields untouched)
  const verdictMap = new Map(verdicts.map((v) => [v.surfaceId, v]));
  const surfacesWithAi = surfaces.map((s) => {
    const v = verdictMap.get(s.surfaceId);
    if (!v) return s;
    return {
      ...s,
      aiAction: v.aiAction,
      aiPriority: v.aiPriority,
      aiRationale: v.aiRationale,
    };
  });

  return json(200, correlationId, {
    data: { userId, surfaces: surfacesWithAi, aiMode: true },
  });
}

/**
 * POST /customer/transfers/draft
 *
 * Persists a transfer draft to UserState so the TRANSFER_ABANDON_OFFER surface
 * can fire. Called with debounce from the transfer form when the user changes
 * the amount or recipientId fields without submitting.
 *
 * Body: { userId, amount, recipientId }
 *
 * To clear the draft (after a successful submit), pass amount=0.
 */
async function transferDraft(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);

  const amount = Number(body.amount);
  const recipientId = body.recipientId || '';
  const now = nowSec();

  if (amount === 0) {
    // Clear draft after successful transfer
    await clearTransferDraft(userId, now);
    return json(200, correlationId, { data: { status: 'CLEARED' } });
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'amount must be >= 0');
  }

  await setTransferDraft(userId, amount, recipientId, now);
  return json(200, correlationId, { data: { status: 'SAVED', lastUpdatedAt: now } });
}

/**
 * PUT /customer/profile
 *
 * Updates customer-editable profile fields and recomputes profileCompletion.
 * When profileCompletion crosses 90 the surface evaluator will show
 * PROFILE_CATALYST_ELEVATE as COMPLETED.
 *
 * Body: { userId, mobilePhone?, email?, marketingOptIn?, dob?, language? }
 */
async function updateProfile(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const now = nowSec();
  const fields = {
    mobilePhone: body.mobilePhone,
    email: body.email,
    marketingOptIn: body.marketingOptIn,
    dob: body.dob,
    language: body.language,
  };

  // Strip undefined so we don't overwrite with undefined
  for (const k of Object.keys(fields)) {
    if (fields[k] === undefined) delete fields[k];
  }

  const { profileCompletion } = await updateCustomerProfile(userId, fields, profile, now);

  return json(200, correlationId, {
    data: {
      status: 'UPDATED',
      profileCompletion,
      crossed90: profileCompletion >= 90 && Number(profile.profileCompletion || 0) < 90,
    },
  });
}

/**
 * POST /customer/bookings
 *
 * Records a booking action to UserState so BOOKING_CONFIRMATION_OFFER fires.
 * Writes a UserActivity row for audit.
 *
 * Body: { userId, propertyId, nights, costSfc }
 */
async function createBooking(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);
  const propertyId = requireField(body, 'propertyId');
  const nights = Number(body.nights || 1);
  const costSfc = Number(body.costSfc || 0);

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const now = nowSec();
  const bookingId = `BKG#${randomUUID().slice(0, 8)}`;

  await setRecentBooking(userId, propertyId, nights, now);
  await putActivity({
    userId,
    activityTime: now,
    activityType: 'BOOKING',
    channel: 'APP',
    source: 'UI',
    amount: costSfc,
    currency: 'SFC',
    recipientId: '',
    searchQuery: '',
    metadata: `bookingId=${bookingId},propertyId=${propertyId},nights=${nights}`,
    correlationId: correlationId || '',
    ttl: now + 30 * 86400,
    createdAt: now,
  });

  return json(200, correlationId, {
    data: {
      status: 'CONFIRMED',
      bookingId,
      propertyId,
      nights,
      bookedAt: now,
    },
  });
}

/**
 * GET /customer/properties/:propertyId/availability
 *
 * Deterministic availability check. Always returns available=true unless the
 * propertyId is in FULLY_BOOKED_PROPERTY_IDS (demo-only override).
 * Pricing: 1250 SFC per night.
 */
async function checkPropertyAvailability(event, correlationId, propertyId) {
  // Require any valid bearer; empty string skips userId match.
  await requireBearer(event, '');

  const checkIn = qparam(event, 'checkIn', '');
  const checkOut = qparam(event, 'checkOut', '');
  const adults = Number(qparam(event, 'adults', '1'));
  const children = Number(qparam(event, 'children', '0'));

  if (FULLY_BOOKED_PROPERTY_IDS.has(propertyId)) {
    return json(200, correlationId, {
      available: false,
      propertyId,
      reason: 'FULLY_BOOKED',
    });
  }

  // Derive nights from dates when both provided; otherwise default to 1.
  let nights = 1;
  if (checkIn && checkOut) {
    const msPerDay = 86400000;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (Number.isFinite(diff) && diff > 0) nights = Math.round(diff / msPerDay);
  }

  const pricePerNight = 1250;
  const totalSfc = pricePerNight * nights;

  return json(200, correlationId, {
    available: true,
    propertyId,
    checkIn,
    checkOut,
    adults,
    children,
    nights,
    pricePerNight,
    totalSfc,
    currency: 'SFC',
  });
}

/**
 * GET /customer/properties/:propertyId/personalized-offer?userId=
 *
 * Returns an AI-composed personalized offer for the given user + property
 * combination. Returns offer:null when the LLM is unavailable or the budget
 * is exhausted.
 */
async function getPropertyPersonalizedOffer(event, correlationId, propertyId) {
  const userId = qparam(event, 'userId', '');
  if (!userId) return err(400, correlationId, 'VALIDATION_ERROR', 'userId is required');
  await requireBearer(event, userId);

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'NOT_FOUND', 'User not found');

  const state = await getState(userId);
  const st = state || {};
  const dwellMs = Number(st.propertyDwellMs || 0);
  const propertyName = qparam(event, 'propertyName', propertyId);
  const pricePerNight = 1250;

  const offer = await aiComposeOffer({
    userId,
    profile,
    state: st,
    propertyId,
    propertyName,
    pricePerNight,
    dwellMs,
  });

  return json(200, correlationId, { data: { offer: offer || null } });
}

module.exports = {
  transfer,
  transferMfaVerify,
  getOffers,
  offerAction,
  getNudges,
  nudgeAction,
  getProfile,
  dashboard,
  profileCompletenessEndpoint,
  surfaceEligibility,
  transferDraft,
  updateProfile,
  createBooking,
  checkPropertyAvailability,
  getPropertyPersonalizedOffer,
};
