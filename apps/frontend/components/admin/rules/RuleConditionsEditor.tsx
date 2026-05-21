'use client';

import QueryBuilder, { type RuleGroupType } from 'react-querybuilder';
import 'react-querybuilder/dist/query-builder.css';
import type { RuleConditionGroup } from '@/lib/rules-api';
import { fields } from './QueryBuilderConfig';

const QB_CLASS = {
  queryBuilder: 'space-y-2',
  ruleGroup: 'rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 space-y-2',
  header: 'flex flex-wrap items-center gap-2',
  combinators:
    'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  addRule:
    'inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  addGroup:
    'inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  removeGroup:
    'inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  rule: 'flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2',
  fields:
    'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  operators:
    'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  value:
    'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  removeRule:
    'inline-flex items-center rounded px-1.5 py-1 text-xs text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  notToggle: 'flex items-center gap-1 text-xs text-zinc-400',
  dragHandle: 'cursor-grab text-zinc-600',
};

function toQBQuery(group: RuleConditionGroup): RuleGroupType {
  return group as unknown as RuleGroupType;
}

function fromQBQuery(query: RuleGroupType): RuleConditionGroup {
  return query as unknown as RuleConditionGroup;
}

interface RuleConditionsEditorProps {
  label: string;
  conditions: RuleConditionGroup;
  onChange: (updated: RuleConditionGroup) => void;
}

export default function RuleConditionsEditor({
  label,
  conditions,
  onChange,
}: RuleConditionsEditorProps) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</h3>
      <QueryBuilder
        fields={fields}
        query={toQBQuery(conditions)}
        onQueryChange={(q) => onChange(fromQBQuery(q))}
        controlClassnames={QB_CLASS}
        showNotToggle={false}
        addRuleToNewGroups={false}
      />
    </div>
  );
}
