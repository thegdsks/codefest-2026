'use client';

import { ArrowRight, Eye, UserCircle, type X, XCircle } from '@phosphor-icons/react';

interface BulkActionBarProps {
  count: number;
  onAssignToMe: () => void;
  onMarkReviewing: () => void;
  onMarkClosed: () => void;
  onClear: () => void;
}

export default function BulkActionBar({
  count,
  onAssignToMe,
  onMarkReviewing,
  onMarkClosed,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2 py-1.5 shadow-lg ring-1 ring-inset ring-[color:var(--border)]/60 backdrop-blur">
        <span className="px-2 text-[11.5px] font-medium text-[color:var(--text)]">
          <span className="tabular-nums">{count}</span>{' '}
          <span className="text-[color:var(--text-muted)]">selected</span>
        </span>
        <span className="h-4 w-px bg-[color:var(--border)]" aria-hidden="true" />
        <BarButton icon={UserCircle} label="Assign to me" onClick={onAssignToMe} />
        <BarButton icon={Eye} label="Mark reviewing" onClick={onMarkReviewing} />
        <BarButton icon={ArrowRight} label="Mark closed" onClick={onMarkClosed} />
        <span className="h-4 w-px bg-[color:var(--border)]" aria-hidden="true" />
        <BarButton icon={XCircle} label="Clear" onClick={onClear} subtle />
      </div>
    </div>
  );
}

function BarButton({
  icon: Icon,
  label,
  onClick,
  subtle,
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/70 ${subtle ? 'text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text)]' : 'text-[color:var(--text)] hover:bg-[color:var(--bg-elevated)]'}`}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </button>
  );
}
