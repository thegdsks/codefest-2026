'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomBytes } = require('node:crypto');

const { CFG } = require('./config');
const { nowSec, getHeader } = require('./http');

let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// test-only seam; not part of the public API
function _setDdb(client) {
  ddb = client;
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

/**
 * Write pendingMfaSecret, pendingRecoveryHashes, pendingMfaCreatedAt to UserProfile.
 * Used by mfaEnroll.
 */
async function startMfaEnroll(userId, secret, recoveryHashes, createdAt) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression:
        'SET pendingMfaSecret = :s, pendingRecoveryHashes = :h, pendingMfaCreatedAt = :t',
      ExpressionAttributeValues: {
        ':s': secret,
        ':h': recoveryHashes,
        ':t': createdAt,
      },
    })
  );
}

/**
 * Promote pending MFA secret to active. Used by mfaConfirmEnroll.
 */
async function confirmMfaEnroll(userId, secret, recoveryHashes) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression:
        'SET mfaSecret = :s, mfaRecoveryHashes = :h, mfaEnabled = :e ' +
        'REMOVE pendingMfaSecret, pendingRecoveryHashes, pendingMfaCreatedAt',
      ExpressionAttributeValues: {
        ':s': secret,
        ':h': recoveryHashes,
        ':e': true,
      },
    })
  );
}

/**
 * Clear mfaSecret, update recovery hashes, and set mfaEnabled = false.
 * Used by mfaRecover.
 */
async function clearMfaSecret(userId, remainingHashes) {
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserProfile,
      Key: { userId },
      UpdateExpression: 'SET mfaRecoveryHashes = :h, mfaEnabled = :e REMOVE mfaSecret',
      ExpressionAttributeValues: {
        ':h': remainingHashes,
        ':e': false,
      },
    })
  );
}

module.exports = {
  _setDdb,
  getUserById,
  findUserByUsername,
  getState,
  upsertLoginState,
  incrementTransferCounters,
  updateLastTransferRecipient,
  bumpOfferShown,
  bumpNudgeShown,
  putSession,
  getSession,
  putActivity,
  recentActivity,
  putDecision,
  issueAccessToken,
  validateBearer,
  requireBearer,
  revokeAccessToken,
  startMfaEnroll,
  confirmMfaEnroll,
  clearMfaSecret,
};
