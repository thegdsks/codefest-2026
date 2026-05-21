'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useRef } from 'react';
import CaseCard from './CaseCard';
import { type Case, type CaseStatus, STATUS_META } from './types';

const VIRTUALIZE_THRESHOLD = 30;
const ESTIMATED_CARD_HEIGHT = 96;

interface ColumnProps {
  status: CaseStatus;
  cases: Case[];
  selected: Set<string>;
  onSelect: (id: string, e: ReactMouseEvent) => void;
  onAdvance: (id: string) => void;
}

export default function Column({ status, cases, selected, onSelect, onAdvance }: ColumnProps) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${status}`,
    data: { type: 'column', status },
  });
  const ids = cases.map((c) => c.decisionId);
  const shouldVirtualize = cases.length > VIRTUALIZE_THRESHOLD;

  return (
    <section
      aria-label={`${meta.label} cases`}
      ref={setNodeRef}
      className={`flex h-full min-h-0 flex-col rounded-xl border bg-[color:var(--bg-surface)]/40 transition-colors ${meta.accent} ${isOver ? `bg-[color:var(--bg-elevated)]/60 ring-1 ring-inset ${meta.ring}` : ''}`}
    >
      <header className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
            aria-hidden="true"
          />
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${meta.tone}`}>
            {meta.label}
          </span>
        </div>
        <span className="rounded-md bg-[color:var(--bg-elevated)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[color:var(--text-muted)] ring-1 ring-inset ring-[color:var(--border)]">
          {cases.length}
        </span>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {cases.length === 0 ? (
          <EmptyState status={status} />
        ) : shouldVirtualize ? (
          <VirtualList
            cases={cases}
            selected={selected}
            onSelect={onSelect}
            onAdvance={onAdvance}
          />
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
            {cases.map((c) => (
              <CaseCard
                key={c.decisionId}
                c={c}
                selected={selected.has(c.decisionId)}
                onSelect={onSelect}
                onAdvance={onAdvance}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </section>
  );
}

function EmptyState({ status }: { status: CaseStatus }) {
  const meta = STATUS_META[status];
  return (
    <div className="grid min-h-[140px] flex-1 place-items-center px-3 text-center">
      <div className="space-y-2">
        <div
          className={`mx-auto h-8 w-8 rounded-full border border-dashed ${meta.accent}`}
          aria-hidden="true"
        />
        <p className="text-[11px] text-[color:var(--text-dim)]">No cases in {meta.label}</p>
      </div>
    </div>
  );
}

interface VirtualListProps {
  cases: Case[];
  selected: Set<string>;
  onSelect: (id: string, e: ReactMouseEvent) => void;
  onAdvance: (id: string) => void;
}

function VirtualList({ cases, selected, onSelect, onAdvance }: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: cases.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 6,
    getItemKey: (i) => cases[i]?.decisionId ?? i,
  });
  const items = rowVirtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto p-2.5">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {items.map((row) => {
          const c = cases[row.index];
          if (!c) return null;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
                paddingBottom: 8,
              }}
            >
              <CaseCard
                c={c}
                selected={selected.has(c.decisionId)}
                onSelect={onSelect}
                onAdvance={onAdvance}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
