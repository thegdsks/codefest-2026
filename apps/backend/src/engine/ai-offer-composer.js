'use strict';

/**
 * AI Offer Composer
 *
 * Produces a PERSONALIZED offer for a specific (user, property) pair using a
 * dedicated LLM call. This is intentionally separate from the surface
 * prioritizer so offer copy can be highly tailored without polluting the
 * surface ranking prompt.
 *
 * Caches results 60 s per (userId, propertyId).
 * Hard 4 s timeout via AbortSignal.
 * Returns null on any failure - callers treat null as "no offer".
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject } = require('ai');
const { z } = require('zod');

const budget = require('./budget');

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const PersonalizedOfferSchema = z.object({
  headline: z.string().max(120),
  body: z.string().max(400),
  cta: z.string().max(60),
  discountPct: z.number().min(0).max(50),
  validUntilMin: z.number().min(5).max(1440),
  personalizationFactors: z.array(z.string().max(200)).min(1).max(5),
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

/** @type {Map<string, { result: object, expiresAt: number }>} */
const _cache = new Map();

function _evict() {
  const now = Date.now();
  for (const [k, v] of _cache.entries()) {
    if (v.expiresAt <= now) _cache.delete(k);
  }
}

function _cacheKey(userId, propertyId) {
  return `${userId}::${propertyId}`;
}

// ---------------------------------------------------------------------------
// DI seam for tests
// ---------------------------------------------------------------------------

/** @type {{ generateObject: Function } | null} */
let _injectedProvider = null;

function _setProvider(p) {
  _injectedProvider = p;
}

// ---------------------------------------------------------------------------
// Config helpers (mirrors ai-surface-prioritizer.js)
// ---------------------------------------------------------------------------

function readConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const primaryModel = process.env.LITELLM_MODEL || 'claude-haiku-4-5';
  return { baseUrl, apiKey, primaryModel };
}

function buildModel(cfg, modelId) {
  const provider = createOpenAICompatible({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    name: 'litellm',
  });
  return provider(modelId);
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {object} params.profile - UserProfile row
 * @param {object} params.state   - UserState row (may be empty object)
 * @param {string} params.propertyId
 * @param {string} params.propertyName
 * @param {number} params.pricePerNight - in SFC
 * @param {number} params.dwellMs       - how long user has been on the property page
 * @returns {string}
 */
function buildPrompt({ profile, state, propertyId, propertyName, pricePerNight, dwellMs }) {
  const tier = profile.tier || 'Silver';
  const points = Number(profile.loyaltyScore || 0);
  const pointsToPlat = points < 50000 ? Math.max(0, 50000 - points) : 0;
  const avgStayNights = state.avgStayNights ? Number(state.avgStayNights) : 3;
  const recentPropertyViews = state.recentPropertyViews ? Number(state.recentPropertyViews) : 1;
  const dwellSec = Math.round(dwellMs / 1000);

  const tierBandInfo = {
    Silver: { discount: 0, threshold: 25000 },
    Gold: { discount: 10, threshold: 50000 },
    Platinum: { discount: 20, threshold: 100000 },
    Diamond: { discount: 30, threshold: null },
  };
  const bandInfo = tierBandInfo[tier] || tierBandInfo.Silver;

  return (
    'You are a loyalty platform personalization engine. Compose a short, tailored property offer for a hotel guest.\n\n' +
    'Guest context:\n' +
    `  tier=${tier} currentPoints=${points.toLocaleString()} pointsToPlatinum=${pointsToPlat.toLocaleString()}\n` +
    `  averageStayNights=${avgStayNights} recentPropertyViewsThisWeek=${recentPropertyViews}\n` +
    `  dwellTimeOnPageSec=${dwellSec}\n\n` +
    'Property context:\n' +
    `  propertyId=${propertyId} name="${propertyName}" pricePerNightSfc=${pricePerNight}\n` +
    `  tierDiscountPct=${bandInfo.discount}% (applicable to ${tier} members)\n\n` +
    'Personalization examples to reason over:\n' +
    `  - "You are ${pointsToPlat.toLocaleString()} pts from Platinum and a 4-night stay here would push you over"\n` +
    `  - "You have browsed ${recentPropertyViews} propert${recentPropertyViews === 1 ? 'y' : 'ies'} this week; book tonight for 2x points"\n` +
    `  - "Your average stay is ${avgStayNights} nights; we offer a complimentary night ${avgStayNights + 1} on a ${avgStayNights + 1}-night booking"\n\n` +
    'Rules:\n' +
    '  - headline must be 1 punchy sentence, no em dashes\n' +
    '  - body must mention at least one personalization factor (points, tier progress, dwell, history)\n' +
    '  - cta must be an action verb phrase (max 8 words)\n' +
    `  - discountPct must be ${bandInfo.discount} or 0 (do not invent higher discounts)\n` +
    '  - validUntilMin is how many minutes this offer stays valid (15-60 for urgency)\n' +
    '  - personalizationFactors is a list of plain-English explanations of why this offer was chosen\n' +
    '  - Do NOT mention Marriott by name. Do NOT add em dashes.\n' +
    '  - Do NOT invent facts not present in the context.'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose a personalized offer for (user, property).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object} params.profile      - UserProfile
 * @param {object} params.state        - UserState (may be {})
 * @param {string} params.propertyId
 * @param {string} params.propertyName
 * @param {number} params.pricePerNight - in SFC
 * @param {number} params.dwellMs
 * @returns {Promise<object|null>} PersonalizedOffer or null
 */
async function composeOffer({
  userId,
  profile,
  state,
  propertyId,
  propertyName,
  pricePerNight,
  dwellMs,
}) {
  const cfg = readConfig();
  if (!cfg) return null;

  const reservation = budget.tryReserve();
  if (!reservation.ok) {
    console.error('[ai-offer-composer] budget exhausted, skipping LLM call');
    return null;
  }

  _evict();
  const key = _cacheKey(userId, propertyId);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    budget.recordResult({
      callId: reservation.callId,
      success: true,
      latencyMs: 0,
      model: 'cache',
    });
    return cached.result;
  }

  const prompt = buildPrompt({ profile, state, propertyId, propertyName, pricePerNight, dwellMs });
  const start = Date.now();

  try {
    const sdkFns = _injectedProvider || { generateObject };
    const model = _injectedProvider ? null : buildModel(cfg, cfg.primaryModel);

    const { object } = await sdkFns.generateObject({
      model,
      schema: PersonalizedOfferSchema,
      prompt,
      abortSignal: AbortSignal.timeout(4000),
    });

    const latencyMs = Date.now() - start;
    budget.recordResult({
      callId: reservation.callId,
      success: true,
      latencyMs,
      model: cfg.primaryModel,
    });

    _cache.set(key, { result: object, expiresAt: Date.now() + CACHE_TTL_MS });
    return object;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorCode = err?.name ? err.name : 'UnknownError';
    console.error(
      JSON.stringify({
        msg: '[ai-offer-composer] LLM call failed',
        errorCode,
        latencyMs,
      })
    );
    budget.recordResult({
      callId: reservation.callId,
      success: false,
      latencyMs,
      model: cfg.primaryModel,
    });
    return null;
  }
}

module.exports = { composeOffer, _setProvider, _buildPrompt: buildPrompt };
