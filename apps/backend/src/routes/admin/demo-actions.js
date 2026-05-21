'use strict';

/**
 * Admin demo-actions endpoints.
 *
 * POST /admin/demo-actions/mutate-user
 *
 * Applies a mutation object to UserProfile and/or UserState for a given userId,
 * returns the post-mutation snapshot of touched fields, and fires a DEMO_EVENT
 * to UserActivity so the admin feed captures the operator action.
 */

const { UpdateCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');
const { getDdb, setDdb, nowSec, json, err, requireAdmin, CFG } = require('./shared');

function _setDdb(client) {
  setDdb(client);
}

/**
 * POST /admin/demo-actions/mutate-user
 *
 * Body: { userId: string, mutation: { ... } }
 *
 * Supported mutation fields:
 *   profileCompletion  number   - sets UserProfile.profileCompletion, writes
 *                                 profileCompletionReachedAt to UserState if
 *                                 crossing the 90 threshold upward
 *   tier               string   - sets UserProfile.tier, writes platinumReachedAt
 *                                 to UserState when value is 'Platinum'
 *   mfaEnrolled        boolean  - true: sets UserProfile.mfaSecret + mfaEnrolledAt
 *                                 false: removes UserProfile.mfaSecret
 *   loyaltyScore       number   - sets UserProfile.loyaltyScore
 *   flow.transfer.abandon true  - writes a stale transferDraft to UserState
 *   flow.transfer.resume  true  - writes lastTransferCompletedAt + removes transferDraft
 *   booking.trigger    true     - writes recentBookingAt to UserState
 *
 * Returns: { userId, touched: { field: { from, to } }, activityId, mutatedAt }
 */
async function mutateDemoUser(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Invalid JSON body');
  }

  const { userId, mutation } = body;
  if (!userId || typeof userId !== 'string') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'userId is required');
  }
  if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) {
    return err(400, correlationId, 'VALIDATION_ERROR', 'mutation is required');
  }

  const ddb = getDdb();
  const now = nowSec();

  // Fetch current profile for before-state
  const profileRes = await ddb.send(
    new GetCommand({ TableName: CFG.tUserProfile, Key: { userId } })
  );
  const profile = profileRes.Item;
  if (!profile) {
    return err(404, correlationId, 'USER_NOT_FOUND', `User ${userId} not found`);
  }

  const stateRes = await ddb.send(new GetCommand({ TableName: CFG.tUserState, Key: { userId } }));
  const state = stateRes.Item || { userId };

  const touched = {};

  // --- tier ---
  if (mutation.tier !== undefined) {
    const oldTier = profile.tier;
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET #tier = :tier, updatedAt = :now',
        ExpressionAttributeNames: { '#tier': 'tier' },
        ExpressionAttributeValues: { ':tier': mutation.tier, ':now': now },
      })
    );
    touched.tier = { from: oldTier, to: mutation.tier };

    if (mutation.tier === 'Platinum') {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET platinumReachedAt = :t, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
    } else {
      // Demoting away from Platinum: clear the reached flag
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'REMOVE platinumReachedAt SET updatedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      );
    }
  }

  // --- loyaltyScore ---
  if (mutation.loyaltyScore !== undefined) {
    const oldScore = profile.loyaltyScore || 0;
    const newScore = Number(mutation.loyaltyScore);
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET loyaltyScore = :score, updatedAt = :now',
        ExpressionAttributeValues: { ':score': newScore, ':now': now },
      })
    );
    touched.loyaltyScore = { from: oldScore, to: newScore };
  }

  // --- profileCompletion ---
  if (mutation.profileCompletion !== undefined) {
    const oldCompletion = profile.profileCompletion || 0;
    const newCompletion = Number(mutation.profileCompletion);
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET profileCompletion = :pc, updatedAt = :now',
        ExpressionAttributeValues: { ':pc': newCompletion, ':now': now },
      })
    );
    touched.profileCompletion = { from: oldCompletion, to: newCompletion };

    if (newCompletion >= 90 && oldCompletion < 90) {
      // Crossing the 90 threshold: record the moment so surface eval shows COMPLETED
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression:
            'SET profileCompletionReachedAt = :t, profileEditInProgress = :false, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':false': false, ':now': now },
        })
      );
    } else {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET profileEditInProgress = :false, updatedAt = :now',
          ExpressionAttributeValues: { ':false': false, ':now': now },
        })
      );
    }
  }

  // --- mfaEnrolled ---
  if (mutation.mfaEnrolled !== undefined) {
    if (mutation.mfaEnrolled === true) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserProfile,
          Key: { userId },
          UpdateExpression: 'SET mfaSecret = :secret, updatedAt = :now',
          ExpressionAttributeValues: { ':secret': 'DEMO_MFA_SECRET', ':now': now },
        })
      );
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET mfaEnrolledAt = :t, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
      touched.mfaEnrolled = { from: !!profile.mfaSecret, to: true };
    } else {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserProfile,
          Key: { userId },
          UpdateExpression: 'REMOVE mfaSecret SET updatedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      );
      touched.mfaEnrolled = { from: !!profile.mfaSecret, to: false };
    }
  }

  // --- flow.transfer ---
  if (mutation.flow?.transfer) {
    const tf = mutation.flow.transfer;
    if (tf.abandon === true) {
      // Write a stale draft (120s old) so surface evaluator shows SHOWN
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET transferDraft = :draft, updatedAt = :now',
          ExpressionAttributeValues: {
            ':draft': { lastUpdatedAt: now - 120 },
            ':now': now,
          },
        })
      );
      touched.transferDraft = { from: state.transferDraft ?? null, to: 'stale_draft' };
    }
    if (tf.resume === true) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression:
            'SET lastTransferCompletedAt = :t, updatedAt = :now REMOVE transferDraft',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
      touched.transferCompleted = { from: null, to: now };
    }
  }

  // --- booking.trigger ---
  if (mutation.booking?.trigger === true) {
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserState,
        Key: { userId },
        UpdateExpression:
          'SET recentBookingAt = :t, updatedAt = :now REMOVE bookingOfferDismissedAt',
        ExpressionAttributeValues: { ':t': now, ':now': now },
      })
    );
    touched.recentBooking = { from: null, to: now };
  }

  // Publish DEMO_EVENT to UserActivity so the admin feed captures this action
  const activityId = `DEMO#${randomUUID()}`;
  await ddb.send(
    new PutCommand({
      TableName: CFG.tUserActivity,
      Item: {
        activityId,
        userId,
        activityType: 'DEMO_EVENT',
        type: 'USER_MUTATION',
        actor: 'demo-panel',
        payload: { userId, mutation, touched },
        timestamp: now,
        createdAt: now,
      },
    })
  );

  return json(200, correlationId, {
    data: { userId, touched, activityId, mutatedAt: now },
  });
}

module.exports = { mutateDemoUser, _setDdb };
