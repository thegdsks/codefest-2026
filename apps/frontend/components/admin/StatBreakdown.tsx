'use client';

const ACTION_COLORS: Record<string, string> = {
  ALLOW: '#6366F1',
  BLOCK: '#F43F5E',
  MFA: '#FBBF24',
  REVIEW: '#38BDF8',
  OFFER: '#34D399',
  NUDGE: '#E879F9',
};

const TYPE_PALETTE = [
  '#6366F1',
  '#F43F5E',
  '#34D399',
  '#FBBF24',
  '#38BDF8',
  '#E879F9',
  '#F97316',
  '#A78BFA',
];

type Row = readonly [string, number];

interface StatBreakdownProps {
  rows: ReadonlyArray<Row>;
  total: number;
  variant?: 'action' | 'type';
  loading?: boolean;
  emptyLabel?: string;
}

function colorFor(label: string, index: number, variant: 'action' | 'type'): string {
  if (variant === 'action') {
    return ACTION_COLORS[label] ?? TYPE_PALETTE[index % TYPE_PALETTE.length];
  }
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

export default function StatBreakdown({
  rows,
  total,
  variant = 'action',
  loading = false,
  emptyLabel = 'No decisions in this window.',
}: StatBreakdownProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-2 w-full motion-safe:animate-pulse rounded-full bg-[color:var(--bg-elevated)]" />
        <ul className="space-y-3">
          {SKELETON_ROWS.map((k) => (
            <li key={k} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 motion-safe:animate-pulse rounded bg-[color:var(--bg-elevated)]" />
                <div className="h-3 w-16 motion-safe:animate-pulse rounded bg-[color:var(--bg-elevated)]" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-[color:var(--bg-elevated)]/60" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[color:var(--text-muted)]">{emptyLabel}</p>;
  }

  const segments = rows
    .map((r, i) => ({ label: r[0], count: r[1], color: colorFor(r[0], i, variant) }))
    .filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--bg-elevated)]/70"
        role="img"
        aria-label="Distribution summary"
      >
        {segments.map((s, i) => {
          const pct = total === 0 ? 0 : (s.count / total) * 100;
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          return (
            <div
              key={s.label}
              className={`h-full transition-[width] duration-500 ease-out ${
                !isFirst && !isLast ? 'border-l border-[color:var(--border-strong)]' : ''
              } ${!isFirst && isLast ? 'border-l border-[color:var(--border-strong)]' : ''}`}
              style={{
                width: `${pct}%`,
                background: `linear-gradient(180deg, ${s.color}F2 0%, ${s.color}CC 100%)`,
              }}
              title={`${s.label}: ${s.count.toLocaleString()} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      <ul className="space-y-2.5">
        {rows.map(([label, count], i) => {
          const pct = total === 0 ? 0 : (count / total) * 100;
          const color = colorFor(label, i, variant);
          return (
            <li key={label} className="group">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-[color:var(--border-strong)]"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 10px ${color}55`,
                    }}
                  />
                  <span className="truncate text-xs font-medium tracking-wide text-[color:var(--text)]">
                    {label}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-xs">
                  <span className="font-semibold text-[color:var(--text)]">
                    {count.toLocaleString()}
                  </span>
                  <span className="ml-1.5 text-[color:var(--text-muted)]">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--bg-elevated)]/60">
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${label}: ${pct.toFixed(0)} percent`}
                  className="h-full rounded-full transition-[width] duration-500 ease-out group-hover:brightness-110"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}B3 100%)`,
                    boxShadow: `0 0 6px ${color}40`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
