'use client';

import { Command, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMetrics } from '@/lib/admin-api';

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/decisions': 'Decisions',
  '/admin/users': 'Users',
  '/admin/sessions': 'Sessions',
  '/admin/rules': 'Rules',
  '/admin/settings': 'Settings',
};

const POLL_MS = 5_000;
const SPARKLINE_POINTS = 12;

interface DecPerSecState {
  rate: number;
  sparkline: number[];
}

function useDecisionsPerSec(): DecPerSecState {
  const [rate, setRate] = useState(0);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const prevTotalRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const res = await getMetrics('1h');
      if (cancelled || res.error !== null || res.data === null) return;
      const total = res.data.totals.total;
      if (prevTotalRef.current !== null) {
        const delta = Math.max(0, total - prevTotalRef.current);
        const computed = parseFloat((delta / (POLL_MS / 1000)).toFixed(2));
        setRate(computed);
        setSparkline((prev) => {
          const next = [...prev, computed];
          return next.slice(-SPARKLINE_POINTS);
        });
      }
      prevTotalRef.current = total;
    };

    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { rate, sparkline };
}

function MiniSparkline({ values }: { values: number[] }) {
  const width = 40;
  const height = 16;

  if (values.length < 2) {
    return <span className="inline-block w-10 h-4" />;
  }

  const max = Math.max(...values, 0.001);
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
}

export default function TopBarV2({ onCmdK }: TopBarV2Props) {
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
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3 gap-4">
      {/* Left: page title */}
      <div className="text-sm font-medium text-zinc-300 shrink-0 min-w-[80px]">{title}</div>

      {/* Center: Cmd+K trigger */}
      <button
        type="button"
        onClick={handleClick}
        className="flex flex-1 max-w-sm items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        aria-label="Open command palette"
      >
        <Search size={13} aria-hidden="true" />
        <span className="flex-1 text-left text-xs truncate">Search or run a command...</span>
        <span className="hidden sm:inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[10px] font-medium text-zinc-500">
          <Command size={9} aria-hidden="true" />K
        </span>
      </button>

      {/* Right: dec/s meter */}
      <div
        role="status"
        className="flex items-center gap-2 shrink-0 text-xs text-zinc-400"
        aria-label="Decisions per second"
      >
        <MiniSparkline values={sparkline} />
        <span className="tabular-nums text-zinc-300 font-medium">{rate.toFixed(2)}</span>
        <span className="text-zinc-600 hidden sm:inline">dec/s</span>
      </div>
    </header>
  );
}
