'use client';

import {
  ArrowClockwise,
  Cpu,
  CurrencyCircleDollar,
  Info,
  Pulse,
  Stack,
} from '@phosphor-icons/react';
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
import StatBreakdown from '@/components/admin/StatBreakdown';
import Tile from '@/components/admin/Tile';
import { Tooltip } from '@/components/ui/Tooltip';
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
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">Overview</h1>
          <p className="mt-1 text-sm text-[color:var(--text-dim)]">
            Live decision metrics from the engine. Polls every 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setActiveWindow(w)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] ${
                  activeWindow === w
                    ? 'bg-[color:var(--accent)] text-[color:var(--accent-fg)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
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
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <ArrowClockwise size={12} />
            Reload
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left rail: KPI tiles, charts, and breakdown */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* KPI tiles with sparklines inside */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Total decisions"
              value={total}
              hint={`In the last ${activeWindow}`}
              icon={Pulse}
              loading={loading}
              trend={<Sparkline data={sparkTotal} color="#6366F1" />}
              description="Every decision the engine produced in this window: fraud checks, MFA outcomes, offers, nudges, engagement signals."
            />
            <Tile
              label="L1 only"
              value={l1}
              hint={`${formatPct(l1, total)} of total`}
              icon={Cpu}
              accent="green"
              loading={loading}
              trend={<Sparkline data={sparkL1} color="#34D399" />}
              description="Decisions resolved by deterministic rules alone (no LLM). Fast and free. The base of the cost pyramid."
            />
            <Tile
              label="L1 + L2"
              value={l2}
              hint={`${formatPct(l2, total)} escalated to LLM`}
              icon={Stack}
              accent="indigo"
              loading={loading}
              trend={<Sparkline data={sparkL2Block} color="#F43F5E" />}
              description="Decisions where the L1 score landed in the 40 to 70 gray zone and escalated to the LLM for a judgment + explanation."
            />
            <Tile
              label="LLM spend"
              value={formatUsd(data?.costEstimateUsd ?? 0)}
              hint={`At ${l2} calls`}
              icon={CurrencyCircleDollar}
              accent="amber"
              loading={loading}
              trend={<Sparkline data={sparkTotal} color="#FBBF24" />}
              description="Estimated USD cost for LLM calls this window. The engine guard caps this in a rolling window so spikes cannot run away."
            />
          </div>

          {/* Chart row: decisions over time (2/3) + donut (1/3) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
              <h2 className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                Decisions over time
                <Tooltip content="Stacked area chart bucketed by action. Each color is one action (ALLOW, BLOCK, MFA, REVIEW, OFFER, NUDGE). Taller band means more decisions of that action in the bucket.">
                  <button
                    type="button"
                    aria-label="What is this chart?"
                    className="text-[color:var(--text-dim)] hover:text-[color:var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 rounded-full"
                  >
                    <Info size={12} weight="bold" />
                  </button>
                </Tooltip>
              </h2>
              <DecisionsOverTimeChart window={activeWindow} height={260} />
            </section>
            <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
              <h2 className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                By type
                <Tooltip content="Donut breakdown by decision type (FRAUD_LOGIN, FRAUD_TRANSFER, ENGAGEMENT, MFA_VERIFY, etc). Center number is the total across all types in this window.">
                  <button
                    type="button"
                    aria-label="What is this chart?"
                    className="text-[color:var(--text-dim)] hover:text-[color:var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 rounded-full"
                  >
                    <Info size={12} weight="bold" />
                  </button>
                </Tooltip>
              </h2>
              <TypeDonutChart window={activeWindow} height={240} />
            </section>
          </div>

          {/* Action and type breakdown with stacked summary and semantic colors */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                  Actions
                </h2>
                <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
                  {total.toLocaleString()} total
                </span>
              </div>
              <StatBreakdown rows={actionRows} total={total} variant="action" loading={loading} />
            </section>

            <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                  Decision types
                </h2>
                <span className="text-xs tabular-nums text-[color:var(--text-dim)]">
                  {typeRows.length} types
                </span>
              </div>
              <StatBreakdown rows={typeRows} total={total} variant="type" loading={loading} />
            </section>
          </div>

          {/* Live activity + engine guard side by side (no right rail) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 overflow-hidden">
              <div className="h-96">
                <LiveActivityFeed />
              </div>
            </section>
            <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 p-5">
              <h2 className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                Engine guard
                <Tooltip content="Live state of the LLM cost guardrail. Radial fill shows how much of the spend cap has been consumed in the rolling window. The breaker trips and stops L2 calls when it hits 100 percent.">
                  <button
                    type="button"
                    aria-label="What is the engine guard?"
                    className="text-[color:var(--text-dim)] hover:text-[color:var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 rounded-full"
                  >
                    <Info size={12} weight="bold" />
                  </button>
                </Tooltip>
              </h2>
              <EngineGuardRadial window={activeWindow} height={200} />
            </section>
          </div>

          {data?.asOf ? (
            <div aria-live="polite" className="text-xs text-[color:var(--text-dim)]">
              Snapshot taken {new Date(data.asOf * 1000).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
