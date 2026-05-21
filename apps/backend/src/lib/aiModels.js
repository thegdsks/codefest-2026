'use strict';

/**
 * aiModels.js
 *
 * Curated catalog of LLM models available through the Marriott LiteLLM proxy
 * for the Signal Force engine. Anchors the model id used by engine/llm.js and
 * lib/aiRuleSuggest.js, surfaces a structured list for the admin UI, and
 * records public-rate per-token costs so we can compare options on the demo
 * with a $250 USD budget cap.
 *
 * Pricing references (USD per 1M tokens, May 2026 list prices):
 *   - Anthropic Claude on Bedrock, US regions
 *   - Google Gemini direct
 *   - Amazon Nova on Bedrock
 *   - Meta Llama on Bedrock
 *
 * `null` means we have not anchored a verified price. Do NOT advertise that
 * row as cheap without a check.
 *
 * Adding a model to this file does NOT make it callable. The proxy admin must
 * also register the model in LiteLLM's `config.yaml` and the `id` here must
 * match the registered name exactly. Verify with:
 *
 *   curl -H "Authorization: Bearer $LITELLM_API_KEY" "$LITELLM_BASE_URL/models"
 */

/**
 * @typedef {'budget'|'standard'|'premium'} ModelTier
 *
 *   budget    - cheap enough for high-volume scoring (<= $0.50/M in, <= $2/M out)
 *   standard  - default quality (Haiku, Gemini Flash, mid Nova)
 *   premium   - high cost; reserve for accuracy-critical orchestration
 */

/**
 * @typedef {object} ModelEntry
 * @property {string}      id              proxy-registered model id
 * @property {string}      displayName     human label for admin UI
 * @property {string}      family          provider family
 * @property {ModelTier}   tier            cost tier
 * @property {number|null} inputUsdPerM    USD per 1M input tokens
 * @property {number|null} outputUsdPerM   USD per 1M output tokens
 * @property {string}      notes           one-line "when to pick this"
 * @property {boolean}     recommended     true if a good default for AI Assist
 */

/** @type {ModelEntry[]} */
const MODELS = [
  // ---- Anthropic on Bedrock --------------------------------------------------
  {
    id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    displayName: 'Claude Haiku 4.5',
    family: 'anthropic',
    tier: 'standard',
    inputUsdPerM: 1.0,
    outputUsdPerM: 5.0,
    notes: 'Default. Best quality-per-dollar for fraud reasoning. Sub-second on Bedrock.',
    recommended: true,
  },
  {
    id: 'us.anthropic.claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    family: 'anthropic',
    tier: 'standard',
    inputUsdPerM: 3.0,
    outputUsdPerM: 15.0,
    notes: 'Quality bump over Haiku for tricky rule synthesis. 3x cost.',
    recommended: false,
  },
  {
    id: 'us.anthropic.claude-opus-4-6-v1',
    displayName: 'Claude Opus 4.6',
    family: 'anthropic',
    tier: 'premium',
    inputUsdPerM: 5.0,
    outputUsdPerM: 25.0,
    notes: 'Reserved for last-resort accuracy. Not budget-safe at scoring volume.',
    recommended: false,
  },
  {
    id: 'us.anthropic.claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    family: 'anthropic',
    tier: 'premium',
    inputUsdPerM: 5.0,
    outputUsdPerM: 25.0,
    notes: 'Newest Opus. Only for orchestration or deep single-shot reasoning.',
    recommended: false,
  },

  // ---- Google Gemini ---------------------------------------------------------
  {
    id: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    family: 'google',
    tier: 'budget',
    inputUsdPerM: 0.1,
    outputUsdPerM: 0.4,
    notes: 'Cheapest Anthropic-class. Good for nudge copy, weaker structured output.',
    recommended: true,
  },
  {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    family: 'google',
    tier: 'budget',
    inputUsdPerM: 0.3,
    outputUsdPerM: 2.5,
    notes: 'Improved structured output vs 2.5 Flash Lite. Solid Haiku alternative.',
    recommended: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro (preview)',
    family: 'google',
    tier: 'standard',
    inputUsdPerM: 1.25,
    outputUsdPerM: 10.0,
    notes: 'Preview pricing may change. Strong reasoning.',
    recommended: false,
  },

  // ---- Amazon Nova -----------------------------------------------------------
  {
    id: 'nova-micro',
    displayName: 'Amazon Nova Micro',
    family: 'amazon',
    tier: 'budget',
    inputUsdPerM: 0.035,
    outputUsdPerM: 0.14,
    notes: 'Cheapest model on the proxy. Text only, small context.',
    recommended: false,
  },
  {
    id: 'nova-lite',
    displayName: 'Amazon Nova Lite',
    family: 'amazon',
    tier: 'budget',
    inputUsdPerM: 0.06,
    outputUsdPerM: 0.24,
    notes: 'Multimodal Lite. Good cheap fallback if Gemini Flash is rate-limited.',
    recommended: true,
  },
  {
    id: 'nova-pro',
    displayName: 'Amazon Nova Pro',
    family: 'amazon',
    tier: 'standard',
    inputUsdPerM: 0.8,
    outputUsdPerM: 3.2,
    notes: 'Mid Nova. Cheaper than Haiku at slightly lower structured-reasoning quality.',
    recommended: false,
  },

  // ---- Meta Llama on Bedrock ------------------------------------------------
  {
    id: 'llama-3-1-8b',
    displayName: 'Llama 3.1 8B',
    family: 'meta',
    tier: 'budget',
    inputUsdPerM: 0.22,
    outputUsdPerM: 0.22,
    notes: 'Tiny open model. Best for batch classification, not synthesis.',
    recommended: false,
  },
  {
    id: 'llama-3-3-70b',
    displayName: 'Llama 3.3 70B',
    family: 'meta',
    tier: 'budget',
    inputUsdPerM: 0.72,
    outputUsdPerM: 0.72,
    notes: 'Largest Llama on the proxy. Open weights.',
    recommended: false,
  },
];

const DEFAULT_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

function listModels() {
  return MODELS.slice();
}

function findModel(id) {
  return MODELS.find((m) => m.id === id) || null;
}

/**
 * Cost-per-call estimate for a typical classify (~200 in, 60 out).
 *
 * @param {string} id
 * @returns {number|null}
 */
function estimateClassifyCostUsd(id) {
  const m = findModel(id);
  if (!m || m.inputUsdPerM === null || m.outputUsdPerM === null) return null;
  return (m.inputUsdPerM * 200 + m.outputUsdPerM * 60) / 1_000_000;
}

module.exports = {
  MODELS,
  DEFAULT_MODEL_ID,
  listModels,
  findModel,
  estimateClassifyCostUsd,
};
