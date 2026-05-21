import type { Icon } from '@phosphor-icons/react';
import { Info } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';

interface TileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: Icon;
  accent?: 'default' | 'green' | 'amber' | 'rose' | 'indigo';
  loading?: boolean;
  trend?: ReactNode;
  description?: string;
}

const accentMap: Record<NonNullable<TileProps['accent']>, string> = {
  default: 'text-[color:var(--text)]',
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  indigo: 'text-indigo-300',
};

export default function Tile({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'default',
  loading = false,
  trend,
  description,
}: TileProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          {label}
          {description ? (
            <Tooltip content={description}>
              <button
                type="button"
                aria-label={`What is ${label}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[color:var(--text-dim)] hover:text-[color:var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                <Info size={12} weight="bold" />
              </button>
            </Tooltip>
          ) : null}
        </span>
        {Icon ? <Icon size={14} className="text-[color:var(--text-dim)]" /> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className={`text-3xl font-semibold tabular-nums ${accentMap[accent]}`}>
          {loading ? (
            <span className="inline-block h-7 w-24 rounded bg-[color:var(--bg-elevated)] motion-safe:animate-pulse" />
          ) : (
            value
          )}
        </div>
        {trend ? <div className="shrink-0 opacity-80">{trend}</div> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-[color:var(--text-dim)]">{hint}</div> : null}
    </div>
  );
}
