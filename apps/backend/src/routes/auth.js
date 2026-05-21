'use strict';

const { randomUUID } = require('node:crypto');

const { CFG } = require('../lib/config');
const { nowSec, json, err, parseBody, requireField } = require('../lib/http');
const {
  getUserById,
  findUserByUsername,
  getState,
  upsertLoginState,
  getSession,
  putSession,
  putActivity,
  putDecision,
  issueAccessToken,
  validateBearer,
  revokeAccessToken,
  startMfaEnroll,
  confirmMfaEnroll,
  clearMfaSecret,
} = require('../lib/ddb');
const { activityLogin, decision } = require('../lib/activity');
const { scoreLogin } = require('../rules/login');
const { route: engineRoute } = require('../engine/router');
const totp = require('../lib/totp');

/**
 * Try to validate a code against the user's mfaSecret using TOTP. Falls
 * back to the static demo OTP when MFA_MODE is `static` (judges-without-
 * a-phone backup) and the user has no enrolled secret. Returns a string
 * tag identifying the path that accepted (or null on rejection):
 *   TOTP    valid current TOTP code
 *   STATIC  matched the env-configured static OTP
 *   null    rejected
 */
function evaluateMfaCode(code, profile) {
  const secret = profile && profile.mfaSecret;
  if (secret && totp.verifyTotpCode(code, secret)) return 'TOTP';

  const staticAllowed = CFG.mfaMode === 'static' || CFG.mfaMode === 'static-only';
  if (staticAllowed && String(code).trim() === String(CFG.mfaOtp)) return 'STATIC';

  return null;
}

async function login(event, correlationId) {
  const body = parseBody(event);
  const username = requireField(body, 'username');
  const password = requireField(body, 'password');
  const location = requireField(body, 'location');
  const deviceId = requireField(body, 'deviceId');
  const ip = body && body.ipAddress ? body.ipAddress : '';
  const deviceType = body && body.deviceType ? body.deviceType : '';
  const browser = body && body.browser ? body.browser : '';
  // forceMfa: optional boolean, only honored when DEMO_MODE=1
  const forceMfa = body && body.forceMfa === true && CFG.demoMode;

  const profile = await findUserByUsername(username);
  if (!profile || profile.passwordHash !== password) {
    if (profile && profile.userId)
      await upsertLoginState(profile.userId, nowSec(), location, false);
    return err(401, correlationId, 'INVALID_CREDENTIALS', 'Invalid username/password');
  }

  const userId = profile.userId;
  const st = await getState(userId);
  if (st && st.isBlocked)
    return err(
      403,
      correlationId,
      'ACCOUNT_BLOCKED',
      'Access denied. Account temporarily blocked.'
    );

  const now = nowSec();

  const sessionId = `SESSION#${randomUUID().slice(0, 8)}`;
  await putSession({
    sessionId,
    userId,
    loginTime: now,
    logoutTime: 0,
    location,
    ipAddress: ip,
    deviceId,
    deviceType,
    browser,
    isSuccessful: true,
    createdAt: now,
  });
  await putActivity(activityLogin(userId, now, location, ip, deviceId, correlationId));

  // Demo shortcut: bypass the fraud engine and force an MFA challenge.
  if (forceMfa) {
    await putDecision(
      decision(
        userId,
        'FRAUD_LOGIN',
        0,
        'LOW',
        'MFA',
        'DEMO_FORCED_MFA',
        'MFA challenge forced via demo flag',
        'AUTH',
        correlationId,
        {}
      )
    );
    await upsertLoginState(userId, now, location, true);
    return json(200, correlationId, {
      data: {
        status: 'MFA_REQUIRED',
        reason: 'DEMO_FORCED_MFA',
        sessionId,
        mfaPath: 'DEMO_FORCED',
        mfa: { type: 'OTP', expiresInSeconds: 300 },
      },
    });
  }

  const lastLoc = st ? st.lastLoginLocation : null;
  const lastTime = st ? st.lastLoginTime : null;

  const l1Draft = scoreLogin({ lastLocation: lastLoc, lastTime, currentLocation: location, now });
  const final = await engineRoute(l1Draft, {
    userId,
    category: 'AUTH',
    payload: { currentLocation: location },
  });

  if (final.action === 'BLOCK') {
    await putDecision(
      decision(
        userId,
        'FRAUD_LOGIN',
        final.score,
        final.riskLevel,
        'BLOCK',
        final.reasonCode,
        final.reasonText,
        'AUTH',
        correlationId,
        final
      )
    );
    return err(
      403,
      correlationId,
      'ACCOUNT_BLOCKED',
      'Access denied. Account temporarily blocked.'
    );
  }

  if (final.action === 'MFA') {
    await putDecision(
      decision(
        userId,
        'FRAUD_LOGIN',
        final.score,
        final.riskLevel,
        'MFA',
        final.reasonCode,
        final.reasonText,
        'AUTH',
        correlationId,
        final
      )
    );
    await upsertLoginState(userId, now, location, true);
    return json(200, correlationId, {
      data: {
        status: 'MFA_REQUIRED',
        reason: final.reasonCode,
        sessionId,
        mfa: { type: 'OTP', expiresInSeconds: 300 },
      },
    });
  }

  await putDecision(
    decision(
      userId,
      'FRAUD_LOGIN',
      final.score,
      final.riskLevel,
      'ALLOW',
      final.reasonCode,
      final.reasonText,
      'AUTH',
      correlationId,
      final
    )
  );
  await upsertLoginState(userId, now, location, true);

  // Auth fully complete (no MFA required). Issue a bearer access token.
  const access = await issueAccessToken({
    userId,
    mfaVerified: false,
    correlationId,
    location,
    ipAddress: ip,
    deviceId,
  });
  return json(200, correlationId, {
    data: {
      status: 'SUCCESS',
      userId,
      sessionId,
      token: access.token,
      expiresAt: access.expiresAt,
    },
  });
}

