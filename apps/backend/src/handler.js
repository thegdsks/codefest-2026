const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomBytes, randomUUID } = require('node:crypto');

const { scoreLogin } = require('./rules/login');
const { scoreTransfer } = require('./rules/transfer');
const { scoreOffer } = require('./rules/offers');
const { scoreNudge } = require('./rules/nudges');
const { profileCompleteness } = require('./rules/profile');
const { route: engineRoute } = require('./engine/router');
const { getStats: getBudgetStats } = require('./engine/budget');
const admin = require('./admin');

// Read version once at module load.
const PACKAGE_VERSION = require('../package.json').version;

let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// test-only seam; not part of the public API
function _setDdb(client) {
  ddb = client;
}

const CFG = {
  clientId: process.env.CLIENT_ID || 'demoClient',
  clientSecret: process.env.CLIENT_SECRET || 'demoSecret',
  mfaOtp: process.env.MFA_OTP || '123456',
  // 'totp' (default) accepts only valid TOTP codes from an authenticator app.
  // 'static' additionally accepts the legacy demo OTP, for the judges-have-
  // no-phone fallback. 'static-only' rejects TOTP entirely (legacy demo mode).
  mfaMode: process.env.MFA_MODE || 'totp',
  sessionTtlSec: Number(process.env.SESSION_TTL_SEC || 1800),

  tUserProfile: process.env.TABLE_USER_PROFILE || 'UserProfile',
  tUserSession: process.env.TABLE_USER_SESSION || 'UserSession',
  tUserActivity: process.env.TABLE_USER_ACTIVITY || 'UserActivity',
  tDecision: process.env.TABLE_DECISION_STORE || 'DecisionStore',
  tUserState: process.env.TABLE_USER_STATE || 'UserState',
};

const totp = require('./lib/totp');

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify({ correlationId: correlationId || '', ...payload }),
  };
}

function err(statusCode, correlationId, code, message) {
  return json(statusCode, correlationId, { error: { code, message } });
}

function getHeader(headers, name) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function basicAuthOk(event) {
  const auth = getHeader(event.headers, 'authorization');
  if (!auth || !auth.startsWith('Basic ')) return false;
  const b64 = auth.substring('Basic '.length).trim();
  let decoded;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch (_e) {
    return false;
  }
  const [id, secret] = decoded.split(':');
  return id === CFG.clientId && secret === CFG.clientSecret;
}

function parseBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid JSON body' };
  }
}

function requireField(obj, field) {
  if (!obj || obj[field] === undefined || obj[field] === null || `${obj[field]}`.trim() === '') {
    throw { status: 400, code: 'VALIDATION_ERROR', message: `Missing required field: ${field}` };
  }
  return obj[field];
}

function qparam(event, key) {
  const v = event.queryStringParameters && event.queryStringParameters[key];
  if (!v || `${v}`.trim() === '')
    throw { status: 400, code: 'VALIDATION_ERROR', message: `Missing query parameter: ${key}` };
  return v;
}

async function getUserById(userId) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserProfile, Key: { userId } }));
  return r.Item || null;
}

async function findUserByUsername(username) {
  // Query the username-index GSI. The previous Scan + Limit:1 was buggy:
  // DynamoDB applies Limit before FilterExpression, so it read one arbitrary
  // row and then filtered, returning null whenever that row was not the user.
  const r = await ddb.send(
    new QueryCommand({
      TableName: CFG.tUserProfile,
      IndexName: 'username-index',
      KeyConditionExpression: '#u = :u',
      ExpressionAttributeNames: { '#u': 'username' },
      ExpressionAttributeValues: { ':u': username },
      Limit: 1,
    })
  );
  return r.Items?.[0] ?? null;
}

async function getState(userId) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserState, Key: { userId } }));
  return r.Item || null;
}

