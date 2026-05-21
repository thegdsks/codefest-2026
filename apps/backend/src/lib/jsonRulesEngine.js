'use strict';

/**
 * jsonRulesEngine.js
 *
 * Thin wrapper around json-rules-engine. Takes a list of rule documents loaded
 * from EngagementRules DDB and an event object, evaluates all rules, and
 * returns a structured result suitable for the engagement route.
 *
 * Return shape:
 *   {
 *     matched: [{ ruleId, action, surface, params }],
 *     score:   number (0-100, highest matched rule score),
 *     escalate: boolean (true when score is in the grey zone 40-70)
 *   }
 *
 * Rule document shape (stored in DDB):
 *   {
 *     ruleId:     string,
 *     version:    string,
 *     status:     'ACTIVE' | 'DRAFT' | 'ARCHIVED',
 *     name:       string,
 *     definition: {
 *       conditions: { all?: Condition[], any?: Condition[] },
 *       event:      { type: string, params: { action, surface, score, ...rest } }
 *     }
 *   }
 *
 * json-rules-engine condition fact names map to flattened event properties.
 * e.g. condition { fact: 'dwellMs', operator: 'greaterThan', value: 8000 }
 *      matches when the event's facts contain dwellMs > 8000.
 */

const { Engine } = require('json-rules-engine');

const GREY_ZONE_LOW = 40;
const GREY_ZONE_HIGH = 70;

/**
 * Convert a rule document from DDB into a json-rules-engine rule descriptor.
 *
 * @param {object} ruleDoc
 * @returns {object}
 */
function toEngineRule(ruleDoc) {
  const def = ruleDoc.definition || {};
  return {
    name: ruleDoc.ruleId,
    conditions: def.conditions || { all: [] },
    event: {
      type: ruleDoc.ruleId,
      params: {
        ruleId: ruleDoc.ruleId,
        action: (def.event && def.event.params && def.event.params.action) || 'ALLOW',
        surface: (def.event && def.event.params && def.event.params.surface) || 'nudge_banner',
        score: (def.event && def.event.params && def.event.params.score) || 0,
        ...(def.event && def.event.params ? def.event.params : {}),
      },
    },
    priority: (def.event && def.event.params && def.event.params.score) || 0,
  };
}

/**
 * Evaluate a list of active rule documents against a flat facts object.
 *
 * @param {object[]} ruleDocs  - ACTIVE rule documents from EngagementRules
 * @param {object}   facts     - flat key/value map derived from the event
 * @returns {Promise<{ matched: object[], score: number, escalate: boolean }>}
 */
async function evaluate(ruleDocs, facts) {
  if (!ruleDocs || ruleDocs.length === 0) {
    return { matched: [], score: 0, escalate: false };
  }

  const engine = new Engine([], { allowUndefinedFacts: true });

  for (const doc of ruleDocs) {
    try {
      engine.addRule(toEngineRule(doc));
    } catch (_) {
      // Malformed rule: skip rather than crashing the whole event
    }
  }

  const { results } = await engine.run(facts);

  /** @type {Array<{ ruleId: string, action: string, surface: string, params: object }>} */
  const matched = results.map((r) => {
    const p = r.event.params || {};
    return {
      ruleId: p.ruleId || r.event.type,
      action: p.action || 'ALLOW',
      surface: p.surface || 'nudge_banner',
      params: p,
    };
  });

  // Score: take the highest score across matched rules, or 0 when nothing fired.
  let score = 0;
  for (const m of matched) {
    const s = typeof m.params.score === 'number' ? m.params.score : 0;
    if (s > score) score = s;
  }

  const escalate = score >= GREY_ZONE_LOW && score <= GREY_ZONE_HIGH;

  return { matched, score, escalate };
}

module.exports = { evaluate };
