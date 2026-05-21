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
        final
      )
    );
    return err(403, correlationId, 'TRANSFER_BLOCKED', 'Transfer blocked due to high fraud risk');
  }

  if (final.action === 'MFA') {
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
      final
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
        final
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
};