async function upsertLoginState(userId, loginTime, location, success) {
  // DynamoDB rejects ExpressionAttributeNames/Values keys that the
  // UpdateExpression does not reference, so build them per branch.
  const updateExpression = success ? 'SET #llt=:llt, #lll=:lll, #u=:u' : 'SET #lflt=:lflt, #u=:u';
  const exprNames = success
    ? { '#llt': 'lastLoginTime', '#lll': 'lastLoginLocation', '#u': 'updatedAt' }
    : { '#lflt': 'lastFailedLoginTime', '#u': 'updatedAt' };
  const exprValues = success
    ? { ':llt': loginTime, ':lll': location, ':u': nowSec() }
    : { ':lflt': loginTime, ':u': nowSec() };

  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );
}

async function incrementTransferCounters(userId, nowTs) {
  const st = await getState(userId);
  const lastTransferTime = st && st.lastTransferTime ? st.lastTransferTime : 0;
  const reset1h = lastTransferTime && nowTs - lastTransferTime > 3600;

  // DynamoDB rejects ExpressionAttributeNames/Values keys that the
  // UpdateExpression does not reference, so build them per branch.
  const updateExpression = reset1h
    ? 'SET #tc1=:reset, #ltt=:now, #u=:u ADD #tc24 :one'
    : 'ADD #tc1 :one, #tc24 :one SET #ltt=:now, #u=:u';
  const exprNames = {
    '#tc1': 'transferCount1h',
    '#tc24': 'transferCount24h',
    '#ltt': 'lastTransferTime',
    '#u': 'updatedAt',
  };
  const exprValues = reset1h
    ? { ':reset': 1, ':one': 1, ':now': nowTs, ':u': nowSec() }
    : { ':one': 1, ':now': nowTs, ':u': nowSec() };

  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
    })
  );
}

async function updateLastTransferRecipient(userId, recipientId) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId },
      UpdateExpression: 'SET lastTransferRecipient = :r',
      ExpressionAttributeValues: { ':r': recipientId },
    })
  );
}

async function bumpOfferShown(userId, cooldownUntil) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId },
      UpdateExpression: 'ADD offerShownCount :one SET offerCooldownUntil = :cd',
      ExpressionAttributeValues: { ':one': 1, ':cd': cooldownUntil },
    })
  );
}

async function bumpNudgeShown(userId, nowTs) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId },
      UpdateExpression: 'ADD nudgeShownCount :one SET lastNudgeTime = :t',
      ExpressionAttributeValues: { ':one': 1, ':t': nowTs },
    })
  );
}

async function putSession(item) {
  await ddb.send(new PutCommand({ TableName: CFG.tUserSession, Item: item }));
}

async function getSession(sessionId) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserSession, Key: { sessionId } }));
  return r.Item || null;
}

/**
 * Generate an opaque bearer token (32 random bytes, base64url-encoded) and
 * persist a UserSession "access" row keyed by the token itself. The token
 * IS the row's sessionId, which gives O(1) lookup during bearer validation
 * without needing a token-index GSI.
 *
 * Access rows carry recordType=ACCESS to keep them distinct from the
 * existing MFA-challenge rows written during /auth/login.
 */
async function issueAccessToken({
  userId,
  mfaVerified,
  correlationId,
  location,
  ipAddress,
  deviceId,
}) {
  const token = randomBytes(32).toString('base64url');
  const now = nowSec();
  const expiresAt = now + CFG.sessionTtlSec;
  const item = {
    sessionId: token,
    recordType: 'ACCESS',
    userId,
    token,
    issuedAt: now,
    expiresAt,
    lastActivityAt: now,
    mfaVerified: !!mfaVerified,
    location: location || '',
    ipAddress: ipAddress || '',
    deviceId: deviceId || '',
    correlationId: correlationId || '',
  };
  await putSession(item);
  return { token, issuedAt: now, expiresAt };
}

/**
 * Validate an `Authorization: Bearer <token>` header against UserSession.
 *
 * On success, slides the row's expiresAt forward by SESSION_TTL_SEC from
 * now and bumps lastActivityAt. Returns the resolved principal so callers
 * can compare the request's userId against the token's userId.
 *
 * Throws a status-bearing error object that exports.main translates to a
 * JSON error response. Codes:
 *   UNAUTHORIZED    - missing / non-Bearer Authorization header
 *   INVALID_TOKEN   - token not present in UserSession (or wrong row type)
 *   TOKEN_EXPIRED   - row found but expiresAt <= now
 */
