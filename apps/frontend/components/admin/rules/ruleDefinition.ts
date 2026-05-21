import type { RuleAction, RuleCondition, RuleConditionGroup } from '@/lib/rules-api';

/**
 * Backend json-rules-engine shape that the Lambda's putRule handler expects.
 * Mirrors seed_data/EngagementRules_batch_1.json.
 */
export interface RuleDefinition {
  conditions: { all: BackendCondition[] };
  event: {
    type: string;
    params: {
      action: string;
      surface: string;
      score: number;
      copy: string;
    };
  };
}

interface BackendCondition {
  fact: string;
  operator: string;
  value: string | number | boolean;
}

const OPERATOR_MAP: Record<string, string> = {
  '=': 'equal',
  '!=': 'notEqual',
  '>': 'greaterThan',
  '>=': 'greaterThanInclusive',
  '<': 'lessThan',
  '<=': 'lessThanInclusive',
  contains: 'contains',
  beginsWith: 'contains',
};

/**
 * Frontend field name (from QueryBuilderConfig.ts) to a list of backend
 * conditions. Most signal fields expand to two conditions: a signal scope
 * plus the parameter check. User-attribute fields map 1:1.
 */
interface FieldMapEntry {
  fact: string;
  signalScope?: string;
}

const FIELD_MAP: Record<string, FieldMapEntry> = {
  rage_click_count: { fact: 'clickCount', signalScope: 'rage_click' },
  rage_click_window: { fact: 'windowMs', signalScope: 'rage_click' },
  dwell_no_action_threshold_ms: { fact: 'dwellMs', signalScope: 'dwell_no_action' },
  abandoned_flow_step: { fact: 'step', signalScope: 'abandoned_flow_step' },
  abandoned_flow_id: { fact: 'flow', signalScope: 'abandoned_flow_step' },
  repeated_query_count: { fact: 'count', signalScope: 'repeated_query' },
  repeated_query_term: { fact: 'query', signalScope: 'repeated_query' },
  points_balance_stare_threshold_ms: { fact: 'dwellMs', signalScope: 'points_balance_stare' },
  tier: { fact: 'tier' },
  loyaltyScore: { fact: 'loyaltyScore' },
  emailVerified: { fact: 'emailVerified' },
};

const SURFACE_MAP: Record<string, string> = {
  banner: 'nudge_banner',
  modal: 'offer_modal',
  tooltip: 'inline_help_tooltip',
};

function flattenConditions(group: RuleConditionGroup): BackendCondition[] {
  const out: BackendCondition[] = [];
  const seenScopes = new Set<string>();

  function visit(g: RuleConditionGroup): void {
    for (const item of g.rules) {
      if ('combinator' in item) {
        visit(item as RuleConditionGroup);
        continue;
      }
      const rule = item as RuleCondition;
      const meta = FIELD_MAP[rule.field];
      if (!meta) continue;
      if (meta.signalScope && !seenScopes.has(meta.signalScope)) {
        seenScopes.add(meta.signalScope);
        out.push({ fact: 'signal', operator: 'equal', value: meta.signalScope });
      }
      const op = OPERATOR_MAP[rule.operator] || rule.operator;
      out.push({ fact: meta.fact, operator: op, value: rule.value });
    }
  }

  visit(group);
  return out;
}

/**
 * Build the backend rule definition from frontend form state.
 *
 * Conditions: flatten WHEN + WHO into a single conditions.all array, with
 * an injected signal=<scope> condition for each unique signal-specific
 * field referenced.
 *
 * Event params: actionType -> action, surface -> backend surface vocab,
 * score (default 50), fallbackCopy -> copy.
 */
export function toDefinition(input: {
  name: string;
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  action: RuleAction;
}): RuleDefinition {
  const all = [
    ...flattenConditions(input.whenConditions),
    ...flattenConditions(input.whoConditions),
  ];

  const action =
    input.action.actionType && input.action.actionType !== 'CUSTOM'
      ? input.action.actionType
      : 'NUDGE';

  const surface = SURFACE_MAP[input.action.surface] || 'nudge_banner';

  const eventType =
    input.name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'CUSTOM_RULE';

  return {
    conditions: { all },
    event: {
      type: eventType,
      params: {
        action,
        surface,
        score: typeof input.action.score === 'number' ? input.action.score : 50,
        copy: input.action.fallbackCopy || '',
      },
    },
  };
}
