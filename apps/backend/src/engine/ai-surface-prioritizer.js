'use strict';

/**
 * AI Surface Prioritizer
 *
 * After the deterministic surface evaluation produces a candidate list,
 * this module passes those surfaces plus user context to L2 (LLM) to
 * produce per-surface AI verdicts.
 *
 * The deterministic state (SHOWN|HIDDEN|PENDING|COMPLETED) is the source
 * of truth and is never modified here. AI fields are additive.
 *
 * Cache: in-memory Map keyed by (userId + surface-state-hash), 30s TTL.
 * Per-Lambda-container only (no DDB). Cheap for the demo.
 *
 * Timeout: 3s AbortSignal hard limit. On timeout the caller receives null
 * and uses the deterministic output unmodified with aiUnavailable=true.
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject } = require('ai');
const { z } = require('zod');

const budget = require('./budget');

// ---------------------------------------------------------------------------
// Output schema (Zod constrained so LLM cannot drift)
// ---------------------------------------------------------------------------

const SurfaceVerdictSchema = z.object({
  surfaceId: z.string(),
  aiAction: z.enum(['KEEP', 'PROMOTE', 'DEMOTE', 'HIDE', 'SWAP']),
  aiPriority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  aiRationale: z.string().max(300),
});

const PrioritizerResponseSchema = z.object({
  verdicts: z.array(SurfaceVerdictSchema),
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;

/** @type {Map<string, { result: object[], expiresAt: number }>} */
const _cache = new Map();

function _hashSurfaces(surfaces) {
  // Stable hash of surface states for cache key.
  return surfaces
    .map((s) => `${s.surfaceId}:${s.state}`)
    .sort()
    .join('|');
}

function _cacheKey(userId, surfaces) {
  return `${userId}::${_hashSurfaces(surfaces)}`;
}

function _evict() {
  const now = Date.now();
  for (const [k, v] of _cache.entries()) {
    if (v.expiresAt <= now) _cache.delete(k);
  }
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
// Config helpers (mirrors llm.js pattern)
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
 * @param {object[]} surfaces - SurfaceResult[] from evaluateSurfaces
 * @param {object} profile
 * @param {object[]} recentSignals - last 10 UserActivity rows
 * @param {number} nowSec
 * @returns {string}
 */
function buildPrompt(surfaces, profile, recentSignals, nowSec) {
  const surfaceLines = surfaces
    .map(
      (s) =>
        `- ${s.surfaceId}: state=${s.state} reason="${s.reason}" ` +
        (s.copy ? `headline="${s.copy.headline}"` : 'no copy')
    )
    .join('\n');

  const signalLines =
    recentSignals.length > 0
      ? recentSignals
          .slice(0, 10)
          .map((a) => {
            const deltaSec = nowSec - (a.activityTime || 0);
            return `  - ${a.activityType} ${deltaSec}s ago (channel=${a.channel || 'unknown'})`;
          })
          .join('\n')
      : '  (none)';

  const tier = profile.tier || 'unknown';
  const loyaltyScore = profile.loyaltyScore || 0;
  const profileCompletion = profile.profileCompletion || 0;
  const mfaEnrolled = !!profile.mfaSecret;
  const hour = new Date(nowSec * 1000).getUTCHours();
  const tod = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    `You are the personalization brain for a loyalty platform. Given the user's current state and recent behavior, decide which surfaces to PROMOTE, KEEP, DEMOTE, or HIDE so we show the most relevant thing without overwhelming.\n\n` +
    'Output one verdict per surface with a rationale a product manager would write.\n\n' +
    'User context:\n' +
    `  tier=${tier} loyaltyScore=${loyaltyScore} profileCompletion=${profileCompletion}% mfaEnrolled=${mfaEnrolled} timeOfDay=${tod}\n\n` +
    'Candidate surfaces (deterministic state is fixed, AI adds ranking only):\n' +
    `${surfaceLines}\n\n` +
    'Recent SDK signals (last 10):\n' +
    `${signalLines}\n\n` +
    'Rules:\n' +
    '- aiPriority 1 = show first (most relevant), 5 = least relevant\n' +
    '- Only PROMOTE surfaces that are SHOWN and highly relevant right now\n' +
    '- DEMOTE or HIDE surfaces the user is unlikely to care about given context\n' +
    '- SWAP means show an alternate copy variant (use sparingly)\n' +
    '- aiRationale must be 1-2 sentences, written for a product manager\n' +
    '- Output a verdict for every surface in the input list'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute AI verdicts for a list of surfaces.
 *
 * @param {object[]} surfaces - output of evaluateSurfaces
 * @param {object} profile - UserProfile
 * @param {object[]} recentSignals - last 10 UserActivity rows (may be empty)
 * @param {number} nowSec
 * @param {string} userId
 * @returns {Promise<object[]|null>} array of SurfaceVerdict or null on failure
 */
async function prioritize(surfaces, profile, recentSignals, nowSec, userId) {
  const cfg = readConfig();
  if (!cfg) return null;

  // Budget guard
  const reservation = budget.tryReserve();
  if (!reservation.ok) {
    console.error('[ai-surface-prioritizer] budget exhausted, skipping LLM call');
    return null;
  }

  // Cache check
  _evict();
  const key = _cacheKey(userId, surfaces);
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

  const prompt = buildPrompt(surfaces, profile, recentSignals, nowSec);
  const start = Date.now();
  let result = null;

  try {
    const sdkFns = _injectedProvider || { generateObject };
    const model = _injectedProvider ? null : buildModel(cfg, cfg.primaryModel);

    const { object } = await sdkFns.generateObject({
      model,
      schema: PrioritizerResponseSchema,
      prompt,
      abortSignal: AbortSignal.timeout(6000),
    });

    const latencyMs = Date.now() - start;
    budget.recordResult({
      callId: reservation.callId,
      success: true,
      latencyMs,
      model: cfg.primaryModel,
    });

    // Normalise: ensure every input surface has a verdict (fill any gaps with KEEP / priority 3)
    const verdictMap = new Map(object.verdicts.map((v) => [v.surfaceId, v]));
    result = surfaces.map((s) => {
      const v = verdictMap.get(s.surfaceId);
      if (v) return v;
      return {
        surfaceId: s.surfaceId,
        aiAction: 'KEEP',
        aiPriority: 3,
        aiRationale: 'No specific signal to re-rank this surface.',
      };
    });

    _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorCode = err?.name ? err.name : 'UnknownError';
    console.error(
      JSON.stringify({
        msg: '[ai-surface-prioritizer] LLM call failed',
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

module.exports = { prioritize, _setProvider };
