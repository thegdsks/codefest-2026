'use strict';

/**
 * Thin wrapper around the hosted LiteLLM proxy, using the Vercel AI SDK
 * with the @ai-sdk/openai-compatible provider. LiteLLM speaks OpenAI wire format.
 *
 * Required env vars:
 *   LITELLM_BASE_URL  - base URL of the proxy (no trailing slash)
 *   LITELLM_API_KEY   - Bearer token for the proxy
 *
 * Optional env vars:
 *   LITELLM_MODEL              - primary model name (default: claude-haiku-4-5)
 *   LITELLM_FALLBACK_MODELS    - comma-separated fallback models tried in order
 *   LITELLM_TIMEOUT_MS         - per-attempt timeout in ms (default: 8000)
 *   LITELLM_TOTAL_BUDGET_MS    - total wall-clock budget across all attempts (default: 15000)
 *
 * If either required var is absent, both methods return null immediately
 * without attempting a network call. This allows the app to run in a
 * rules-only mode until credentials are available.
 *
 * Fallback behaviour:
 *   1. Try the primary model (LITELLM_MODEL).
 *   2. On failure (network error, 4xx, 5xx, timeout), log structured error
 *      fields ({ model, errorCode, latencyMs }) and try the next model in
 *      LITELLM_FALLBACK_MODELS.
 *   3. Stop trying if LITELLM_TOTAL_BUDGET_MS has elapsed, even if fallbacks remain.
 *   4. If all models fail, classify() returns the rule-only sentinel object;
 *      writeText() returns null so callers can render an "AI Assist unavailable" badge.
 *
 * Rule-only sentinel shape:
 *   { source: "rule-only-fallback", reason: "all-llm-models-unavailable" }
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject, generateText } = require('ai');
const { z } = require('zod');

const { DEFAULT_MODEL_ID } = require('../lib/aiModels');
const { CFG } = require('../lib/config');

const DEFAULT_MODEL = DEFAULT_MODEL_ID;

// ---------------------------------------------------------------------------
// Zod schema for classify responses
// ---------------------------------------------------------------------------

const ClassifySchema = z.object({
  label: z.enum(['ALLOW', 'REVIEW', 'BLOCK', 'MFA']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(200),
});

// ---------------------------------------------------------------------------
// Internal provider state. _setProvider() is the DI seam for tests.
// In production the provider is created lazily from env vars.
// Tests can inject a fake { generateObject, generateText } to avoid real HTTP.
// ---------------------------------------------------------------------------

/** @type {{ generateObject: Function, generateText: Function } | null} */
let _injectedProvider = null;

/**
 * Override the SDK functions used internally. Pass null to revert to real SDK.
 * Exported only for use in tests.
 *
 * @param {{ generateObject: Function, generateText: Function } | null} p
 */
function _setProvider(p) {
  _injectedProvider = p;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Read the base env vars. Returns null when required ones are missing.
 *
 * @returns {{ baseUrl: string, apiKey: string, primaryModel: string, fallbackModels: string[], timeoutMs: number, totalBudgetMs: number } | null}
 */
function readConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const primaryModel = process.env.LITELLM_MODEL || DEFAULT_MODEL;
  return {
    baseUrl,
    apiKey,
    primaryModel,
    fallbackModels: CFG.litellmFallbackModels,
    timeoutMs: CFG.litellmTimeoutMs,
    totalBudgetMs: CFG.litellmTotalBudgetMs,
  };
}

/**
 * Build a LiteLLM-compatible language model reference using the real SDK.
 *
 * @param {{ baseUrl: string, apiKey: string }} cfg
 * @param {string} modelId
 * @returns {object} language model object for generateObject/generateText
 */
function buildModel(cfg, modelId) {
  const provider = createOpenAICompatible({
    baseURL: `${cfg.baseUrl}`,
    apiKey: cfg.apiKey,
    name: 'litellm',
  });
  return provider(modelId);
}

// ---------------------------------------------------------------------------
// EMF metric emission (shape must stay identical - CloudWatch alarm depends on it)
// ---------------------------------------------------------------------------

/**
 * Emit a single EMF-formatted log line so CloudWatch auto-extracts the metric
 * without a PutMetricData call.
 *
 * Namespace: SignalForce
 * Metrics: LLMInvocations (Count), LLMLatencyMs (Milliseconds)
 * Dimensions: Model, Outcome
 *
 * IMPORTANT: do NOT include user prompts, response content, or any PII here.
 *
 * @param {string} model
 * @param {'success'|'error'} outcome
 * @param {number} latencyMs
 */
function emitEmfMetric(model, outcome, latencyMs) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'SignalForce',
            Dimensions: [['Model', 'Outcome']],
            Metrics: [
              { Name: 'LLMInvocations', Unit: 'Count' },
              { Name: 'LLMLatencyMs', Unit: 'Milliseconds' },
            ],
          },
        ],
      },
      Model: model,
      Outcome: outcome,
      LLMInvocations: 1,
      LLMLatencyMs: latencyMs,
    })
  );
}

// ---------------------------------------------------------------------------
// Internal: attempt a single classify call against one model
// ---------------------------------------------------------------------------

/**
 * @param {string} model
 * @param {string} prompt
 * @param {object} cfg
 * @param {object} sdkFns
 * @returns {Promise<{ object: object } | null>} raw SDK result or null on error
 */
