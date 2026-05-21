'use client';

import { ArrowClockwise, Cpu, CurrencyCircleDollar, Pulse, Stack } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import {
  bucketDecisions,
  DecisionsOverTimeChart,
  EngineGuardRadial,
  Sparkline,
  sparklineSeries,
  TypeDonutChart,
  windowToMs,
} from '@/components/admin/charts';
import LiveActivityFeed from '@/components/admin/LiveActivityFeed';
import ProgressBar from '@/components/admin/ProgressBar';
import Tile from '@/components/admin/Tile';
import { getDecisions, getMetrics, type Window } from '@/lib/admin-api';

const WINDOWS: Window[] = ['1h', '24h', '7d'];
const SPARKLINE_BUCKETS = 12;

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
  const [activeWindow, setActiveWindow] = useState<Window>('24h');

  const metricsQuery = useQuery({
    queryKey: ['metrics', activeWindow],
    queryFn: () => getMetrics(activeWindow),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const decisionsQuery = useQuery({
    queryKey: ['decisions', activeWindow, 500],
    queryFn: () => getDecisions({ window: activeWindow, limit: 500 }),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const data = metricsQuery.data?.data ?? null;
  const err = metricsQuery.data?.error ?? null;
  const loading = metricsQuery.isLoading;

  const { windowMs, bucketMs } = windowToMs(activeWindow);

  const buckets = useMemo(() => {
    const decisions = decisionsQuery.data?.data?.decisions ?? [];
    return bucketDecisions(decisions, windowMs, bucketMs);
  }, [decisionsQuery.data, windowMs, bucketMs]);

  const sparkTotal = useMemo(() => sparklineSeries(buckets, 'TOTAL', SPARKLINE_BUCKETS), [buckets]);
  const sparkL1 = useMemo(() => sparklineSeries(buckets, 'ALLOW', SPARKLINE_BUCKETS), [buckets]);
  const sparkL2Block = useMemo(
    () => sparklineSeries(buckets, 'BLOCK', SPARKLINE_BUCKETS),
    [buckets]
  );

  const actionRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.totals.by_action).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const typeRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.totals.by_type).sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (err && !data) {
    return (
      <AuthGate
        error={err}
        onRetry={() => {
          metricsQuery.refetch();
          decisionsQuery.refetch();
        }}
      />
    );
  }

  const total = data?.totals.total ?? 0;
  const l1 = data?.totals.l1 ?? 0;
  const l2 = data?.totals.l1plus_l2 ?? 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Overview</h1>
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
                onClick={() => setActiveWindow(w)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  activeWindow === w
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              metricsQuery.refetch();
              decisionsQuery.refetch();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <ArrowClockwise size={12} />
            Reload
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left rail: KPI tiles, charts, and breakdown */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* KPI tiles with sparklines */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col">
              <Tile
                label="Total decisions"
                value={total}
                hint={`In the last ${activeWindow}`}
                icon={Pulse}
                loading={loading}
              />
              <div className="flex justify-end pr-4 pt-1">
                <Sparkline data={sparkTotal} color="#6366F1" />
              </div>
            </div>
            <div className="flex flex-col">
              <Tile
                label="L1 only"
                value={l1}
                hint={`${formatPct(l1, total)} of total`}
                icon={Cpu}
                accent="green"
                loading={loading}
              />
              <div className="flex justify-end pr-4 pt-1">
                <Sparkline data={sparkL1} color="#34D399" />
              </div>
            </div>
            <div className="flex flex-col">
              <Tile
                label="L1 + L2"
                value={l2}
                hint={`${formatPct(l2, total)} escalated to LLM`}
                icon={Stack}
                accent="indigo"
                loading={loading}
              />
              <div className="flex justify-end pr-4 pt-1">
                <Sparkline data={sparkL2Block} color="#F43F5E" />
              </div>
            </div>
            <div className="flex flex-col">
              <Tile
                label="LLM spend"
                value={formatUsd(data?.costEstimateUsd ?? 0)}
                hint={`At ${l2} calls`}
                icon={CurrencyCircleDollar}
                accent="amber"
                loading={loading}
              />
              <div className="flex justify-end pr-4 pt-1">
                <Sparkline data={sparkTotal} color="#FBBF24" />
              </div>
            </div>
          </div>

          {/* Chart row: decisions over time (2/3) + donut (1/3) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Decisions over time
              </h2>
              <DecisionsOverTimeChart window={activeWindow} height={260} />
            </section>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                By type
              </h2>
              <TypeDonutChart window={activeWindow} height={240} />
            </section>
          </div>

          {/* Flat action and type breakdown bars */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Actions
              </h2>
              {loading ? (
                <div className="space-y-2">
                  {SKELETON_BARS.map((k) => (
                    <div
                      key={k}
                      className="h-6 w-full motion-safe:animate-pulse rounded bg-zinc-800"
                    />
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
                    <div
                      key={k}
                      className="h-6 w-full motion-safe:animate-pulse rounded bg-zinc-800"
                    />
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

          {/* Engine guard — visible on xl alongside the right rail live feed */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:hidden">
            <section className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
              <div className="h-96">
                <LiveActivityFeed />
              </div>
            </section>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Engine guard
              </h2>
              <EngineGuardRadial window={activeWindow} height={200} />
            </section>
          </div>

          <div className="hidden xl:block">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Engine guard
              </h2>
              <EngineGuardRadial window={activeWindow} height={200} />
            </section>
          </div>

          {data?.asOf ? (
            <div aria-live="polite" className="text-xs text-zinc-600">
              Snapshot taken {new Date(data.asOf * 1000).toLocaleString()}
            </div>
          ) : null}
        </div>

        {/* Right rail: live feed (2xl breakpoint and up so we don't cramp at 1280) */}
        <div className="hidden w-80 shrink-0 2xl:block">
          <div className="sticky top-4 h-[calc(100vh-8rem)]">
            <LiveActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
