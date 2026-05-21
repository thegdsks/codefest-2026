'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CaretRight, Check, ClockCountdown } from '@phosphor-icons/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { type Case, relative, STATUS_META, scoreColor } from './types';

interface CaseCardProps {
  c: Case;
  selected: boolean;
  onSelect: (id: string, e: ReactMouseEvent) => void;
  onAdvance: (id: string) => void;
}

export default function CaseCard({ c, selected, onSelect, onAdvance }: CaseCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: c.decisionId,
    data: { type: 'case', status: c.status },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as const;

  const ring = selected ? `ring-1 ${STATUS_META[c.status].ring}` : '';

  return (
    // biome-ignore lint/a11y/useSemanticElements: card contains nested buttons (checkbox + advance), so a real <button> outer would be invalid HTML
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Case ${c.decisionId} for user ${c.userId}, status ${c.status}, score ${c.score}, ${selected ? 'selected' : 'not selected'}`}
      className={`group relative rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 transition-colors hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70 ${ring} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(c.decisionId, e);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={selected ? 'Deselect case' : 'Select case'}
        aria-pressed={selected}
        className={`absolute -left-1 -top-1 z-10 grid h-4 w-4 place-items-center rounded border bg-[color:var(--bg-surface)] transition ${selected ? 'border-[color:var(--accent)] bg-[color:var(--accent)] opacity-100' : 'border-[color:var(--border-strong)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
      >
        {selected && <Check size={10} weight="bold" className="text-[color:var(--accent-fg)]" />}
      </button>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-medium text-[color:var(--text)]">
              {c.userId}
            </span>
            <span className="truncate text-[10px] text-[color:var(--text-dim)]">
              {c.decisionType}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
            {c.reasonText ?? c.reason ?? c.reasonCode ?? 'No reason recorded'}
          </div>
        </div>
        <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${scoreColor(c.score)}`}>
          {c.score}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[10.5px]">
        <span className="inline-flex items-center gap-1 text-[color:var(--text-dim)]">
          <ClockCountdown size={11} aria-hidden="true" />
          <span className="tabular-nums">{c.slaMinutes}m SLA</span>
          <span className="text-[color:var(--text-dim)]">·</span>
          <span>{relative(c.timestamp)}</span>
        </span>
        {c.assignee && (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--text-muted)]">
            <span
              aria-hidden="true"
              className="inline-grid h-4 w-4 place-items-center rounded-full bg-[color:var(--bg-elevated)] text-[8px] font-semibold text-[color:var(--text)] ring-1 ring-inset ring-[color:var(--border)]"
            >
              {c.assignee.slice(0, 1)}
            </span>
            <span className="max-w-[80px] truncate">{c.assignee}</span>
          </span>
        )}
      </div>

      {c.status !== 'closed' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(c.decisionId);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-[color:var(--bg-elevated)] py-1 text-[10.5px] font-medium text-[color:var(--text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[color:var(--text)]"
        >
          Advance <CaretRight size={10} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
