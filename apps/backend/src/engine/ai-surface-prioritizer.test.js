'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const budget = require('./budget');
const { prioritize, _setProvider, _buildPrompt } = require('./ai-surface-prioritizer');

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

function baseSurfaces() {
  return [
    {
      surfaceId: 'PROPERTY_PRESTIGE_ADVANCE',
      state: 'SHOWN',
      reason: 'Within 400 pts of Platinum',
      copy: { headline: 'Prestige Advance Benefit', body: 'Book to reach Platinum.' },
      ruleId: 'RULE#TIER_GAP_NUDGE',
      context: { pointsToNextTier: 400, currentTier: 'Gold', nextTier: 'Platinum' },
      nextAction: null,
    },
    {
      surfaceId: 'MFA_ENROLLMENT_NUDGE',
      state: 'SHOWN',
      reason: 'Gold member without MFA',
      copy: { headline: 'Secure Your Account', body: 'Enable 2FA.' },
      ruleId: 'RULE#MFA_ENROLLMENT_GAP',
      context: { hasMfa: false, currentTier: 'Gold' },
      nextAction: null,
    },
    {
      surfaceId: 'BOOKING_CONFIRMATION_OFFER',
      state: 'HIDDEN',
      reason: 'No recent booking',
      copy: null,
      ruleId: null,
      context: { hasRecentBooking: false },
      nextAction: null,
    },
  ];
}

function baseProfile() {
  return {
    userId: 'user001',
    tier: 'Gold',
    loyaltyScore: 600,
    profileCompletion: 70,
    mfaSecret: null,
  };
}

const MOCK_VERDICTS = [
  {
    surfaceId: 'PROPERTY_PRESTIGE_ADVANCE',
    aiAction: 'PROMOTE',
    aiPriority: 1,
    aiRationale: 'User is close to Platinum; showing this first maximizes upgrade conversions.',
  },
  {
    surfaceId: 'MFA_ENROLLMENT_NUDGE',
    aiAction: 'KEEP',
    aiPriority: 2,
    aiRationale:
      'Security nudge is relevant for this tier but lower priority than the upgrade offer.',
  },
  {
    surfaceId: 'BOOKING_CONFIRMATION_OFFER',
    aiAction: 'HIDE',
    aiPriority: 5,
    aiRationale: 'No recent booking means this offer has no context to anchor on.',
  },
];

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
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user001');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Successful prioritization with mocked provider
// ---------------------------------------------------------------------------

