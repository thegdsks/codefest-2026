'use strict';

/**
 * Unit tests for ai-offer-composer.js
 *
 * Uses the _setProvider DI seam to avoid real LLM calls.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const budget = require('./budget');
const { composeOffer, _setProvider, _buildPrompt } = require('./ai-offer-composer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv() {
  process.env.LITELLM_BASE_URL = 'https://fake-litellm.example.com';
  process.env.LITELLM_API_KEY = 'sk-test';
  process.env.LITELLM_MODEL = 'claude-haiku-4-5';
}

function clearEnv() {
  delete process.env.LITELLM_BASE_URL;
  delete process.env.LITELLM_API_KEY;
  delete process.env.LITELLM_MODEL;
}

function baseProfile(overrides = {}) {
  return {
    userId: 'USER#001',
    username: 'dre032',
    tier: 'Gold',
    loyaltyScore: 30000,
    profileCompletion: 80,
    mfaSecret: null,
    ...overrides,
  };
}

const MOCK_OFFER = {
  headline: 'Book 4+ nights and earn 2x points toward Platinum',
  body: 'You are 20,000 points from Platinum. A 4-night stay here would get you closer and unlock exclusive benefits.',
  cta: 'Check availability now',
  discountPct: 10,
  validUntilMin: 30,
  personalizationFactors: [
    'User is 20,000 pts from Platinum',
    'User has been browsing 3 properties this week',
    'Average stay is 3 nights; 4-night offer is a natural upsell',
  ],
};

function mockProvider(offer = MOCK_OFFER) {
  return {
    generateObject: async () => ({ object: offer }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ai-offer-composer: composeOffer', () => {
  before(() => {
    setEnv();
    budget._reset({ maxCalls: 50, windowSec: 300 });
  });

  after(() => {
    clearEnv();
    _setProvider(null);
  });

  beforeEach(() => {
    budget._reset({ maxCalls: 50, windowSec: 300 });
    _setProvider(null);
  });

  test('returns null when LITELLM_BASE_URL is not set', async () => {
    clearEnv();
    const result = await composeOffer({
      userId: 'USER#001',
      profile: baseProfile(),
      state: {},
      propertyId: 'paris',
      propertyName: 'Paris',
      pricePerNight: 1250,
      dwellMs: 6000,
    });
    assert.equal(result, null);
    setEnv();
  });

  test('returns composed offer when LLM responds successfully', async () => {
    _setProvider(mockProvider());
    const result = await composeOffer({
      userId: 'USER#002',
      profile: baseProfile({ tier: 'Gold', loyaltyScore: 30000 }),
      state: {},
      propertyId: 'paris',
      propertyName: 'Paris',
      pricePerNight: 1250,
      dwellMs: 6000,
    });
    assert.ok(result !== null);
    assert.equal(typeof result.headline, 'string');
    assert.equal(typeof result.body, 'string');
    assert.equal(typeof result.cta, 'string');
    assert.equal(typeof result.discountPct, 'number');
    assert.equal(typeof result.validUntilMin, 'number');
    assert.ok(Array.isArray(result.personalizationFactors));
    assert.ok(result.personalizationFactors.length >= 1);
  });

  test('returns null when budget is exhausted', async () => {
    budget._reset({ maxCalls: 0, windowSec: 300 });
    _setProvider(mockProvider());
    const result = await composeOffer({
      userId: 'USER#003',
      profile: baseProfile(),
      state: {},
      propertyId: 'bastide-gordes',
      propertyName: 'Bastide Gordes',
      pricePerNight: 1250,
      dwellMs: 7000,
    });
    assert.equal(result, null);
  });

  test('returns null when LLM call throws (simulates timeout)', async () => {
    _setProvider({
      generateObject: async () => {
        throw new Error('AbortError');
      },
    });
    const result = await composeOffer({
      userId: 'USER#004',
      profile: baseProfile(),
      state: {},
      propertyId: 'paris',
      propertyName: 'Paris',
      pricePerNight: 1250,
      dwellMs: 6000,
    });
    assert.equal(result, null);
  });

  test('serves from cache on second call for same (userId, propertyId)', async () => {
    let callCount = 0;
    _setProvider({
      generateObject: async () => {
        callCount++;
        return { object: MOCK_OFFER };
      },
    });

    const userId = `USER#cache-test-${Date.now()}`;
    const args = {
      userId,
      profile: baseProfile({ userId }),
      state: {},
      propertyId: 'paris-cache',
      propertyName: 'Paris Cache',
      pricePerNight: 1250,
      dwellMs: 6000,
    };

    const first = await composeOffer(args);
    const second = await composeOffer(args);

    assert.ok(first !== null);
    assert.ok(second !== null);
    assert.equal(callCount, 1, 'LLM should only be called once; second call served from cache');
  });
});

describe('ai-offer-composer: _buildPrompt', () => {
  test('includes tier and points information', () => {
    const prompt = _buildPrompt({
      profile: baseProfile({ tier: 'Gold', loyaltyScore: 30000 }),
      state: {},
      propertyId: 'paris',
      propertyName: 'Paris Hotel',
      pricePerNight: 1250,
      dwellMs: 6000,
    });
    assert.ok(prompt.includes('Gold'));
    assert.ok(prompt.includes('30,000'));
    assert.ok(prompt.includes('Paris Hotel'));
    assert.ok(prompt.includes('1250'));
  });

  test('mentions platinum threshold for non-platinum users', () => {
    const prompt = _buildPrompt({
      profile: baseProfile({ tier: 'Gold', loyaltyScore: 30000 }),
      state: {},
      propertyId: 'paris',
      propertyName: 'Paris Hotel',
      pricePerNight: 1250,
      dwellMs: 0,
    });
    // Gold user needs 50000 - 30000 = 20000 to reach Platinum
    assert.ok(prompt.includes('20,000'));
  });
});
