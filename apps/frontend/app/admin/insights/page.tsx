'use client';

import { ArrowClockwise, ChartBar, Checks, ShieldWarning, Users } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import {
  type DecisionsListResponse,
  getDecisions,
  getMetrics,
  type MetricsResponse,
} from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
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
        icon={<ShieldWarning size={22} />}
        title="No rule fire data"
        description="getMetrics() returned an empty by_type breakdown."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map(([type, count]) => (
        <li key={type} className="flex items-center gap-3">
          <span className="w-44 shrink-0 truncate font-mono text-[11px] text-zinc-300">{type}</span>
          <div className="flex-1 rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums text-[11px] text-zinc-400">
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

interface TopBlockedProps {
  users: TopBlockedUser[];
}

function TopBlocked({ users }: TopBlockedProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users size={22} />}
        title="No blocked users"
        description="No BLOCK decisions found in the last 24h. getDecisions({window:'24h'}) returned no BLOCK actions."
      />
    );
  }

  return (
    <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {users.map((u, i) => (
        <li key={u.userId} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-6 shrink-0 text-center text-[11px] font-semibold text-zinc-500">
            {i + 1}
          </span>
          <span className="flex-1 truncate font-mono text-xs text-zinc-300">{u.userId}</span>
          <Badge variant="danger" size="sm">
            {u.count} blocks
          </Badge>
        </li>
      ))}
    </ul>
  );
}

interface MfaConversionProps {
  mfaFired: number;
  total: number;
}

function MfaConversion({ mfaFired, total }: MfaConversionProps) {
  const pct = total > 0 ? Math.round((mfaFired / total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <StatCard label="MFA challenges" value={mfaFired} />
        <StatCard label="MFA rate" value={`${pct}%`} sub={`of ${total} total decisions`} />
      </div>
      {mfaFired === 0 && (
        <p className="text-xs text-zinc-500">
          No MFA decisions found in the 24h window. getDecisions result had no MFA actions.
        </p>
      )}
    </div>
  );
}

interface AggResult {
  topBlocked: TopBlockedUser[];
  mfaFired: number;
}

function aggregateDecisions(decisions: DecisionsListResponse | null): AggResult {
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

export default function InsightsPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [decisions, setDecisions] = useState<DecisionsListResponse | null>(null);
  const [metricsError, setMetricsError] = useState<ApiErrorDetail | null>(null);
  const [decisionsError, setDecisionsError] = useState<ApiErrorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMetricsError(null);
    setDecisionsError(null);

    const [mRes, dRes] = await Promise.all([
      getMetrics('24h'),
      getDecisions({ window: '24h', limit: 500 }),
    ]);

    setLoading(false);

    if (mRes.error) setMetricsError(mRes.error);
    else setMetrics(mRes.data);

    if (dRes.error) setDecisionsError(dRes.error);
    else setDecisions(dRes.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (metricsError && !metrics && decisionsError && !decisions) {
    return <AuthGate error={metricsError} onRetry={load} />;
  }

  const { topBlocked, mfaFired } = aggregateDecisions(decisions);
  const allDecisions = decisions?.decisions ?? [];
  const byType = metrics?.totals?.by_type ?? {};

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Insights</h1>
          <p className="mt-1 text-sm text-zinc-500">KPI rollup for the last 24 hours.</p>
        </div>
        <IconButton label="Reload insights" onClick={load} disabled={loading}>
          <ArrowClockwise size={16} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {['k0', 'k1', 'k2'].map((k) => (
            <div key={k} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {!loading && metrics && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard
            label="Total decisions"
            value={metrics.totals.total.toLocaleString()}
            sub="last 24h"
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
          icon={<ChartBar size={22} />}
          title="Metrics unavailable"
          description={`getMetrics('24h') error: ${metricsError.message}`}
          action={
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <ShieldWarning size={16} className="text-indigo-400" />
            24h fires by rule type
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
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Users size={16} className="text-rose-400" />
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
              description={`getDecisions({window:'24h'}) error: ${decisionsError.message}`}
            />
          ) : (
            <TopBlocked users={topBlocked} />
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Checks size={16} className="text-emerald-400" />
          MFA conversion
        </h2>
        {loading ? (
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-12" />
            </div>
            <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-12" />
            </div>
          </div>
        ) : decisionsError && !decisions ? (
          <EmptyState
            icon={<Checks size={22} />}
            title="MFA data unavailable"
            description="getDecisions() call failed, cannot compute MFA rate."
          />
        ) : (
          <MfaConversion mfaFired={mfaFired} total={allDecisions.length} />
        )}
      </section>
    </div>
  );
}