async function validateBearer(event) {
  const auth = getHeader(event.headers, 'authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Missing bearer token' };
  }
  const token = auth.substring('Bearer '.length).trim();
  if (!token) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Empty bearer token' };
  }

  const row = await getSession(token);
  if (!row || row.recordType !== 'ACCESS' || row.token !== token) {
    throw { status: 401, code: 'INVALID_TOKEN', message: 'Token not recognized' };
  }

  const now = nowSec();
  if (typeof row.expiresAt !== 'number' || row.expiresAt <= now) {
    throw { status: 401, code: 'TOKEN_EXPIRED', message: 'Token expired' };
  }

  const newExpiresAt = now + CFG.sessionTtlSec;
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserSession,
      Key: { sessionId: token },
      UpdateExpression: 'SET lastActivityAt = :now, expiresAt = :exp',
      ExpressionAttributeValues: { ':now': now, ':exp': newExpiresAt },
    })
  );

  return {
    userId: row.userId,
    sessionId: token,
    token,
    mfaVerified: !!row.mfaVerified,
    issuedAt: row.issuedAt,
    expiresAt: newExpiresAt,
    lastActivityAt: now,
  };
}

/**
 * Validate the bearer token and assert the request's userId matches.
 * Throws a status-bearing error so exports.main converts it to JSON.
 */
async function requireBearer(event, expectedUserId) {
  const principal = await validateBearer(event);
  if (expectedUserId && principal.userId !== expectedUserId) {
    throw {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Token does not match userId in request',
    };
  }
  return principal;
}

/**
 * Delete an access-token row, idempotently. Used by /auth/logout.
 */
async function revokeAccessToken(token) {
  await ddb.send(
    new DeleteCommand({
      TableName: CFG.tUserSession,
      Key: { sessionId: token },
    })
  );
}

async function putActivity(item) {
  await ddb.send(new PutCommand({ TableName: CFG.tUserActivity, Item: item }));
}

async function recentActivity(userId, limit = 10) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: CFG.tUserActivity,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return r.Items || [];
}

async function putDecision(item) {
  await ddb.send(new PutCommand({ TableName: CFG.tDecision, Item: item }));
}

function activityLogin(userId, ts, location, ip, deviceId, correlationId) {
  return {
    userId,
    activityTime: ts,
    activityType: 'LOGIN',
    channel: 'AUTH',
    source: 'UI',
    amount: 0,
    currency: '',
    recipientId: '',
    searchQuery: '',
    metadata: `location=${location},ip=${ip},deviceId=${deviceId}`,
    correlationId: correlationId || '',
    ttl: ts + 7 * 86400,
    createdAt: ts,
  };
}

function activityTransfer(userId, ts, amount, recipientId, channel, correlationId) {
  return {
    userId,
    activityTime: ts,
    activityType: 'TRANSFER',
    channel,
    source: 'SERVICE',
    amount,
    currency: 'POINTS',
    recipientId,
    searchQuery: '',
    metadata: 'transfer',
    correlationId: correlationId || '',
    ttl: ts + 7 * 86400,
    createdAt: ts,
  };
}

function activityOfferAction(userId, ts, offerId, action, correlationId) {
  return {
    userId,
    activityTime: ts,
    activityType: `OFFER_${action.toUpperCase()}`,
    channel: 'OFFERS',
    source: 'UI',
    amount: 0,
    currency: '',
    recipientId: '',
    searchQuery: '',
    metadata: `offerId=${offerId}`,
    correlationId: correlationId || '',
    ttl: ts + 30 * 86400,
    createdAt: ts,
  };
}

function activityNudgeAction(userId, ts, nudgeId, action, correlationId) {
  return {
    userId,
    activityTime: ts,
    activityType: `NUDGE_${action.toUpperCase()}`,
    channel: 'PROFILE',
    source: 'UI',
    amount: 0,
    currency: '',
    recipientId: '',
    searchQuery: '',
    metadata: `nudgeId=${nudgeId}`,
    correlationId: correlationId || '',
    ttl: ts + 30 * 86400,
    createdAt: ts,
  };
}