async function _attemptClassify(model, prompt, cfg, sdkFns, timeoutMs) {
  const langModel = _injectedProvider ? null : buildModel(cfg, model);
  return sdkFns.generateObject({
    model: langModel,
    schema: ClassifySchema,
    prompt,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * @param {string} model
 * @param {string} prompt
 * @param {{ maxTokens?: number }} opts
 * @param {object} cfg
 * @param {object} sdkFns
 * @param {number} timeoutMs
 * @returns {Promise<{ text: string } | null>} raw SDK result or null on error
 */
async function _attemptWriteText(model, prompt, opts, cfg, sdkFns, timeoutMs) {
  const langModel = _injectedProvider ? null : buildModel(cfg, model);
  return sdkFns.generateText({
    model: langModel,
    prompt,
    abortSignal: AbortSignal.timeout(timeoutMs),
    maxTokens: opts?.maxTokens ?? 80,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a classification prompt to the LLM and return a validated result.
 *
 * Tries the primary model first, then each fallback in order. Stops when
 * LITELLM_TOTAL_BUDGET_MS is exhausted. Returns a rule-only sentinel object
 * when all models fail, so callers can render an honest "AI Assist unavailable"
 * badge instead of crashing.
 *
 * @param {string} prompt - the event description to classify
 * @param {object} [_schema] - reserved for future use; ignored
 * @returns {Promise<{
 *   label: string,
 *   confidence: number,
 *   rationale: string,
 *   latencyMs: number,
 *   model: string
 * } | { source: 'rule-only-fallback', reason: 'all-llm-models-unavailable' } | null>}
 */
async function classify(prompt, _schema) {
  const cfg = readConfig();
  if (!cfg) return null;

  const budgetStart = Date.now();
  const sdkFns = _injectedProvider || { generateObject, generateText };
  const models = [cfg.primaryModel, ...cfg.fallbackModels];

  for (const model of models) {
    const elapsed = Date.now() - budgetStart;
    if (elapsed >= cfg.totalBudgetMs) {
      console.error(
        JSON.stringify({
          msg: '[llm] classify: total budget exhausted before trying model',
          model,
          elapsedMs: elapsed,
          totalBudgetMs: cfg.totalBudgetMs,
        })
      );
      break;
    }

    const attemptStart = Date.now();
    try {
      const { object } = await _attemptClassify(model, prompt, cfg, sdkFns, cfg.timeoutMs);
      const latencyMs = Date.now() - attemptStart;
      emitEmfMetric(model, 'success', latencyMs);
      return {
        label: object.label,
        confidence: object.confidence,
        rationale: object.rationale,
        latencyMs,
        model,
      };
    } catch (err) {
      const latencyMs = Date.now() - attemptStart;
      const errorCode = err.name || 'UnknownError';
      console.error(
        JSON.stringify({
          msg: '[llm] classify attempt failed',
          model,
          errorCode,
          latencyMs,
        })
      );
      emitEmfMetric(model, 'error', latencyMs);
    }
  }

  // All models exhausted or budget blown - return rule-only sentinel
  console.error(
    JSON.stringify({
      msg: '[llm] classify: all models failed, returning rule-only fallback',
      totalElapsedMs: Date.now() - budgetStart,
    })
  );
  return { source: 'rule-only-fallback', reason: 'all-llm-models-unavailable' };
}

/**
 * Generate a short text string (for nudges, messages, etc.).
 *
 * Tries the primary model first, then each fallback in order. Returns null
 * when all models fail so callers can use a static template instead.
 *
 * @param {string} prompt - instruction describing the desired output
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<{ text: string, latencyMs: number, model: string } | null>}
 */
async function writeText(prompt, opts) {
  const cfg = readConfig();
  if (!cfg) return null;

  const budgetStart = Date.now();
  const sdkFns = _injectedProvider || { generateObject, generateText };
  const models = [cfg.primaryModel, ...cfg.fallbackModels];

  for (const model of models) {
    const elapsed = Date.now() - budgetStart;
    if (elapsed >= cfg.totalBudgetMs) {
      console.error(
        JSON.stringify({
          msg: '[llm] writeText: total budget exhausted before trying model',
          model,
          elapsedMs: elapsed,
          totalBudgetMs: cfg.totalBudgetMs,
        })
      );
      break;
    }

    const attemptStart = Date.now();
    try {
      const { text } = await _attemptWriteText(model, prompt, opts, cfg, sdkFns, cfg.timeoutMs);
      const latencyMs = Date.now() - attemptStart;
      emitEmfMetric(model, 'success', latencyMs);
      return { text, latencyMs, model };
    } catch (err) {
      const latencyMs = Date.now() - attemptStart;
      const errorCode = err.name || 'UnknownError';
      console.error(
        JSON.stringify({
          msg: '[llm] writeText attempt failed',
          model,
          errorCode,
          latencyMs,
        })
      );
      emitEmfMetric(model, 'error', latencyMs);
    }
  }

  // All models exhausted
  console.error(
    JSON.stringify({
      msg: '[llm] writeText: all models failed',
      totalElapsedMs: Date.now() - budgetStart,
    })
  );
  return null;
}

module.exports = { classify, writeText, _setProvider };
