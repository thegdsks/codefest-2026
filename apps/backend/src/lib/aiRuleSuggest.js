'use strict';

/**
 * lib/aiRuleSuggest.js
 *
 * Turn a natural-language description into a draft engagement rule (JSON shape
 * compatible with EngagementRuleDefinition). The caller (an admin endpoint)
 * wraps the result in an HTTP response and decides whether to persist it.
 *
 * Required env vars (same as engine/llm.js):
 *   LITELLM_BASE_URL
 *   LITELLM_API_KEY
 * Optional:
 *   LITELLM_MODEL  (default: claude-haiku-4-5)
 *
 * If either required env var is absent, suggestRule returns null immediately.
 * Network/schema/timeout errors also return null so callers can degrade
 * gracefully (a 503 from the route is the right response).
 *
 * Timeout: 3000 ms. Rule synthesis takes longer than classify (more output
 * tokens) so we give it 2x the budget.
 *
 * EMF metric: SignalForce/RuleAiSuggest. We never log the natural-language
 * input -- it could contain operator notes, drafts, or anything else.
 */

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateObject, generateText } = require('ai');
const { z } = require('zod');

const DEFAULT_MODEL = 'claude-haiku-4-5';
const TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Zod schema for the AI-generated rule draft
// ---------------------------------------------------------------------------

const RuleDraftSchema = z.object({
  name: z.string().max(80),
  conditions: z.object({
    all: z
      .array(
        z.object({
          fact: z.string(),
          operator: z.enum([
            'equal',
            'notEqual',
            'greaterThan',
            'greaterThanInclusive',
            'lessThan',
            'lessThanInclusive',
            'in',
            'contains',
          ]),
          value: z.union([z.string(), z.number(), z.boolean()]),
        })
      )
      .default([]),
  }),
  event: z.object({
    type: z.string(),
    params: z.object({
      action: z.enum(['ALLOW', 'NUDGE', 'OFFER', 'HINT', 'BLOCK', 'REVIEW', 'MFA']),
      surface: z
        .enum(['nudge_banner', 'offer_modal', 'help_tooltip', 'inline_help_tooltip', 'none'])
        .default('nudge_banner'),
      score: z.number().min(0).max(100),
      copy: z.string().max(200),
    }),
  }),
  explanation: z.string().max(300),
});

// ---------------------------------------------------------------------------
// Provider injection seam (mirrors engine/llm.js)
// ---------------------------------------------------------------------------

/** @type {{ generateObject: Function, generateText: Function } | null} */
let _injectedProvider = null;

function _setProvider(p) {
  _injectedProvider = p;
}

// ---------------------------------------------------------------------------
// Config + model construction
// ---------------------------------------------------------------------------

function readConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const model = process.env.LITELLM_MODEL || DEFAULT_MODEL;
  return { baseUrl, apiKey, model };
}

function buildModel(cfg) {
  const provider = createOpenAICompatible({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    name: 'litellm',
  });
  return provider(cfg.model);
}