function decision(
  userId,
  decisionType,
  score,
  riskLevel,
  action,
  reason,
  explanation,
  channel,
  correlationId,
  engineMeta
) {
  const base = {
    decisionId: `DEC#${Date.now()}`,
    userId,
    decisionType,
    score,
    riskLevel,
    modelVersion: 'v1',
    action,
    reason,
    explanation,
    channel,
    correlationId: correlationId || '',
    isFinalDecision: true,
    timestamp: nowSec(),
    engineLayer: (engineMeta && engineMeta.engineLayer) || 'L1',
  };
  if (engineMeta && typeof engineMeta.llmLatencyMs === 'number') {
    base.llmLatencyMs = engineMeta.llmLatencyMs;
  }
  if (engineMeta && engineMeta.llmModel) {
    base.llmModel = engineMeta.llmModel;
  }
  return base;
}

// ---------------------------------------------------------------------------
// GET /health  (unauthenticated pre-flight check)
// ---------------------------------------------------------------------------

function healthEndpoint() {
  const stats = getBudgetStats();
  const body = {
    status: 'ok',
    version: PACKAGE_VERSION,
    commit: process.env.GIT_COMMIT_SHA || 'unknown',
    engineLayer: {
      breakerOpen: stats.breakerOpen,
      callsInWindow: stats.callsInWindow,
      maxCalls: stats.maxCalls,
    },
    asOf: Date.now(),
  };
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify(body),
  };
}

async function route(event, correlationId) {
  const method =
    (event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
    event.httpMethod;
  const path =
    (event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
    event.path;

  // normalize: strip stage prefix for REST API (if any)
  const p = path || '/';

  if (method === 'POST' && p === '/auth/login') return login(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/verify') return mfaVerify(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/enroll') return mfaEnroll(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/confirm-enroll')
    return mfaConfirmEnroll(event, correlationId);
  if (method === 'POST' && p === '/auth/mfa/recover') return mfaRecover(event, correlationId);
  if (method === 'POST' && p === '/auth/logout') return logout(event, correlationId);
  if (method === 'GET' && p === '/auth/session') return sessionInfo(event, correlationId);
  if (method === 'POST' && p === '/transactions/transfer') return transfer(event, correlationId);
  if (method === 'GET' && p === '/offers') return getOffers(event, correlationId);
  if (method === 'POST' && p === '/offers/action') return offerAction(event, correlationId);
  if (method === 'GET' && p === '/nudges') return getNudges(event, correlationId);
  if (method === 'POST' && p === '/nudges/action') return nudgeAction(event, correlationId);
  if (method === 'GET' && p === '/user/profile') return getProfile(event, correlationId);
  if (method === 'GET' && p === '/user/profile-completeness')
    return profileCompletenessEndpoint(event, correlationId);
  if (method === 'GET' && p === '/dashboard') return dashboard(event, correlationId);
  if (method === 'GET' && p === '/admin/decisions') return admin.getDecisions(event, correlationId);
  if (method === 'GET' && p === '/admin/decisions/export')
    return admin.exportDecisions(event, correlationId);
  if (method === 'GET' && p === '/admin/metrics') return admin.getMetrics(event, correlationId);
  if (method === 'POST' && p.match(/^\/admin\/decisions\/[^/]+\/release$/))
    return admin.releaseDecision(event, correlationId);
  if (method === 'GET' && p.match(/^\/admin\/decisions\/[^/]+$/) && p !== '/admin/decisions/export')
    return admin.getDecisionById(event, correlationId);
  if (method === 'GET' && p === '/admin/users') return admin.getUsers(event, correlationId);
  if (method === 'GET' && p === '/admin/sessions') return admin.getSessions(event, correlationId);
  if (method === 'GET' && p === '/admin/mfa-status')
    return admin.getMfaStatus(event, correlationId);
  if (method === 'POST' && p.match(/^\/admin\/sessions\/[^/]+\/revoke$/))
    return admin.revokeSession(event, correlationId);

  return err(404, correlationId, 'NOT_FOUND', `Unknown endpoint: ${method} ${p}`);
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
  const lastLoc = st ? st.lastLoginLocation : null;
  const lastTime = st ? st.lastLoginTime : null;

  const l1Draft = scoreLogin({ lastLocation: lastLoc, lastTime, currentLocation: location, now });
  const final = await engineRoute(l1Draft, {
    userId,
    category: 'AUTH',
    payload: { currentLocation: location },
  });

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

  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression:
        'SET pendingMfaSecret = :s, pendingRecoveryHashes = :h, pendingMfaCreatedAt = :t',
      ExpressionAttributeValues: {
        ':s': secret,
        ':h': recoveryHashes,
        ':t': nowSec(),
      },
    })
  );

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

  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression:
        'SET mfaSecret = :s, mfaRecoveryHashes = :h, mfaEnabled = :e ' +
        'REMOVE pendingMfaSecret, pendingRecoveryHashes, pendingMfaCreatedAt',
      ExpressionAttributeValues: {
        ':s': pending,
        ':h': profile.pendingRecoveryHashes || [],
        ':e': true,
      },
    })
  );

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
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression: 'SET mfaRecoveryHashes = :h, mfaEnabled = :e REMOVE mfaSecret',
      ExpressionAttributeValues: {
        ':h': remaining,
        ':e': false,
      },
    })
  );

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

