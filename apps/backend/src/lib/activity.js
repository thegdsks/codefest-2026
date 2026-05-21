'use strict';

const { nowSec } = require('./http');

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

module.exports = {
  activityLogin,
  activityTransfer,
  activityOfferAction,
  activityNudgeAction,
  decision,
};