async function mfaVerify(event, correlationId) {
  const body = parseBody(event);
  const sessionId = requireField(body, 'sessionId');
  const otp = requireField(body, 'otp');

  const session = await getSession(sessionId);
  if (!session) return err(404, correlationId, 'SESSION_NOT_FOUND', 'Session not found');

  const userId = session.userId;
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
        'MFA code invalid',
        'AUTH',
        correlationId
      )
    );
    return err(401, correlationId, 'OTP_INVALID', 'OTP invalid');
  }

  await putDecision(
    decision(
      userId,
      'MFA_EVENT',
      0.0,
      'LOW',
      'ALLOW',
      path === 'TOTP' ? 'TOTP_VALID' : 'STATIC_OTP_VALID',
      `MFA verified via ${path}`,
      'AUTH',
      correlationId
    )
  );

  // MFA gate passed. Issue a bearer access token. The location / device
  // fields come from the prior login-challenge row so the access row
  // carries the same demo context.
  const access = await issueAccessToken({
    userId,
    mfaVerified: true,
    correlationId,
    location: session.location || '',
    ipAddress: session.ipAddress || '',
    deviceId: session.deviceId || '',
  });
  return json(200, correlationId, {
    data: {
      status: 'SUCCESS',
      message: 'MFA verified',
      mfaPath: path,
      token: access.token,
      expiresAt: access.expiresAt,
    },
  });
}

/**
 * POST /auth/mfa/enroll - generate a TOTP secret + QR code + recovery codes
 * for the calling user. Requires a valid bearer (already-logged-in user).
 * The secret is parked in UserProfile.pendingMfaSecret; it does NOT activate
 * MFA on the account until /auth/mfa/confirm-enroll succeeds, so a half-
 * complete enrollment can't lock anyone out.
 */
async function mfaEnroll(event, correlationId) {
  const principal = await validateBearer(event);
  const userId = principal.userId;
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const secret = totp.generateMfaSecret();
  const username = profile.username || userId;
  const otpauthUrl = totp.buildOtpauthUrl(username, secret);
  const qrCodePngBase64 = await totp.generateQrCodePngBase64(otpauthUrl);
  const recoveryCodes = totp.generateRecoveryCodes();
  const recoveryHashes = totp.hashRecoveryCodes(recoveryCodes);

  await startMfaEnroll(userId, secret, recoveryHashes, nowSec());

  await putDecision(
    decision(
      userId,
      'MFA_EVENT',
      0.0,
      'LOW',
      'ALLOW',
      'MFA_ENROLL_STARTED',
      'MFA enrollment started',
      'AUTH',
      correlationId
    )
  );

  return json(200, correlationId, {
    data: {
      otpauthUrl,
      qrCodePngBase64,
      recoveryCodes,
      issuer: process.env.MFA_ISSUER || 'SignalForce',
      username,
    },
  });
}

/**
 * POST /auth/mfa/confirm-enroll - validate a TOTP code generated from the
 * pending secret. On success, promote pendingMfaSecret -> mfaSecret and
 * pendingRecoveryHashes -> mfaRecoveryHashes, set mfaEnabled = true.
 * On failure, leave the pending state in place so the user can retry.
 */
