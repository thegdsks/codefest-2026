'use strict';

/**
 * Thin wrapper around the Marriott-hosted LiteLLM proxy, using the Vercel AI SDK
 * with the @ai-sdk/openai-compatible provider. LiteLLM speaks OpenAI wire format.
 *
 * Required env vars:
 *   LITELLM_BASE_URL  - base URL of the proxy (no trailing slash)
 *   LITELLM_API_KEY   - Bearer token for the proxy
 *
 * Optional env vars:
 *   LITELLM_MODEL     - model name to pass in the request body (default: claude-haiku-4-5)
 *
 * If either required var is absent, both methods return null immediately
 * without attempting a network call. This allows the app to run in a
 * rules-only mode until credentials are available.
 *
 * Timeout: 1500 ms via AbortSignal.timeout(). No retries. On timeout or
 * any error the method returns null.
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject, generateText } = require('ai');
const { z } = require('zod');

const DEFAULT_MODEL = 'claude-haiku-4-5';

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
 * Read the three env vars. Returns null when required ones are missing.
 *
 * @returns {{ baseUrl: string, apiKey: string, model: string } | null}
 */
function readConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const model = process.env.LITELLM_MODEL || DEFAULT_MODEL;
  return { baseUrl, apiKey, model };
}

/**
 * Build a LiteLLM-compatible language model reference using the real SDK.
 *
 * @param {{ baseUrl: string, apiKey: string, model: string }} cfg
 * @returns {object} language model object for generateObject/generateText
 */
function buildModel(cfg) {
  const provider = createOpenAICompatible({
    baseURL: `${cfg.baseUrl}`,
    apiKey: cfg.apiKey,
    name: 'litellm',
  });
  return provider(cfg.model);
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a classification prompt to the LLM and return a validated result.
 *
 * Uses generateObject with a Zod schema so the response is structurally
 * guaranteed (label, confidence, rationale). Any error (network, timeout,
 * schema mismatch) causes a null return with an EMF error metric.
 *
 * @param {string} prompt - the event description to classify
 * @param {object} [_schema] - reserved for future use; ignored
 * @returns {Promise<{
 *   label: string,
 *   confidence: number,
 *   rationale: string,
 *   latencyMs: number,
 *   model: string
 * } | null>}
 */
async function classify(prompt, _schema) {
  const cfg = readConfig();
  if (!cfg) return null;

  const startMs = Date.now();
  const sdkFns = _injectedProvider || { generateObject, generateText };

  try {
    const model = _injectedProvider ? null : buildModel(cfg);

    const { object } = await sdkFns.generateObject({
      model,
      schema: ClassifySchema,
      prompt,
      abortSignal: AbortSignal.timeout(1500),
    });

    const latencyMs = Date.now() - startMs;
    emitEmfMetric(cfg.model, 'success', latencyMs);

    return {
      label: object.label,
      confidence: object.confidence,
      rationale: object.rationale,
      latencyMs,
      model: cfg.model,
    };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      console.error(`[llm] classify timed out after ${latencyMs}ms`);
    } else {
      console.error(`[llm] classify error class=${err.name} message=${err.message}`);
    }
    emitEmfMetric(cfg.model, 'error', latencyMs);
    return null;
  }
}

/**
 * Generate a short text string (for nudges, messages, etc.).
 *
 * @param {string} prompt - instruction describing the desired output
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<{ text: string, latencyMs: number, model: string } | null>}
 */
async function writeText(prompt, opts) {
  const cfg = readConfig();
  if (!cfg) return null;

  const startMs = Date.now();
  const sdkFns = _injectedProvider || { generateObject, generateText };

  try {
    const model = _injectedProvider ? null : buildModel(cfg);

    const { text } = await sdkFns.generateText({
      model,
      prompt,
      abortSignal: AbortSignal.timeout(1500),
      maxTokens: opts?.maxTokens ?? 80,
    });

    const latencyMs = Date.now() - startMs;
    emitEmfMetric(cfg.model, 'success', latencyMs);

    return {
      text,
      latencyMs,
      model: cfg.model,
    };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      console.error(`[llm] writeText timed out after ${latencyMs}ms`);
    } else {
      console.error(`[llm] writeText error class=${err.name} message=${err.message}`);
    }
    emitEmfMetric(cfg.model, 'error', latencyMs);
    return null;
  }
}

module.exports = { classify, writeText, _setProvider };
