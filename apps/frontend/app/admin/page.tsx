'use client';

import { Activity, CircleDollarSign, Cpu, Layers, RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import ProgressBar from '@/components/admin/ProgressBar';
import Tile from '@/components/admin/Tile';
import { getMetrics, type MetricsResponse, type Window } from '@/lib/admin-api';
import type { ApiResult } from '@/lib/types';

const WINDOWS: Window[] = ['1h', '24h', '7d'];
const POLL_MS = 5_000;

function formatPct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

const SKELETON_BARS = ['a', 'b', 'c'];

export default function AdminDashboardPage() {
  const [window, setWindow] = useState<Window>('24h');
  const [result, setResult] = useState<ApiResult<MetricsResponse> | null>(null);

  const load = useCallback(async () => {
    const res = await getMetrics(window);
    setResult(res);
  }, [window]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await getMetrics(window);
      if (!cancelled) setResult(res);
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [window]);

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  const actionRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.totals.by_action).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const typeRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.totals.by_type).sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (err && !data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  const total = data?.totals.total ?? 0;
  const l1 = data?.totals.l1 ?? 0;
  const l2 = data?.totals.l1plus_l2 ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live decision metrics from the engine. Polls every 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  window === w ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <RefreshCcw size={12} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Total decisions"
          value={total}
          hint={`In the last ${window}`}
          icon={Activity}
          loading={loading}
        />
        <Tile
          label="L1 only"
          value={l1}
          hint={`${formatPct(l1, total)} of total`}
          icon={Cpu}
          accent="green"
          loading={loading}
        />
        <Tile
          label="L1 + L2"
          value={l2}
          hint={`${formatPct(l2, total)} escalated to LLM`}
          icon={Layers}
          accent="indigo"
          loading={loading}
        />
        <Tile
          label="LLM spend"
          value={formatUsd(data?.costEstimateUsd ?? 0)}
          hint={`At ${l2} calls`}
          icon={CircleDollarSign}
          accent="amber"
          loading={loading}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Actions
          </h2>
          {loading ? (
            <div className="space-y-2">
              {SKELETON_BARS.map((k) => (
                <div key={k} className="h-6 w-full motion-safe:animate-pulse rounded bg-zinc-800" />
              ))}
            </div>
          ) : actionRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No decisions in this window.</p>
          ) : (
            <ul className="space-y-2">
              {actionRows.map(([action, count]) => {
                const pct = total === 0 ? 0 : (count / total) * 100;
                return (
                  <li key={action}>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="font-medium text-zinc-200">{action}</span>
                      <span className="tabular-nums">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar value={pct} tone="indigo" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Decision types
          </h2>
          {loading ? (
            <div className="space-y-2">
              {SKELETON_BARS.map((k) => (
                <div key={k} className="h-6 w-full motion-safe:animate-pulse rounded bg-zinc-800" />
              ))}
            </div>
          ) : typeRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No decisions in this window.</p>
          ) : (
            <ul className="space-y-2">
              {typeRows.map(([type, count]) => {
                const pct = total === 0 ? 0 : (count / total) * 100;
                return (
                  <li key={type}>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="font-medium text-zinc-200">{type}</span>
                      <span className="tabular-nums">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar value={pct} tone="emerald" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {data?.asOf ? (
        <div aria-live="polite" className="mt-6 text-xs text-zinc-600">
          Snapshot taken {new Date(data.asOf * 1000).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}
