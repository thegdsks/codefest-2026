'use strict';

/**
 * Admin AI config endpoint.
 *
 * Exports: getAiConfig
 */

const {
  listModels,
  findModel,
  DEFAULT_MODEL_ID,
  estimateClassifyCostUsd,
} = require('../../lib/aiModels');
const { json, requireAdmin } = require('./shared');

/**
 * GET /admin/ai-config
 *
 * Returns the curated LLM catalog plus the currently active model resolved
 * from env. Read-only for v1; a follow-up will add PUT to persist a choice
 * in DDB. Useful even read-only so the Settings UI can show which models are
 * safe under the demo budget cap.
 *
 * @param {object} event
 * @param {string} correlationId
 * @returns {object}
 */
function getAiConfig(event, correlationId) {
  const gate = requireAdmin(event, correlationId);
  if (!gate.ok) return gate.response;

  const activeId = process.env.LITELLM_MODEL || DEFAULT_MODEL_ID;
  const active = findModel(activeId);
  const proxyConfigured = !!(process.env.LITELLM_BASE_URL && process.env.LITELLM_API_KEY);

  const models = listModels().map((m) => ({
    ...m,
    classifyCostUsd: estimateClassifyCostUsd(m.id),
    active: m.id === activeId,
  }));

  return json(200, correlationId, {
    proxyConfigured,
    activeModelId: activeId,
    activeModelKnown: active !== null,
    defaultModelId: DEFAULT_MODEL_ID,
    models,
  });
}

module.exports = { getAiConfig };
