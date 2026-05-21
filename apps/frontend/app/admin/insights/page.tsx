'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart2, CheckSquare, RefreshCcw, ShieldAlert, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import {
  DecisionsOverTimeChart,
  ScoreDistributionChart,
  TypeDonutChart,
} from '@/components/admin/charts';
import Skeleton from '@/components/admin/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDecisions, getMetrics, type Window } from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

const WINDOWS: Window[] = ['1h', '24h', '7d'];

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text)]">{value}</div>
      {sub && <div className="mt-1 text-sm text-[var(--text-dim)]">{sub}</div>}
    </div>
  );
}

interface RuleFiresProps {
  byType: Record<string, number>;
}

function RuleFires({ byType }: RuleFiresProps) {
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert size={22} />}
        title="No rule fire data"
        description="getMetrics() returned an empty by_type breakdown."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map(([type, count]) => (
        <li key={type} className="flex items-center gap-3">
          <span className="w-44 shrink-0 truncate font-mono text-xs text-[var(--text-muted)]">
            {type}
          </span>
          <div className="flex-1 rounded-full bg-[var(--bg-elevated)]">
            <div
              className="h-1.5 rounded-full bg-indigo-500 motion-safe:transition-all"
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums text-xs text-[var(--text-muted)]">
            {count}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface TopBlockedUser {
  userId: string;
  count: number;
}

function TopBlocked({ users }: { users: TopBlockedUser[] }) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users size={22} />}
        title="No blocked users"
        description="No BLOCK decisions found in the selected window."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      {users.map((u, i) => (
        <li key={u.userId} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-6 shrink-0 text-center text-xs font-semibold text-[var(--text-dim)]">
            {i + 1}
          </span>
          <span className="flex-1 truncate font-mono text-xs text-[var(--text-muted)]">
            {u.userId}
          </span>
          <Badge variant="danger" size="sm">
            {u.count} blocks
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function MfaConversion({ mfaFired, total }: { mfaFired: number; total: number }) {
  const pct = total > 0 ? Math.round((mfaFired / total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <StatCard label="MFA challenges" value={mfaFired} />
        <StatCard label="MFA rate" value={`${pct}%`} sub={`of ${total} total decisions`} />
      </div>
      {mfaFired === 0 && (
        <p className="text-sm text-[var(--text-dim)]">
          No MFA decisions found in this window. getDecisions returned no MFA actions.
        </p>
      )}
    </div>
  );
}

function aggregateDecisions(
  decisions: { decisions?: Array<{ action: string; userId: string }> } | null
): {
  topBlocked: TopBlockedUser[];
  mfaFired: number;
} {
  const allDecisions = decisions?.decisions ?? [];
  const blockedCounts: Record<string, number> = {};
  let mfaFired = 0;
  for (const d of allDecisions) {
    if (d.action === 'BLOCK') {
      blockedCounts[d.userId] = (blockedCounts[d.userId] ?? 0) + 1;
    }
    if (d.action === 'MFA') {
      mfaFired += 1;
    }
  }
  const topBlocked: TopBlockedUser[] = Object.entries(blockedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count]) => ({ userId, count }));
  return { topBlocked, mfaFired };
}

interface BreakdownSectionProps {
  loading: boolean;
  byType: Record<string, number>;
  topBlocked: TopBlockedUser[];
  decisionsError: ApiErrorDetail | null;
  decisions: { decisions?: Array<{ action: string; userId: string }> } | null;
  mfaFired: number;
  totalDecisions: number;
}

function BreakdownSection({
  loading,
  byType,
  topBlocked,
  decisionsError,
  decisions,
  mfaFired,
  totalDecisions,
}: BreakdownSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
            <ShieldAlert size={16} className="text-indigo-500 dark:text-indigo-400" />
            Fires by rule type
          </h2>
          {loading ? (
            <div className="space-y-2">
              {['b0', 'b1', 'b2', 'b3'].map((k) => (
                <Skeleton key={k} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <RuleFires byType={byType} />
          )}
        </section>
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
            <Users size={16} className="text-rose-500 dark:text-rose-400" />
            Top blocked users
          </h2>
          {loading ? (
            <div className="space-y-2">
              {['c0', 'c1', 'c2'].map((k) => (
                <Skeleton key={k} className="h-10 w-full" />
              ))}
            </div>
          ) : decisionsError && !decisions ? (
            <EmptyState
              icon={<Users size={22} />}
              title="Could not load decisions"
              description={`getDecisions error: ${decisionsError.message}`}
            />
          ) : (
            <TopBlocked users={topBlocked} />
          )}
        </section>
      </div>
      <MfaSection
        loading={loading}
        decisionsError={decisionsError}
        decisions={decisions}
        mfaFired={mfaFired}
        totalDecisions={totalDecisions}
      />
    </>
  );
}

interface MfaSectionProps {
  loading: boolean;
  decisionsError: ApiErrorDetail | null;
  decisions: { decisions?: Array<{ action: string; userId: string }> } | null;
  mfaFired: number;
  totalDecisions: number;
}

function MfaSection({
  loading,
  decisionsError,
  decisions,
  mfaFired,
  totalDecisions,
}: MfaSectionProps) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
        <CheckSquare size={16} className="text-emerald-500 dark:text-emerald-400" />
        MFA conversion
      </h2>
      {loading ? (
        <div className="flex gap-4">
          <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
          <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        </div>
      ) : decisionsError && !decisions ? (
        <EmptyState
          icon={<CheckSquare size={22} />}
          title="MFA data unavailable"
          description="getDecisions() call failed, cannot compute MFA rate."
        />
      ) : (
        <MfaConversion mfaFired={mfaFired} total={totalDecisions} />
      )}
    </section>
  );
}

export default function InsightsPage() {
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

  const metrics = metricsQuery.data?.data ?? null;
  const decisions = decisionsQuery.data?.data ?? null;
  const metricsError: ApiErrorDetail | null = metricsQuery.data?.error ?? null;
  const decisionsError: ApiErrorDetail | null = decisionsQuery.data?.error ?? null;
  const loading = metricsQuery.isLoading || decisionsQuery.isLoading;

  const { topBlocked, mfaFired } = useMemo(() => aggregateDecisions(decisions), [decisions]);
  const allDecisions = decisions?.decisions ?? [];
  const byType = metrics?.totals?.by_type ?? {};

  if (metricsError && !metrics && decisionsError && !decisions) {
    return (
      <AuthGate
        error={metricsError}
        onRetry={() => {
          metricsQuery.refetch();
          decisionsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Insights</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Engine performance and fraud breakdown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-surface)] p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setActiveWindow(w)}
                className={`rounded px-3 py-1 text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
                  activeWindow === w
                    ? 'bg-[var(--text)] text-[var(--bg)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              metricsQuery.refetch();
              decisionsQuery.refetch();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-4">
          {['k0', 'k1', 'k2'].map((k) => (
            <div
              key={k}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {!loading && metrics && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total decisions"
            value={metrics.totals.total.toLocaleString()}
            sub={`last ${activeWindow}`}
          />
          <StatCard
            label="L1 only"
            value={metrics.totals.l1.toLocaleString()}
            sub={`${metrics.totals.total > 0 ? Math.round((metrics.totals.l1 / metrics.totals.total) * 100) : 0}% of total`}
          />
          <StatCard
            label="L1 + LLM"
            value={metrics.totals.l1plus_l2.toLocaleString()}
            sub={`est. cost $${metrics.costEstimateUsd.toFixed(4)}`}
          />
        </div>
      )}

      {!loading && metricsError && !metrics && (
        <EmptyState
          icon={<BarChart2 size={22} />}
          title="Metrics unavailable"
          description={`getMetrics('${activeWindow}') error: ${metricsError.message}`}
          action={
            <Button variant="secondary" size="sm" onClick={() => metricsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Score and engine routing
        </h2>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <ScoreDistributionChart window={activeWindow} height={260} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Decisions over time
            </h3>
            <DecisionsOverTimeChart window={activeWindow} height={220} />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              By type
            </h3>
            <TypeDonutChart window={activeWindow} height={220} />
          </div>
        </div>
      </section>

      <BreakdownSection
        loading={loading}
        byType={byType}
        topBlocked={topBlocked}
        decisionsError={decisionsError}
        decisions={decisions}
        mfaFired={mfaFired}
        totalDecisions={allDecisions.length}
      />
    </div>
  );
}