async function transfer(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
  await requireBearer(event, userId);
  const recipientId = requireField(body, 'recipientId');
  const amount = Number(requireField(body, 'amount'));
  const channel = body.channel || 'APP';

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

  const l1Draft = scoreTransfer({ tc1h });
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

// ---------------------------------------------------------------------------
// GET /user/profile-completeness  (T8)
// ---------------------------------------------------------------------------

/**
 * Return profile completeness percent, missing fields, and a personalized
 * nudge text. The nudge text is generated via the engine router (L2 LLM when
 * available, templated fallback when not).
 *
 * A PROFILE_COMPLETENESS decision row is written each time so the admin
 * metrics endpoint can account for this call type.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {Promise<object>}
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

exports._setDdb = _setDdb;
// Exported for unit tests; not part of the HTTP-facing public API.
exports._validateBearer = validateBearer;

/**
 * Routes authenticated via a per-user bearer token. For these, exports.main
 * skips the handler-level Basic Auth gate; the route itself calls
 * validateBearer/requireBearer and verifies the userId match.
 *
 * Auth handshake routes (/auth/login, /auth/mfa/verify), admin, and any
 * unknown path keep the Basic Auth client-id check.
 */
const BEARER_ROUTES = [
  ['POST', '/transactions/transfer'],
  ['GET', '/user/profile'],
  ['GET', '/user/profile-completeness'],
  ['GET', '/offers'],
  ['POST', '/offers/action'],
  ['GET', '/nudges'],
  ['POST', '/nudges/action'],
  ['GET', '/dashboard'],
  ['POST', '/auth/logout'],
  ['GET', '/auth/session'],
  ['POST', '/auth/mfa/enroll'],
  ['POST', '/auth/mfa/confirm-enroll'],
];

function isBearerRoute(method, path) {
  for (const [m, p] of BEARER_ROUTES) {
    if (m === method && p === path) return true;
  }
  return false;
}

exports.main = async (event) => {
  const correlationId = getHeader(event.headers, 'x-correlation-id') || '';

  try {
    const method =
      (event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
      event.httpMethod;
    const rawP =
      (event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
      event.path ||
      '/';

    // /health is intentionally unauthenticated.
    if (method === 'GET' && rawP === '/health') return healthEndpoint();

    // Bearer routes carry their own auth via validateBearer in the route
    // handler. Skip the handler-level Basic Auth gate so a client that
    // already has a bearer doesn't need to also present Basic credentials.
    if (!isBearerRoute(method, rawP)) {
      if (!basicAuthOk(event)) {
        return err(401, correlationId, 'UNAUTHORIZED_CLIENT', 'Missing/invalid Basic Auth');
      }
    }

    return await route(event, correlationId);
  } catch (e) {
    if (e && e.status) return err(e.status, correlationId, e.code || 'ERROR', e.message || 'Error');
    console.error(e);
    return err(500, correlationId, 'INTERNAL_ERROR', 'Unexpected server error');
  }
};
