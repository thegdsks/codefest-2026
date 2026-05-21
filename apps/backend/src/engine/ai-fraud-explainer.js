'use strict';

/**
 * AI Fraud Explainer
 *
 * For BLOCK / REVIEW / MFA fraud decisions, generates a plain-English
 * narrative that explains what the risk signals were and what an analyst
 * should do next.
 *
 * Called synchronously in the decision pipeline with a hard 2s timeout.
 * If the LLM exceeds that budget the function returns null and the decision
 * proceeds without an explanation. The caller stores whatever comes back on
 * the decision record under the `aiExplanation` key.
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject } = require('ai');
const { z } = require('zod');

const budget = require('./budget');

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const FraudExplanationSchema = z.object({
  paragraph: z.string().max(1200),
  riskFactors: z.array(z.string().max(200)).max(6),
  recommendation: z.string().max(300),
});

// ---------------------------------------------------------------------------
// DI seam for tests
// ---------------------------------------------------------------------------

/** @type {{ generateObject: Function } | null} */
let _injectedProvider = null;

function _setProvider(p) {
  _injectedProvider = p;
}

// ---------------------------------------------------------------------------
// Config helpers
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
 * @param {string} params.decisionType - FRAUD_TRANSFER | FRAUD_LOGIN
 * @param {string} params.action       - BLOCK | REVIEW | MFA
 * @param {number} params.score
 * @param {string} params.reasonCode
 * @param {string} params.reasonText
 * @param {object} params.context      - transfer or login context fields
 * @param {object[]} params.priorDecisions - recent decisions in last 24h
 * @returns {string}
 */
function buildPrompt({
  decisionType,
  action,
  score,
  reasonCode,
  reasonText,
  context,
  priorDecisions,
}) {
  const contextLines = Object.entries(context || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `  ${k}=${v}`)
    .join('\n');

  const priorSummary =
    priorDecisions && priorDecisions.length > 0
      ? `${priorDecisions.length} decision(s) in last 24h: ` +
        priorDecisions
          .slice(0, 5)
          .map((d) => `${d.decisionType}=${d.action}(score=${d.score})`)
          .join(', ')
      : 'No prior decisions in the last 24h.';

  return (
    'You are a fraud analyst assistant for a loyalty points platform. Explain the following fraud decision in plain English.\n\n' +
    'Decision:\n' +
    `  type=${decisionType} action=${action} score=${score} reasonCode=${reasonCode}\n` +
    `  reasonText="${reasonText}"\n\n` +
    'Context:\n' +
    `${contextLines || '  (none)'}\n\n` +
    'User history:\n' +
    `  ${priorSummary}\n\n` +
    'Write:\n' +
    '- paragraph: 2-4 sentences in plain English suitable for a fraud analyst or product manager. Describe what happened, why it was flagged, and how confident the system is.\n' +
    `- riskFactors: bullet list of specific signals that contributed (e.g. "Transfer amount $8,000 exceeds 24h pattern", "Device not seen before").\n` +
    '- recommendation: one sentence telling the analyst what to do next (review account, contact member, auto-block, etc.).\n\n' +
    'Be factual. Do not speculate beyond the data provided.'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured fraud explanation for a decision.
 *
 * Returns null when:
 *   - LLM env vars are missing
 *   - Budget guard is tripped
 *   - LLM times out (2s hard limit)
 *   - LLM returns an error
 *
 * @param {object} params
 * @param {string} params.decisionType
 * @param {string} params.action
 * @param {number} params.score
 * @param {string} params.reasonCode
 * @param {string} params.reasonText
 * @param {object} [params.context]
 * @param {object[]} [params.priorDecisions]
 * @returns {Promise<{ paragraph: string, riskFactors: string[], recommendation: string } | null>}
 */
async function explain({
  decisionType,
  action,
  score,
  reasonCode,
  reasonText,
  context,
  priorDecisions,
}) {
  const cfg = readConfig();
  if (!cfg) return null;

  const reservation = budget.tryReserve();
  if (!reservation.ok) {
    console.error('[ai-fraud-explainer] budget exhausted, skipping explanation');
    return null;
  }

  const prompt = buildPrompt({
    decisionType,
    action,
    score: score || 0,
    reasonCode: reasonCode || '',
    reasonText: reasonText || '',
    context: context || {},
    priorDecisions: priorDecisions || [],
  });

  const start = Date.now();

  try {
    const sdkFns = _injectedProvider || { generateObject };
    const model = _injectedProvider ? null : buildModel(cfg, cfg.primaryModel);

    const { object } = await sdkFns.generateObject({
      model,
      schema: FraudExplanationSchema,
      prompt,
      abortSignal: AbortSignal.timeout(2000),
    });

    const latencyMs = Date.now() - start;
    budget.recordResult({
      callId: reservation.callId,
      success: true,
      latencyMs,
      model: cfg.primaryModel,
    });
    return object;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorCode = err?.name ? err.name : 'UnknownError';
    console.error(
      JSON.stringify({
        msg: '[ai-fraud-explainer] LLM call failed',
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

module.exports = { explain, _setProvider };
