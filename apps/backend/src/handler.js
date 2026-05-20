const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CFG = {
  clientId: process.env.CLIENT_ID || 'demoClient',
  clientSecret: process.env.CLIENT_SECRET || 'demoSecret',
  mfaOtp: process.env.MFA_OTP || '123456',

  tUserProfile: process.env.TABLE_USER_PROFILE || 'UserProfile',
  tUserSession: process.env.TABLE_USER_SESSION || 'UserSession',
  tUserActivity: process.env.TABLE_USER_ACTIVITY || 'UserActivity',
  tDecision: process.env.TABLE_DECISION_STORE || 'DecisionStore',
  tUserState: process.env.TABLE_USER_STATE || 'UserState',
};

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

  const exprNames = {
    '#tc1': 'transferCount1h',
    '#tc24': 'transferCount24h',
    '#ltt': 'lastTransferTime',
    '#u': 'updatedAt',
  };
  const exprValues = {
    ':one': 1,
    ':now': nowTs,
    ':u': nowSec(),
    ':reset': 1,
  };

  const updateExpression = reset1h
    ? 'SET #tc1=:reset, #ltt=:now, #u=:u ADD #tc24 :one'
    : 'ADD #tc1 :one, #tc24 :one SET #ltt=:now, #u=:u';

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
  correlationId
) {
  return {
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
  if (method === 'POST' && p === '/transactions/transfer') return transfer(event, correlationId);
  if (method === 'GET' && p === '/offers') return getOffers(event, correlationId);
  if (method === 'POST' && p === '/offers/action') return offerAction(event, correlationId);
  if (method === 'GET' && p === '/nudges') return getNudges(event, correlationId);
  if (method === 'POST' && p === '/nudges/action') return nudgeAction(event, correlationId);
  if (method === 'GET' && p === '/user/profile') return getProfile(event, correlationId);
  if (method === 'GET' && p === '/dashboard') return dashboard(event, correlationId);

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
  const impossibleTravel =
    lastLoc &&
    lastTime &&
    lastLoc.toLowerCase() !== String(location).toLowerCase() &&
    now - lastTime <= 600;
  const block =
    lastLoc &&
    lastTime &&
    lastLoc.toLowerCase() !== String(location).toLowerCase() &&
    now - lastTime <= 300;

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

  if (block) {
    await putDecision(
      decision(
        userId,
        'FRAUD_LOGIN',
        0.95,
        'HIGH',
        'BLOCK',
        'IMPOSSIBLE_TRAVEL',
        'Impossible travel detected',
        'AUTH',
        correlationId
      )
    );
    return err(
      403,
      correlationId,
      'ACCOUNT_BLOCKED',
      'Access denied. Account temporarily blocked.'
    );
  }

  if (impossibleTravel) {
    await putDecision(
      decision(
        userId,
        'FRAUD_LOGIN',
        0.75,
        'MEDIUM',
        'MFA',
        'IMPOSSIBLE_TRAVEL',
        'Impossible travel detected',
        'AUTH',
        correlationId
      )
    );
    await upsertLoginState(userId, now, location, true);
    return json(200, correlationId, {
      data: {
        status: 'MFA_REQUIRED',
        reason: 'IMPOSSIBLE_TRAVEL',
        sessionId,
        mfa: { type: 'OTP', expiresInSeconds: 300 },
      },
    });
  }

  await putDecision(
    decision(
      userId,
      'FRAUD_LOGIN',
      0.1,
      'LOW',
      'ALLOW',
      'NORMAL_LOGIN',
      'Login allowed',
      'AUTH',
      correlationId
    )
  );
  await upsertLoginState(userId, now, location, true);
  return json(200, correlationId, { data: { status: 'SUCCESS', userId, sessionId } });
}

async function mfaVerify(event, correlationId) {
  const body = parseBody(event);
  const sessionId = requireField(body, 'sessionId');
  const otp = requireField(body, 'otp');

  const session = await getSession(sessionId);
  if (!session) return err(404, correlationId, 'SESSION_NOT_FOUND', 'Session not found');

  const userId = session.userId;
  if (otp !== CFG.mfaOtp) {
    await putDecision(
      decision(
        userId,
        'MFA_VERIFY',
        0.0,
        'LOW',
        'BLOCK',
        'OTP_INVALID',
        'OTP invalid',
        'AUTH',
        correlationId
      )
    );
    return err(401, correlationId, 'OTP_INVALID', 'OTP invalid');
  }

  await putDecision(
    decision(
      userId,
      'MFA_VERIFY',
      0.0,
      'LOW',
      'ALLOW',
      'OTP_VALID',
      'MFA verified',
      'AUTH',
      correlationId
    )
  );
  return json(200, correlationId, { data: { status: 'SUCCESS', message: 'MFA verified' } });
}

async function transfer(event, correlationId) {
  const body = parseBody(event);
  const userId = requireField(body, 'userId');
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

  const transferId = `XFER#${randomUUID().slice(0, 8)}`;
  await putActivity(activityTransfer(userId, now, amount, recipientId, channel, correlationId));

  if (tc1h >= 4) {
    await putDecision(
      decision(
        userId,
        'FRAUD_TRANSFER',
        0.95,
        'HIGH',
        'BLOCK',
        'SUSPICIOUS_REDEMPTION',
        'High velocity transfer',
        'EARN_REDEEM',
        correlationId
      )
    );
    return err(403, correlationId, 'TRANSFER_BLOCKED', 'Transfer blocked due to high fraud risk');
  }
  if (tc1h >= 2) {
    await putDecision(
      decision(
        userId,
        'FRAUD_TRANSFER',
        0.65,
        'MEDIUM',
        'ALLOW',
        'SUSPICIOUS_REDEMPTION',
        'Transfer allowed but under review',
        'EARN_REDEEM',
        correlationId
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
      0.1,
      'LOW',
      'ALLOW',
      'NORMAL_TRANSFER',
      'Transfer allowed',
      'EARN_REDEEM',
      correlationId
    )
  );
  return json(200, correlationId, {
    data: { status: 'SUCCESS', transferId, message: 'Transfer completed' },
  });
}

async function getOffers(event, correlationId) {
  const userId = qparam(event, 'userId');
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const loyaltyScore = Number(profile.loyaltyScore || 0);
  const tier = String(profile.tier || '');

  const now = nowSec();
  const st = await getState(userId);
  const cooldownUntil = st && st.offerCooldownUntil ? st.offerCooldownUntil : 0;

  const offers = [];
  if (
    now >= cooldownUntil &&
    (loyaltyScore >= 700 || ['platinum', 'titanium', 'ambassador'].includes(tier.toLowerCase()))
  ) {
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
        0.85,
        'HIGH',
        'OFFER',
        'HIGH_INTENT',
        'High intent; incentive improves conversion',
        'OFFERS',
        correlationId
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
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const completion = Number(profile.profileCompletion || 0);
  const emailVerified = !!profile.emailVerified;
  const phoneVerified = !!profile.phoneVerified;

  const now = nowSec();
  const nudges = [];

  if (completion < 0.8 || !emailVerified || !phoneVerified) {
    nudges.push({
      nudgeId: 'NUDGE#PROFILE',
      message: 'Complete your profile now to speed up booking',
      reason: 'PROFILE_INCOMPLETE',
    });
    await bumpNudgeShown(userId, now);
    await putDecision(
      decision(
        userId,
        'NUDGE',
        0.8,
        'HIGH',
        'NUDGE',
        'PROFILE_INCOMPLETE',
        'Profile incomplete; completion reduces friction',
        'PROFILE',
        correlationId
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

exports.main = async (event) => {
  const correlationId = getHeader(event.headers, 'x-correlation-id') || '';

  try {
    if (!basicAuthOk(event)) {
      return err(401, correlationId, 'UNAUTHORIZED_CLIENT', 'Missing/invalid Basic Auth');
    }
    return await route(event, correlationId);
  } catch (e) {
    if (e && e.status) return err(e.status, correlationId, e.code || 'ERROR', e.message || 'Error');
    console.error(e);
    return err(500, correlationId, 'INTERNAL_ERROR', 'Unexpected server error');
  }
};
