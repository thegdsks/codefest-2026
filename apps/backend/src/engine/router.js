'use strict';

/**
 * Engine router: turns an L1 draft decision into a final decision.
 *
 * Routing tiers:
 *   1. Clear LOW  (score < 40  AND needsExplanation false): L1 verbatim, no LLM call.
 *   2. Clear HIGH (score > 70  AND needsExplanation false): L1 verbatim, no LLM call.
 *   3. NUDGE action: call llm.writeText; on null fall back to templated default.
 *   4. Gray zone (everything else): call llm.classify; fold L2 verdict in when
 *      confidence > 0.7; on null fall back to L1 verbatim.
 *
 * The router never retries the LLM. Total added latency cap is the LLM
 * module's own 1500 ms AbortController; the router adds no extra delay.
 *
 * DI seam: pass { llm } as the third argument to override the default
 * llm.js module. Used in tests only.
 */

const defaultLlm = require('./llm');
const budget = require('./budget');

const NUDGE_DEFAULT_TEXT = 'Complete your profile to speed up booking';

/**
 * Clamp a numeric score to [0, 100].
 *
 * @param {number} s
 * @returns {number}
 */
function clamp(s) {
  return Math.max(0, Math.min(100, s));
}

/**
 * Build the final decision from the L1 draft plus optional L2 overrides.
 *
 * @param {object} l1Draft
 * @param {object} extras - additional fields to merge in
 * @returns {object}
 */
function finalise(l1Draft, extras) {
  const base = {
    score: clamp(l1Draft.score),
    riskLevel: l1Draft.riskLevel,
    action: l1Draft.action,
    reasonCode: l1Draft.reasonCode,
    reasonText: l1Draft.reasonText,
    category: l1Draft.category,
  };
  return Object.assign(base, extras);
}

/**
 * Return true when the draft is outside the gray zone and LLM classification
 * is not needed.
 *
 * A draft is "clear" when needsExplanation is false AND score is either
 * below 40 (clearly safe) or above 70 (clearly risky).
 *
 * @param {object} draft
 * @returns {boolean}
 */
function isClear(draft) {
  return draft.needsExplanation === false && (draft.score < 40 || draft.score > 70);
}

/**
 * Build the prompt string for the classify call.
 *
 * @param {object} l1Draft
 * @param {object} ctx
 * @returns {string}
 */
function buildClassifyPrompt(l1Draft, ctx) {
  const summary = [
    `category=${l1Draft.category}`,
    `score=${l1Draft.score}`,
    `riskLevel=${l1Draft.riskLevel}`,
    `l1Action=${l1Draft.action}`,
    `reasonCode=${l1Draft.reasonCode}`,
    `userId=${ctx.userId}`,
  ];
  if (ctx.recentActivity) summary.push(`recentActivityCount=${ctx.recentActivity.length}`);
  if (ctx.payload) {
    for (const [k, v] of Object.entries(ctx.payload)) {
      summary.push(`${k}=${v}`);
    }
  }

  return (
    'Classify the fraud risk for this loyalty platform event. ' +
    'Context: ' +
    summary.join(', ') +
    '. ' +
    'Respond with label one of ALLOW|REVIEW|BLOCK|MFA and confidence 0..1. ' +
    'Include a brief rationale field.'
  );
}

/**
 * Build the prompt string for the writeText (nudge) call.
 *
 * @param {object} ctx
 * @returns {string}
 */
function buildNudgePrompt(ctx) {
  const parts = ['Write a short, friendly loyalty app nudge (under 20 words).'];
  if (ctx.missingFields && ctx.missingFields.length > 0) {
    parts.push(`The user is missing: ${ctx.missingFields.join(', ')}.`);
  } else {
    parts.push('The user has an incomplete profile.');
  }
  parts.push('Focus on the benefit of completing their profile, not the gap.');
  return parts.join(' ');
}

/**
 * Route an L1 draft to a final decision, calling L2 (LLM) only when needed.
 *
 * @param {object} l1Draft - output from a rules module
 * @param {object} ctx     - { userId, category, recentActivity?, payload?, missingFields? }
 * @param {{ llm?: object }} [deps] - optional dependency overrides for testing
 * @returns {Promise<object>} final decision
 */