describe('successful prioritization', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider({
      generateObject: async () => ({
        object: { verdicts: MOCK_VERDICTS },
        usage: { totalTokens: 200 },
      }),
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('returns one verdict per surface', async () => {
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user001');
    assert.ok(result !== null, 'expected a non-null result');
    assert.equal(result.length, 3);
  });

  test('each verdict has required shape', async () => {
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user001');
    for (const v of result) {
      assert.ok(typeof v.surfaceId === 'string', 'surfaceId must be string');
      assert.ok(
        ['KEEP', 'PROMOTE', 'DEMOTE', 'HIDE', 'SWAP'].includes(v.aiAction),
        'aiAction must be valid'
      );
      assert.ok([1, 2, 3, 4, 5].includes(v.aiPriority), 'aiPriority must be 1-5');
      assert.ok(
        typeof v.aiRationale === 'string' && v.aiRationale.length > 0,
        'aiRationale must be non-empty string'
      );
    }
  });

  test('PROPERTY_PRESTIGE_ADVANCE gets PROMOTE', async () => {
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user001');
    const v = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(v.aiAction, 'PROMOTE');
    assert.equal(v.aiPriority, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. Cache hit: second call with same surfaces does not invoke LLM again
// ---------------------------------------------------------------------------

describe('cache behavior', () => {
  let callCount = 0;

  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    callCount = 0;
    _setProvider({
      generateObject: async () => {
        callCount += 1;
        return { object: { verdicts: MOCK_VERDICTS }, usage: {} };
      },
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('second call with same state is served from cache', async () => {
    const surfaces = baseSurfaces();
    const profile = baseProfile();

    await prioritize(surfaces, profile, [], 1716300000, 'user-cache-test');
    await prioritize(surfaces, profile, [], 1716300000, 'user-cache-test');

    assert.equal(callCount, 1, 'LLM should be called only once for same state');
  });
});

// ---------------------------------------------------------------------------
// 4. LLM error (AbortError) returns null
// ---------------------------------------------------------------------------

describe('LLM timeout returns null', () => {
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
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user-timeout');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 5. Budget guard tripped - returns null without calling LLM
// ---------------------------------------------------------------------------

describe('budget guard', () => {
  let callCount = 0;

  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 0, windowSec: 300 }); // cap at 0 = always tripped
    callCount = 0;
    _setProvider({
      generateObject: async () => {
        callCount += 1;
        return { object: { verdicts: MOCK_VERDICTS }, usage: {} };
      },
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
  });

  test('returns null when budget guard is tripped', async () => {
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user-budget');
    assert.equal(result, null);
    assert.equal(callCount, 0, 'LLM should not be called when budget is exhausted');
  });
});

// ---------------------------------------------------------------------------
// 6. Missing verdict for a surface - filled in with KEEP / priority 3
// ---------------------------------------------------------------------------

describe('missing verdict fallback', () => {
  before(() => {
    clearLiteLLMEnv();
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
    // LLM only returns verdicts for 2 of 3 surfaces
    _setProvider({
      generateObject: async () => ({
        object: {
          verdicts: [MOCK_VERDICTS[0], MOCK_VERDICTS[1]], // omit BOOKING_CONFIRMATION_OFFER
        },
        usage: {},
      }),
    });
  });
  after(() => {
    _setProvider(null);
    clearLiteLLMEnv();
  });

  test('fills in KEEP/3 for surfaces not covered by LLM', async () => {
    const result = await prioritize(baseSurfaces(), baseProfile(), [], 1716300000, 'user-fill');
    assert.ok(result !== null, 'expected non-null result');
    const booking = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.ok(booking, 'BOOKING_CONFIRMATION_OFFER must be present');
    assert.equal(booking.aiAction, 'KEEP');
    assert.equal(booking.aiPriority, 3);
  });
});

// ---------------------------------------------------------------------------
// 7. Prompt contains trust score and recent events when signalContext provided
// ---------------------------------------------------------------------------

describe('prompt contains enriched context', () => {
  test('prompt includes trustScore when signalContext is provided', () => {
    const surfaces = baseSurfaces();
    const profile = baseProfile();
    const signalContext = {
      trustScore: 45,
      scrollDepthPct: 72,
      clickCountInSession: 8,
      routeChangesInSession: 2,
      recentEventTypes: ['rage_click', 'dwell_no_action'],
      pageTimeSinceMountMs: 12000,
      device: { viewportWidth: 1440, viewportHeight: 900, language: 'en-US' },
      flowState: { page: 'transfer', step: 'confirm', amountSfc: 5000 },
    };

    const prompt = _buildPrompt(surfaces, profile, [], 1716300000, signalContext);

    assert.ok(prompt.includes('trustScore=45'), 'prompt must include trustScore from context');
    assert.ok(
      prompt.includes('rage_click') && prompt.includes('dwell_no_action'),
      'prompt must include recentEventTypes from context'
    );
    assert.ok(prompt.includes('flowState'), 'prompt must include flowState section');
    assert.ok(prompt.includes('amountSfc=5000'), 'prompt must include flowState amount');
  });

  test('prompt without signalContext does not include enriched context block', () => {
    const surfaces = baseSurfaces();
    const profile = baseProfile();

    const prompt = _buildPrompt(surfaces, profile, [], 1716300000, null);

    assert.ok(
      !prompt.includes('trustScore='),
      'prompt must not include trustScore= when context is null'
    );
    // The SDK context block begins with "Enriched SDK session context" - it must not appear
    assert.ok(
      !prompt.includes('Enriched SDK session context'),
      'prompt must not include enriched session context block when signalContext is null'
    );
  });

  test('cache key differs when trustScore changes meaningfully', async () => {
    let callCount = 0;
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider({
      generateObject: async () => {
        callCount += 1;
        return { object: { verdicts: MOCK_VERDICTS }, usage: {} };
      },
    });
    process.env.LITELLM_BASE_URL = 'https://fake-litellm.example.com';
    process.env.LITELLM_API_KEY = 'sk-test';

    const surfaces = baseSurfaces();
    const profile = baseProfile();
    const ctxLowTrust = { trustScore: 30, recentEventTypes: ['rage_click'] };
    const ctxHighTrust = { trustScore: 90, recentEventTypes: ['search_result_click'] };

    await prioritize(surfaces, profile, [], 1716300000, 'ctx-trust-user', ctxLowTrust);
    await prioritize(surfaces, profile, [], 1716300000, 'ctx-trust-user', ctxHighTrust);

    assert.equal(callCount, 2, 'different trust scores must produce different cache keys');

    _setProvider(null);
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
  });
});