async function mfaConfirmEnroll(event, correlationId) {
  const principal = await validateBearer(event);
  const userId = principal.userId;
  const body = parseBody(event);
  const code = requireField(body, 'code');

  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const pending = profile.pendingMfaSecret;
  if (!pending) {
    return err(
      400,
      correlationId,
      'NO_PENDING_ENROLLMENT',
      'No pending MFA enrollment for this user'
    );
  }

  if (!totp.verifyTotpCode(code, pending)) {
    await putDecision(
      decision(
        userId,
        'MFA_EVENT',
        0.0,
        'LOW',
        'BLOCK',
        'MFA_ENROLL_INVALID_CODE',
        'Confirm-enroll code rejected',
        'AUTH',
        correlationId
      )
    );
    return err(401, correlationId, 'OTP_INVALID', 'Confirmation code invalid');
  }

  await confirmMfaEnroll(userId, pending, profile.pendingRecoveryHashes || []);

  await putDecision(
    decision(
      userId,
      'MFA_EVENT',
      0.0,
      'LOW',
      'ALLOW',
      'MFA_ENROLL_CONFIRMED',
      'MFA enrollment confirmed',
      'AUTH',
      correlationId
    )
  );

  return json(200, correlationId, { data: { status: 'ENROLLED' } });
}

/**
 * POST /auth/mfa/recover - consume a single-use recovery code to reset
 * the user's MFA secret (typically when the phone is lost). On success,
 * removes the consumed hash, clears mfaSecret (so the user must re-enroll),
 * and returns a bearer token so the recovering user can proceed.
 *
 * Authenticated by username + password in the body, NOT by bearer, since
 * the whole point is the user lost access to their second factor.
 */
async function mfaRecover(event, correlationId) {
  const body = parseBody(event);
  const username = requireField(body, 'username');
  const password = requireField(body, 'password');
  const code = requireField(body, 'code');

  const profile = await findUserByUsername(username);
  if (!profile || profile.passwordHash !== password) {
    return err(401, correlationId, 'INVALID_CREDENTIALS', 'Invalid username/password');
  }
  const userId = profile.userId;

  const hashes = profile.mfaRecoveryHashes || [];
  const consumedHash = totp.findRecoveryCodeHash(code, hashes);
  if (!consumedHash) {
    await putDecision(
      decision(
        userId,
        'MFA_EVENT',
        0.0,
        'LOW',
        'BLOCK',
        'MFA_RECOVERY_INVALID',
        'Recovery code rejected',
        'AUTH',
        correlationId
      )
    );
    return err(401, correlationId, 'RECOVERY_CODE_INVALID', 'Recovery code invalid');
  }

  const remaining = hashes.filter((h) => h !== consumedHash);
  await clearMfaSecret(userId, remaining);

  await putDecision(
    decision(
      userId,
      'MFA_EVENT',
      0.0,
      'LOW',
      'ALLOW',
      'MFA_RECOVERY_USED',
      `Recovery code consumed (${remaining.length} remaining)`,
      'AUTH',
      correlationId
    )
  );

  const access = await issueAccessToken({
    userId,
    mfaVerified: false,
    correlationId,
  });
  return json(200, correlationId, {
    data: {
      status: 'RECOVERED',
      token: access.token,
      expiresAt: access.expiresAt,
      recoveryCodesRemaining: remaining.length,
      message: 'MFA disabled. Please re-enroll a new authenticator app.',
    },
  });
}

/**
 * POST /auth/logout - revoke the current bearer token. Idempotent: returns
 * 204 whether the token row existed or not, so a double-click on logout
 * is harmless. Requires a valid bearer (otherwise 401 from validateBearer).
 */
async function logout(event, correlationId) {
  const principal = await validateBearer(event);
  await revokeAccessToken(principal.token);
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'x-correlation-id': correlationId || '',
    },
    body: '',
  };
}

/**
 * GET /auth/session - return metadata about the current bearer's session
 * row. Used by the FE to render the "session expires in 12m" indicator.
 * Calling this slides the expiry forward via validateBearer (same as any
 * other authenticated call) so just polling /auth/session keeps the
 * session alive.
 */
async function sessionInfo(event, correlationId) {
  const principal = await validateBearer(event);
  return json(200, correlationId, {
    data: {
      userId: principal.userId,
      issuedAt: principal.issuedAt,
      expiresAt: principal.expiresAt,
      lastActivityAt: principal.lastActivityAt,
      mfaVerified: principal.mfaVerified,
    },
  });
}

module.exports = {
  login,
  mfaVerify,
  mfaEnroll,
  mfaConfirmEnroll,
  mfaRecover,
  logout,
  sessionInfo,
  evaluateMfaCode,
};