async function route(l1Draft, ctx, deps) {
  const llm = deps && deps.llm ? deps.llm : defaultLlm;
  const routeStart = Date.now();

  // Build the base trace fields carried from the L1 draft.
  // ruleId and ruleName derive from the draft's reasonCode so the drawer
  // can show a human label even for the hardcoded rules modules.
  const l1Trace = {
    ruleId: l1Draft.reasonCode || null,
    ruleName: l1Draft.reasonCode || null,
  };

  // --- Tier 1 and 2: clear cases, no LLM ---
  if (isClear(l1Draft)) {
    return finalise(l1Draft, {
      engineLayer: 'L1',
      latencyMs: Date.now() - routeStart,
      ...l1Trace,
    });
  }

  // --- Tier 3: nudge - generate personalized text ---
  if (l1Draft.action === 'NUDGE') {
    const reservation = budget.tryReserve();
    if (!reservation.ok) {
      // Budget exceeded: skip the LLM call, return default nudge with breaker flag
      return finalise(l1Draft, {
        engineLayer: 'L1',
        generatedText: NUDGE_DEFAULT_TEXT,
        breakerOpen: true,
        latencyMs: Date.now() - routeStart,
        ...l1Trace,
      });
    }
    const prompt = buildNudgePrompt(ctx);
    let result = null;
    try {
      result = await llm.writeText(prompt, { maxTokens: 80 });
    } finally {
      budget.recordResult({
        callId: reservation.callId,
        success: result !== null,
        latencyMs: result ? result.latencyMs : 0,
        model: result ? result.model : 'unknown',
      });
    }
    if (result) {
      return finalise(l1Draft, {
        engineLayer: 'L1+L2',
        generatedText: result.text,
        llmLatencyMs: result.latencyMs,
        llmModel: result.model,
        llmRationale: result.text || null,
        latencyMs: Date.now() - routeStart,
        ...l1Trace,
      });
    }
    // Fall back: templated default, keep L1 attribution
    return finalise(l1Draft, {
      engineLayer: 'L1',
      generatedText: NUDGE_DEFAULT_TEXT,
      latencyMs: Date.now() - routeStart,
      ...l1Trace,
    });
  }

  // --- Tier 4: gray zone - classify with LLM ---
  const reservation = budget.tryReserve();
  if (!reservation.ok) {
    // Budget exceeded: fall back to L1 verbatim with breaker flag
    return finalise(l1Draft, {
      engineLayer: 'L1',
      breakerOpen: true,
      latencyMs: Date.now() - routeStart,
      ...l1Trace,
    });
  }

  const prompt = buildClassifyPrompt(l1Draft, ctx);
  let result = null;
  try {
    result = await llm.classify(prompt);
  } finally {
    budget.recordResult({
      callId: reservation.callId,
      success: result !== null,
      latencyMs: result ? result.latencyMs : 0,
      model: result ? result.model : 'unknown',
    });
  }

  if (!result) {
    // LLM unavailable or timed out: fall back to L1 verbatim
    return finalise(l1Draft, {
      engineLayer: 'L1',
      latencyMs: Date.now() - routeStart,
      ...l1Trace,
    });
  }

  // Fold L2 verdict in
  let finalAction = l1Draft.action;
  const label = result.label ? String(result.label).toUpperCase() : '';

  if (label === 'BLOCK' && result.confidence > 0.7) {
    finalAction = 'BLOCK';
  } else if (label === 'ALLOW' && result.confidence > 0.7) {
    finalAction = 'ALLOW';
  }
  // Otherwise keep the L1 action

  // Capture the LLM rationale only when it's a real classify result
  // (not the rule-only sentinel which has no rationale field).
  const llmRationale = result && typeof result.rationale === 'string' ? result.rationale : null;

  return finalise(l1Draft, {
    action: finalAction,
    engineLayer: 'L1+L2',
    llmLatencyMs: result.latencyMs,
    llmModel: result.model,
    llmRationale,
    latencyMs: Date.now() - routeStart,
    ...l1Trace,
  });
}

module.exports = { route };
