'use client';

import { Command, List, MagnifyingGlass } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMetrics } from '@/lib/admin-api';

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Overview',
  '/admin/decisions': 'Decision feed',
  '/admin/users': 'Users',
  '/admin/sessions': 'Auth sessions',
  '/admin/rules': 'Rules',
  '/admin/settings': 'Configuration',
};

const POLL_MS = 10_000;
const SPARKLINE_POINTS = 12;
// Fixed Y-axis ceiling for the sparkline so spikes do not auto-rescale
// the rest of the line on every tick. Anything above this clamps.
const SPARKLINE_CEILING_DEC_PER_SEC = 5;
// Exponential moving average smoothing factor. Lower = smoother but laggier.
const EMA_ALPHA = 0.4;

interface DecPerSecState {
  rate: number;
  sparkline: number[];
}

function useDecisionsPerSec(): DecPerSecState {
  const prevTotalRef = useRef<number | null>(null);
  const smoothedRef = useRef<number>(0);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [rate, setRate] = useState(0);

  const { data } = useQuery({
    queryKey: ['topbar-metrics-1h'],
    queryFn: () => getMetrics('1h'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS,
  });

  useEffect(() => {
    if (!data || data.error !== null || data.data === null) return;
    const total = data.data.totals.total;
    if (prevTotalRef.current === null) {
      prevTotalRef.current = total;
      return;
    }
    const delta = Math.max(0, total - prevTotalRef.current);
    const instant = delta / (POLL_MS / 1000);
    smoothedRef.current = EMA_ALPHA * instant + (1 - EMA_ALPHA) * smoothedRef.current;
    const next = Math.round(smoothedRef.current * 100) / 100;
    setRate(next);
    setSparkline((prev) => {
      const updated = [...prev, next];
      return updated.slice(-SPARKLINE_POINTS);
    });
    prevTotalRef.current = total;
  }, [data]);

  return { rate, sparkline };
}

function MiniSparkline({ values }: { values: number[] }) {
  const width = 40;
  const height = 16;

  if (values.length < 2) {
    return <span className="inline-block w-10 h-4" />;
  }

  const max = SPARKLINE_CEILING_DEC_PER_SEC;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="inline-block align-middle"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-indigo-400"
      />
    </svg>
  );
}

interface TopBarV2Props {
  onCmdK?: () => void;
  onMenuOpen?: () => void;
}

export default function TopBarV2({ onCmdK, onMenuOpen }: TopBarV2Props) {
  const pathname = usePathname();
  const { rate, sparkline } = useDecisionsPerSec();

  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([route]) =>
        route === '/admin' ? pathname === '/admin' : pathname.startsWith(route)
      )?.[1] ?? 'Admin';

  const handleClick = useCallback(() => {
    onCmdK?.();
  }, [onCmdK]);

  return (
    <header className="flex h-12 items-center gap-3 border-b border-white/[0.06] bg-transparent px-4">
      {/* Hamburger: visible only under md */}
      <button
        type="button"
        onClick={onMenuOpen}
        className="md:hidden shrink-0 flex items-center justify-center rounded-md p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        aria-label="Open navigation"
      >
        <List size={18} aria-hidden="true" />
      </button>

      {/* Left: page title (desktop) */}
      <div className="hidden md:flex items-center gap-2 shrink-0 min-w-[80px]">
        <span className="text-[13px] font-medium text-[color:var(--text)] tracking-[-0.005em]">
          {title}
        </span>
      </div>

      {/* Center: Cmd+K trigger */}
      <button
        type="button"
        onClick={handleClick}
        className="hidden md:flex flex-1 max-w-md w-full min-w-0 items-center gap-2 h-8 rounded-md bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] px-3 text-sm text-[color:var(--text-dim)] hover:bg-white/[0.06] hover:ring-white/[0.1] hover:text-[color:var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
        aria-label="Open command palette"
      >
        <MagnifyingGlass size={13} aria-hidden="true" />
        <span className="flex-1 text-left text-[12px] truncate">Search or run a command</span>
        <span className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--text-muted)] ring-1 ring-inset ring-white/[0.08]">
          <Command size={9} aria-hidden="true" />K
        </span>
      </button>

      {/* Mobile page title */}
      <div className="md:hidden flex-1 min-w-0 text-[13px] font-medium text-[color:var(--text)] truncate">
        {title}
      </div>

      {/* Right: dec/s meter */}
      <div
        role="status"
        className="flex items-center gap-2.5 shrink-0"
        aria-label="Decisions per second"
      >
        <span className="hidden sm:inline-block w-12">
          <MiniSparkline values={sparkline} />
        </span>
        <span className="tabular-nums whitespace-nowrap text-[13px] font-semibold text-[color:var(--text)] inline-block w-[42px] text-right">
          {rate.toFixed(2)}
        </span>
        <span className="text-[color:var(--text-dim)] hidden sm:inline whitespace-nowrap text-[11px] uppercase tracking-wider">
          dec/s
        </span>
      </div>
    </header>
  );
}
