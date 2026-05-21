import type { LucideIcon } from 'lucide-react';

interface TileProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: 'default' | 'green' | 'amber' | 'rose' | 'indigo';
  loading?: boolean;
}

const accentMap: Record<NonNullable<TileProps['accent']>, string> = {
  default: 'text-zinc-100',
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
}: TileProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-zinc-400">
        <span>{label}</span>
        {Icon ? <Icon size={14} className="text-zinc-500" /> : null}
      </div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${accentMap[accent]}`}>
        {loading ? (
          <span className="inline-block h-7 w-24 rounded bg-zinc-800 motion-safe:animate-pulse" />
        ) : (
          value
        )}
      </div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}
