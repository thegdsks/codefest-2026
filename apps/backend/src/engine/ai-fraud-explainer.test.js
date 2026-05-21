'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const budget = require('./budget');
const { explain, _setProvider, _buildPrompt } = require('./ai-fraud-explainer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearLiteLLMEnv() {
  delete process.env.LITELLM_BASE_URL;
  delete process.env.LITELLM_API_KEY;
  delete process.env.LITELLM_MODEL;
}

function setEnv() {
  process.env.LITELLM_BASE_URL = 'https://fake-litellm.example.com';
  process.env.LITELLM_API_KEY = 'sk-test';
  process.env.LITELLM_MODEL = 'claude-haiku-4-5';
}

const MOCK_EXPLANATION = {
  paragraph:
    'The transfer of 8,000 points to an unfamiliar recipient from an unrecognised device triggered a high-risk block. The system detected 4 transfers within the last hour, exceeding the normal threshold, combined with a device fingerprint that has never been seen before. The fraud score of 92 reflects high confidence in this being a suspicious pattern. The account has been held pending analyst review.',
  riskFactors: [
    'Transfer amount of 8,000 points is above the session average',
    'Device fingerprint not seen in the last 30 days',
    '4 transfers in the past hour, exceeding the 3-transfer threshold',
    'Recipient USER#009 has no prior transfer history with this account',
  ],
  recommendation:
    'Flag the account for manual review and notify the member via email before releasing any pending transfers.',
};

// ---------------------------------------------------------------------------
// 1. Missing env vars returns null
// ---------------------------------------------------------------------------

describe('missing env vars', () => {
  before(() => {
    clearLiteLLMEnv();
    _setProvider(null);
    budget._reset({ maxCalls: 50, windowSec: 300 });
  });
  after(() => {
    clearLiteLLMEnv();
    _setProvider(null);
  });

  test('returns null when LITELLM_BASE_URL is absent', async () => {
    const result = await explain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'BLOCK',
      score: 90,
      reasonCode: 'VELOCITY_HIGH',
      reasonText: 'High transfer velocity',
      context: { amount: 8000, recipientId: 'USER#009' },
      priorDecisions: [],
    });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Successful explanation with mocked provider
// ---------------------------------------------------------------------------

describe('successful explanation', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider({
      generateObject: async () => ({
        object: MOCK_EXPLANATION,
        usage: { totalTokens: 300 },
      }),
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns object with paragraph, riskFactors, recommendation', async () => {
    const result = await explain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'BLOCK',
      score: 92,
      reasonCode: 'VELOCITY_HIGH',
      reasonText: 'High transfer velocity',
      context: { amount: 8000, recipientId: 'USER#009', deviceFingerprint: 'unknown-device' },
      priorDecisions: [],
    });
    assert.ok(result !== null, 'expected non-null result');
    assert.ok(typeof result.paragraph === 'string' && result.paragraph.length > 0);
    assert.ok(Array.isArray(result.riskFactors) && result.riskFactors.length > 0);
    assert.ok(typeof result.recommendation === 'string' && result.recommendation.length > 0);
  });

  test('explanation paragraph is non-trivially long', async () => {
    const result = await explain({
      decisionType: 'FRAUD_LOGIN',
      action: 'MFA',
      score: 65,
      reasonCode: 'LOCATION_CHANGE',
      reasonText: 'New login location',
      context: { location: 'Lagos', deviceId: 'device-web', ip: '192.168.1.1' },
      priorDecisions: [],
    });
    assert.ok(result !== null);
    // paragraph should be more than a single word
    assert.ok(
      result.paragraph.split(' ').length >= 10,
      'paragraph should be a meaningful sentence'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. LLM timeout (AbortError) returns null
// ---------------------------------------------------------------------------

describe('LLM timeout', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider({
      generateObject: async () => {
        const e = new Error('The operation was aborted.');
        e.name = 'AbortError';
        throw e;
      },
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns null on AbortError', async () => {
    const result = await explain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'BLOCK',
      score: 95,
      reasonCode: 'VELOCITY_HIGH',
      reasonText: 'Too many transfers',
      context: {},
      priorDecisions: [],
    });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Budget guard tripped - returns null without calling LLM
// ---------------------------------------------------------------------------

describe('budget guard', () => {
  let callCount = 0;

  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 0, windowSec: 300 });
    callCount = 0;
    _setProvider({
      generateObject: async () => {
        callCount += 1;
        return { object: MOCK_EXPLANATION, usage: {} };
      },
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
  });

  test('returns null when budget guard is tripped', async () => {
    const result = await explain({
      decisionType: 'FRAUD_TRANSFER',
      action: 'REVIEW',
      score: 55,
      reasonCode: 'VELOCITY_MEDIUM',
      reasonText: 'Medium velocity',
      context: { amount: 500 },
      priorDecisions: [],
    });
    assert.equal(result, null);
    assert.equal(callCount, 0, 'LLM should not be called when budget is exhausted');
  });
});

// ---------------------------------------------------------------------------
// 5. Works with no optional fields (context and priorDecisions omitted)
// ---------------------------------------------------------------------------

describe('minimal params', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider({
      generateObject: async () => ({
        object: MOCK_EXPLANATION,
        usage: {},
      }),
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('works without context or priorDecisions', async () => {
    const result = await explain({
      decisionType: 'FRAUD_LOGIN',
      action: 'BLOCK',
      score: 88,
      reasonCode: 'ANOMALY',
      reasonText: 'Anomalous login',
    });
    assert.ok(result !== null);
    assert.ok(typeof result.paragraph === 'string');
  });
});

// ---------------------------------------------------------------------------
// 6. Prompt contains trust score and recent events when signalContext provided
// ---------------------------------------------------------------------------

describe('prompt enrichment with signalContext', () => {
  test('prompt includes trustScore when signalContext is provided', () => {
    const signalContext = {
      trustScore: 38,
      scrollDepthPct: 55,
      recentEventTypes: ['rage_click', 'abandoned_flow_step'],
      flowState: { page: 'transfer', amountSfc: 8000 },
    };

    const prompt = _buildPrompt({
      decisionType: 'FRAUD_TRANSFER',
      action: 'BLOCK',
      score: 88,
      reasonCode: 'VELOCITY_HIGH',
      reasonText: 'High velocity',
      context: { amount: 8000 },
      priorDecisions: [],
      signalContext,
    });

    assert.ok(prompt.includes('trustScore=38'), 'prompt must include trustScore');
    assert.ok(
      prompt.includes('rage_click') && prompt.includes('abandoned_flow_step'),
      'prompt must include recentEventTypes'
    );
    assert.ok(prompt.includes('amountSfc=8000'), 'prompt must include flowState amount');
    assert.ok(
      prompt.includes('Do not invent signals'),
      'prompt must include factual constraint instruction'
    );
  });

  test('prompt without signalContext excludes enriched context block', () => {
    const prompt = _buildPrompt({
      decisionType: 'FRAUD_LOGIN',
      action: 'MFA',
      score: 60,
      reasonCode: 'LOCATION_CHANGE',
      reasonText: 'New location',
      context: {},
      priorDecisions: [],
    });

    assert.ok(
      !prompt.includes('trustScore='),
      'prompt must not include trustScore when no context'
    );
    assert.ok(
      !prompt.includes('Enriched session context'),
      'prompt must not include enriched context block when signalContext is absent'
    );
  });
});
