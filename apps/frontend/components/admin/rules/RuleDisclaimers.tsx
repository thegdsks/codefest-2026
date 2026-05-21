'use client';

import { TriangleAlert } from 'lucide-react';
import type { RuleAction, RuleConditionGroup } from '@/lib/rules-api';

interface RuleDisclaimersProps {
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  action: RuleAction;
}

interface Warning {
  id: string;
  message: string;
}

function countRules(group: RuleConditionGroup): number {
  let count = 0;
  for (const r of group.rules) {
    if ('combinator' in r) {
      count += countRules(r);
    } else {
      count += 1;
    }
  }
  return count;
}

function computeWarnings(
  whenConditions: RuleConditionGroup,
  whoConditions: RuleConditionGroup,
  action: RuleAction
): Warning[] {
  const warnings: Warning[] = [];

  const total = countRules(whenConditions) + countRules(whoConditions);
  if (total === 0) {
    warnings.push({
      id: 'no-conditions',
      message: 'This rule will fire on every engagement event. Add at least one condition.',
    });
  }

  const score = action.score;
  if (typeof score === 'number' && (score > 90 || score < 10)) {
    warnings.push({
      id: 'extreme-score',
      message: 'Score weight is unusually extreme. Most rules sit in 30-80.',
    });
  }

  if (action.actionType === 'HINT' && action.surface !== 'tooltip') {
    warnings.push({
      id: 'hint-surface-mismatch',
      message: 'Unusual pairing: HINT typically uses inline_help_tooltip.',
    });
  }

  return warnings;
}

export default function RuleDisclaimers({
  whenConditions,
  whoConditions,
  action,
}: RuleDisclaimersProps) {
  const warnings = computeWarnings(whenConditions, whoConditions, action);
  if (warnings.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {warnings.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
