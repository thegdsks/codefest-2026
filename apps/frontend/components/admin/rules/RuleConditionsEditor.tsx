'use client';

import QueryBuilder, {
  type Field,
  Rule,
  type RuleGroupType,
  type RuleProps,
} from 'react-querybuilder';
import 'react-querybuilder/dist/query-builder.css';
import type { RuleConditionGroup } from '@/lib/rules-api';
import { FIELD_HINTS, fields, SIGNAL_ICONS } from './QueryBuilderConfig';

const QB_CLASS = {
  queryBuilder: 'space-y-2',
  ruleGroup: 'rounded-md border border-zinc-800 bg-zinc-950/60 p-3 space-y-2',
  header: 'flex flex-wrap items-center gap-2',
  combinators:
    'rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  addRule:
    'inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  addGroup:
    'inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  removeGroup:
    'inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  rule: 'flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2',
  fields:
    'rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  operators:
    'rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  value:
    'rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
  removeRule:
    'inline-flex items-center rounded-md px-1.5 py-1 text-xs text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70',
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
  label?: string;
  conditions: RuleConditionGroup;
  onChange: (updated: RuleConditionGroup) => void;
  /** Restrict the field dropdown to a subset (e.g. only signal or only user fields). */
  fieldFilter?: (field: Field) => boolean;
}

// Custom rule wrapper renders an icon+label badge plus a help hint above the
// default Rule component. react-querybuilder bakes the field trigger label into
// its select, so we surface the icon via an adjacent badge instead.
function ThemedRule(props: RuleProps) {
  const fieldName = props.rule.field;
  const Icon = SIGNAL_ICONS[fieldName];
  const hint = FIELD_HINTS[fieldName];
  const label = fields.find((f) => f.name === fieldName)?.label ?? fieldName;

  const hasAdornment = Boolean(Icon) || Boolean(hint);
  return (
    <div className="space-y-1.5">
      {hasAdornment && fieldName ? (
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
              <Icon className="size-3" />
              {label}
            </span>
          ) : null}
          {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
        </div>
      ) : null}
      <Rule {...props} />
    </div>
  );
}

export default function RuleConditionsEditor({
  label,
  conditions,
  onChange,
  fieldFilter,
}: RuleConditionsEditorProps) {
  const visibleFields = fieldFilter ? fields.filter(fieldFilter) : fields;

  return (
    <div>
      {label ? (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </h3>
      ) : null}
      <QueryBuilder
        fields={visibleFields}
        query={toQBQuery(conditions)}
        onQueryChange={(q) => onChange(fromQBQuery(q))}
        controlClassnames={QB_CLASS}
        controlElements={{ rule: ThemedRule }}
        showNotToggle={false}
        addRuleToNewGroups={false}
      />
    </div>
  );
}
