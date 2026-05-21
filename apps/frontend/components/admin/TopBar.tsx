'use client';

import { Circle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { adminApiConfig, getHealth } from '@/lib/admin-api';

type HealthState = 'unknown' | 'ok' | 'down';

const POLL_MS = 30_000;

export default function TopBar() {
  const [state, setState] = useState<HealthState>('unknown');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const res = await getHealth();
      if (cancelled) return;
      setState(res.error === null ? 'ok' : 'down');
      setCheckedAt(Date.now());
    };
    check();
    timerRef.current = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const dot =
    state === 'ok'
      ? 'text-emerald-400 fill-emerald-400'
      : state === 'down'
        ? 'text-rose-400 fill-rose-400'
        : 'text-zinc-500 fill-zinc-500';

  const label = state === 'ok' ? 'API healthy' : state === 'down' ? 'API unreachable' : 'Checking';
  const host = adminApiConfig.baseUrl.replace(/^https?:\/\//, '');

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="text-sm font-medium text-zinc-300">Operations console</div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-500 hidden sm:inline" title={host}>
          {host}
        </span>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-300"
        >
          <Circle size={8} strokeWidth={0} className={dot} />
          {label}
        </span>
        {checkedAt ? (
          <span className="text-zinc-600 hidden md:inline tabular-nums">
            {new Date(checkedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </header>
  );
}