// ---------------------------------------------------------------------------
// EMF metric (CloudWatch auto-extracts when this lands in the log stream)
// ---------------------------------------------------------------------------

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
              { Name: 'RuleAiSuggest', Unit: 'Count' },
              { Name: 'RuleAiSuggestLatencyMs', Unit: 'Milliseconds' },
            ],
          },
        ],
      },
      Model: model,
      Outcome: outcome,
      RuleAiSuggest: 1,
      RuleAiSuggestLatencyMs: latencyMs,
    })
  );
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATE = [
  'You convert a natural-language description of customer behavior into a JSON',
  'engagement rule for the Signal Force loyalty platform.',
  '',
  'Output a JSON object that matches the documented schema (the caller validates',
  'it with Zod). Use ONLY these fact names in conditions:',
  '  signal       string  one of: rage_click, dwell_no_action, abandoned_flow_step,',
  '                       repeated_query, points_balance_stare',
  '  userId       string  the customer id',
  '  target       string  what was clicked or focused (e.g. "points_balance")',
  '  dwellMs      number  milliseconds of inactivity on an element',
  '  clickCount   number  number of repeated clicks',
  '  flow         string  name of the abandoned flow (e.g. "transfer")',
  '  step         string  the step within a flow',
  '  query        string  the user query that was repeated',
  '  count        number  generic count of repetitions',
  '',
  'Use only these operators:',
  '  equal, notEqual, greaterThan, greaterThanInclusive, lessThan,',
  '  lessThanInclusive, in, contains',
  '',
  'Use these action values: ALLOW, NUDGE, OFFER, HINT, BLOCK, REVIEW, MFA.',
  'Use these surface values: nudge_banner, offer_modal, help_tooltip,',
  'inline_help_tooltip, none. Score is an integer 0-100.',
  '',
  'EXAMPLE 1',
  'Description: "If a user stares at the points balance for more than 8 seconds, show a points-transfer nudge."',
  'Output:',
  '{',
  '  "name": "Points balance stare - nudge",',
  '  "conditions": { "all": [',
  '    { "fact": "signal", "operator": "equal", "value": "points_balance_stare" },',
  '    { "fact": "dwellMs", "operator": "greaterThanInclusive", "value": 8000 }',
  '  ] },',
  '  "event": { "type": "points-balance-stare-nudge", "params": {',
  '    "action": "NUDGE", "surface": "nudge_banner", "score": 60,',
  '    "copy": "Looking at your points balance? Tap to see what you can do with them."',
  '  } },',
  '  "explanation": "Triggers when a user lingers on their points balance, suggesting they want to act on it."',
  '}',
  '',
  'EXAMPLE 2',
  'Description: "If a user rage-clicks the transfer button three or more times, offer help."',
  'Output:',
  '{',
  '  "name": "Rage click on transfer - help tooltip",',
  '  "conditions": { "all": [',
  '    { "fact": "signal", "operator": "equal", "value": "rage_click" },',
  '    { "fact": "target", "operator": "equal", "value": "transfer_button" },',
  '    { "fact": "clickCount", "operator": "greaterThanInclusive", "value": 3 }',
  '  ] },',
  '  "event": { "type": "rage-click-transfer-help", "params": {',
  '    "action": "HINT", "surface": "inline_help_tooltip", "score": 50,',
  '    "copy": "Trouble with the transfer? Tap here for help."',
  '  } },',
  '  "explanation": "Triggers when a user repeatedly clicks the transfer button, suggesting friction."',
  '}',
  '',
  'Now convert the following description. Reply with only the JSON object.',
].join('\n');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Suggest a rule draft from a natural-language description.
 *
 * @param {string} naturalLanguage - description of the behavior to encode
 * @returns {Promise<object|null>} validated rule draft, or null on any failure
 */
async function suggestRule(naturalLanguage) {
  const cfg = readConfig();
  if (!cfg) return null;
  if (typeof naturalLanguage !== 'string' || naturalLanguage.trim().length === 0) {
    return null;
  }

  const startMs = Date.now();
  const sdkFns = _injectedProvider || { generateObject, generateText };

  try {
    const model = _injectedProvider ? null : buildModel(cfg);

    const { object } = await sdkFns.generateObject({
      model,
      schema: RuleDraftSchema,
      prompt: `${PROMPT_TEMPLATE}\n\nDescription: ${naturalLanguage}`,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // Re-validate explicitly: when a test seam returns a malformed object the
    // SDK may not enforce the schema, so we run it through Zod ourselves.
    const validated = RuleDraftSchema.parse(object);

    const latencyMs = Date.now() - startMs;
    emitEmfMetric(cfg.model, 'success', latencyMs);
    return validated;
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      console.error(`[aiRuleSuggest] timed out after ${latencyMs}ms`);
    } else if (err && err.name === 'ZodError') {
      console.error('[aiRuleSuggest] schema validation failed');
    } else {
      const name = (err && err.name) || 'Error';
      const message = (err && err.message) || 'unknown';
      console.error(`[aiRuleSuggest] error class=${name} message=${message}`);
    }
    emitEmfMetric(cfg.model, 'error', latencyMs);
    return null;
  }
}

module.exports = { suggestRule, _setProvider };
