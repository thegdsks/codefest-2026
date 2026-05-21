'use client';

import { Lightning } from '@phosphor-icons/react';
import type { FilterState, QuickFilter, ScoreBand } from './types';

const SCORE_BANDS: { value: ScoreBand; label: string }[] = [
  { value: 'low', label: 'Low (<40)' },
  { value: 'med', label: 'Med 40-69' },
  { value: 'high', label: 'High 70+' },
];

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'my-open', label: 'My open cases' },
  { value: 'stale', label: 'Stale (SLA <10m)' },
  { value: 'block-only', label: 'BLOCK only' },
];

interface InvestigationsFiltersProps {
  decisionTypes: string[];
  assignees: string[];
  filters: FilterState;
  onToggleType: (t: string) => void;
  onToggleScore: (b: ScoreBand) => void;
  onToggleAssignee: (a: string) => void;
  onSetQuick: (q: QuickFilter | null) => void;
  onClearAll: () => void;
}

export default function InvestigationsFilters({
  decisionTypes,
  assignees,
  filters,
  onToggleType,
  onToggleScore,
  onToggleAssignee,
  onSetQuick,
  onClearAll,
}: InvestigationsFiltersProps) {
  const anyActive =
    filters.decisionTypes.size > 0 ||
    filters.scoreBands.size > 0 ||
    filters.assignees.size > 0 ||
    filters.quick !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Lightning
          size={12}
          weight="fill"
          className="text-[color:var(--text-dim)]"
          aria-hidden="true"
        />
        <span className="mr-1 text-[10.5px] uppercase tracking-wider text-[color:var(--text-dim)]">
          Quick
        </span>
        {QUICK_FILTERS.map((q) => (
          <Chip
            key={q.value}
            label={q.label}
            active={filters.quick === q.value}
            onClick={() => onSetQuick(filters.quick === q.value ? null : q.value)}
          />
        ))}
        <span className="mx-1 h-3 w-px bg-[color:var(--border)]" aria-hidden="true" />
        {SCORE_BANDS.map((b) => (
          <Chip
            key={b.value}
            label={b.label}
            active={filters.scoreBands.has(b.value)}
            onClick={() => onToggleScore(b.value)}
          />
        ))}
        {anyActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-auto text-[11px] text-[color:var(--text-muted)] underline-offset-2 hover:text-[color:var(--text)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
      {(decisionTypes.length > 0 || assignees.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] uppercase tracking-wider text-[color:var(--text-dim)]">
            Type
          </span>
          {decisionTypes.map((t) => (
            <Chip
              key={t}
              label={t}
              active={filters.decisionTypes.has(t)}
              onClick={() => onToggleType(t)}
            />
          ))}
          {assignees.length > 0 && (
            <span className="mx-1 h-3 w-px bg-[color:var(--border)]" aria-hidden="true" />
          )}
          {assignees.length > 0 && (
            <span className="mr-1 text-[10.5px] uppercase tracking-wider text-[color:var(--text-dim)]">
              Assignee
            </span>
          )}
          {assignees.map((a) => (
            <Chip
              key={a}
              label={a}
              active={filters.assignees.has(a)}
              onClick={() => onToggleAssignee(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'inline-flex items-center rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--accent-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70'
          : 'inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-muted)] motion-safe:transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70'
      }
    >
      {label}
    </button>
  );
}
