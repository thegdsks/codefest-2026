'use client';

import { ArrowClockwise, DownloadSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import DecisionDrawer from '@/components/admin/DecisionDrawer';
import DecisionFeedRow from '@/components/admin/DecisionFeedRow';
import { DECISION_TYPE_LABEL } from '@/components/admin/LiveActivityFeed';
import LiveEngagementStream from '@/components/admin/LiveEngagementStream';
import Skeleton from '@/components/admin/Skeleton';
import {
  type DecisionRow,
  type DecisionsListResponse,
  type DecisionType,
  exportDecisionsCsv,
  getDecisions,
  type Window,
} from '@/lib/admin-api';
import type { ApiResult } from '@/lib/types';
import { useDecisionGroups } from '@/lib/useDecisionGroups';

const FRAUD_TYPES_SET = new Set<string>(['FRAUD_LOGIN', 'FRAUD_TRANSFER']);
const ENGAGEMENT_TYPES_SET = new Set<string>(['ENGAGEMENT_OFFER', 'NUDGE', 'ENGAGEMENT', 'OFFER']);

const WINDOWS: Window[] = ['5m', '1h', '6h', '24h', '7d', '30d'];

function pollIntervalMs(w: Window): number {
  if (w === '5m') return 2_000;
  if (w === '1h') return 5_000;
  if (w === '6h' || w === '24h') return 15_000;
  return 60_000;
}

const TYPE_OPTIONS: Array<{ value: '' | DecisionType; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'FRAUD_LOGIN', label: DECISION_TYPE_LABEL.FRAUD_LOGIN },
  { value: 'FRAUD_TRANSFER', label: DECISION_TYPE_LABEL.FRAUD_TRANSFER },
  { value: 'ENGAGEMENT_OFFER', label: DECISION_TYPE_LABEL.ENGAGEMENT_OFFER },
  { value: 'NUDGE', label: DECISION_TYPE_LABEL.NUDGE },
  { value: 'PROFILE_COMPLETENESS', label: DECISION_TYPE_LABEL.PROFILE_COMPLETENESS },
  { value: 'MFA_VERIFY', label: DECISION_TYPE_LABEL.MFA_VERIFY },
  { value: 'DECISION_RELEASE', label: DECISION_TYPE_LABEL.DECISION_RELEASE },
  { value: 'LOGIN', label: DECISION_TYPE_LABEL.LOGIN },
  { value: 'TRANSFER', label: DECISION_TYPE_LABEL.TRANSFER },
  { value: 'OFFER', label: DECISION_TYPE_LABEL.OFFER },
];

const SKELETON_ROWS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];

const WINDOW_LABEL: Record<Window, string> = {
  '5m': 'Last 5 min',
  '1h': 'Last hour',
  '6h': 'Last 6 h',
  '24h': 'Last 24 h',
  '7d': 'Last 7 d',
  '30d': 'Last 30 d',
};

type QuickFilter = 'all' | 'fraud' | 'engagement' | 'blocked' | 'l2only';

const QUICK_CHIPS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'fraud', label: 'Logins / Transfers' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'l2only', label: 'L2 only' },
];

function QuickFilterChips({
  active,
  onChange,
}: {
  active: QuickFilter;
  onChange: (f: QuickFilter) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">Quick filter</legend>
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_CHIPS.map((chip) => {
          const isActive = chip.value === active;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onChange(chip.value)}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'inline-flex items-center rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-fg)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
                  : 'inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function computeKpiStats(rows: DecisionRow[]) {
  let total = 0;
  let transfers = 0;
  let logins = 0;
  let engagement = 0;
  let blocked = 0;
  let l2 = 0;
  for (const r of rows) {
    total += 1;
    if (r.decisionType === 'FRAUD_TRANSFER' || r.decisionType === 'TRANSFER') transfers += 1;
    else if (r.decisionType === 'FRAUD_LOGIN' || r.decisionType === 'LOGIN') logins += 1;
    else if (
      r.decisionType === 'ENGAGEMENT_OFFER' ||
      r.decisionType === 'NUDGE' ||
      r.decisionType === 'ENGAGEMENT' ||
      r.decisionType === 'OFFER'
    )
      engagement += 1;
    if (r.action === 'BLOCK') blocked += 1;
    if (r.engineLayer === 'L1+L2') l2 += 1;
  }
  return { total, transfers, logins, engagement, blocked, l2 };
}

function KpiStrip({
  rows,
  window: w,
  loading,
}: {
  rows: DecisionRow[];
  window: Window;
  loading: boolean;
}) {
  const stats = useMemo(() => computeKpiStats(rows), [rows]);

  if (loading) {
    return (
      <div className="mb-3 flex flex-wrap gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 px-4 py-2">
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }

  const windowLabel = WINDOW_LABEL[w];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 px-4 py-2 text-[11px] text-[color:var(--text-dim)]">
      <span className="font-medium text-[color:var(--text-muted)]">{windowLabel}:</span>
      <span>
        <span className="font-semibold text-[color:var(--text)]">{stats.total}</span> decisions
      </span>
      <span>
        <span className="font-semibold text-rose-400">{stats.logins}</span> logins
      </span>
      <span>
        <span className="font-semibold text-amber-400">{stats.transfers}</span> transfers
      </span>
      <span>
        <span className="font-semibold text-violet-400">{stats.engagement}</span> engagement
      </span>
      {stats.blocked > 0 ? (
        <span className="ml-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
          {stats.blocked} blocked
        </span>
      ) : null}
      {stats.l2 > 0 ? (
        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
          {stats.l2} L2
        </span>
      ) : null}
    </div>
  );
}

function applyQuickFilter(
  rows: DecisionRow[],
  quickFilter: QuickFilter,
  search: string
): DecisionRow[] {
  return rows.filter((r) => {
    if (search && !r.userId.toLowerCase().includes(search.toLowerCase())) return false;
    if (quickFilter === 'blocked') return r.action === 'BLOCK';
    if (quickFilter === 'l2only') return r.engineLayer === 'L1+L2';
    if (quickFilter === 'fraud') return FRAUD_TYPES_SET.has(r.decisionType);
    if (quickFilter === 'engagement') return ENGAGEMENT_TYPES_SET.has(r.decisionType);
    return true;
  });
}

export default function DecisionsListPage() {
  const [activeWindow, setActiveWindow] = useState<Window>('24h');
  const [typeFilter, setTypeFilter] = useState<'' | DecisionType>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [userIdSearch, setUserIdSearch] = useState('');
  const [result, setResult] = useState<ApiResult<DecisionsListResponse> | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [drawerDecisionId, setDrawerDecisionId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      window: activeWindow,
      type: typeFilter || undefined,
      limit: 100,
    }),
    [activeWindow, typeFilter]
  );

  const load = useCallback(async () => {
    const res = await getDecisions(query);
    setResult(res);
  }, [query]);

  const handleExport = useCallback(async () => {
    setExportError(null);
    const res = await exportDecisionsCsv(query);
    if (res.error || !res.data) {
      setExportError(res.error?.message ?? 'Export failed');
      return;
    }
    const objectUrl = URL.createObjectURL(res.data);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'decisions.csv';
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await getDecisions(query);
      if (!cancelled) setResult(res);
    };
    setResult(null);
    run();
    const id = setInterval(run, pollIntervalMs(activeWindow));
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [query, activeWindow]);

  const allRows = result?.data?.decisions ?? [];

  const filteredRows = useMemo(
    () => applyQuickFilter(allRows, quickFilter, userIdSearch),
    [allRows, quickFilter, userIdSearch]
  );

  const groups = useDecisionGroups(filteredRows);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleToggleGroup = useCallback((key: string) => {
    setExpandedGroupKey((prev) => (prev === key ? null : key));
  }, []);

  const err = result?.error ?? null;
  const loading = result === null;

  if (err && !result?.data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <LiveEngagementStream />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">Decision feed</h1>
          <p className="mt-1 text-sm text-[color:var(--text-dim)]">
            Newest first. Expand a row inline or click through for the full audit trail.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <DownloadSimple size={12} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <ArrowClockwise size={12} />
              Refresh
            </button>
          </div>
          {exportError ? <p className="text-xs text-rose-400">{exportError}</p> : null}
        </div>
      </div>

      <KpiStrip rows={filteredRows} window={activeWindow} loading={loading} />

      <div className="mb-3">
        <QuickFilterChips active={quickFilter} onChange={setQuickFilter} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-3">
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

        <label className="sr-only" htmlFor="type-filter">
          Type
        </label>
        <select
          id="type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as '' | DecisionType)}
          className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-xs text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value || 'ALL'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2">
          <MagnifyingGlass size={12} className="text-[color:var(--text-dim)]" />
          <label className="sr-only" htmlFor="user-id-search">
            Filter by userId
          </label>
          <input
            id="user-id-search"
            type="text"
            value={userIdSearch}
            onChange={(e) => setUserIdSearch(e.target.value)}
            placeholder="Filter by userId"
            className="bg-transparent px-2 py-1.5 text-xs text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-dim)] focus-visible:outline-none"
          />
          {userIdSearch ? (
            <button
              type="button"
              aria-label="Clear user filter"
              onClick={() => setUserIdSearch('')}
              className="text-[color:var(--text-dim)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div
          aria-live="polite"
          aria-atomic="true"
          className="ml-auto text-xs text-[color:var(--text-dim)]"
        >
          {loading ? 'Loading' : `${filteredRows.length} rows`}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40">
        <div className="flex items-center gap-3 border-b border-[color:var(--border)] py-2 pl-10 pr-8 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
          <div className="w-24 shrink-0">When</div>
          <div className="w-24 shrink-0">User</div>
          <div className="min-w-0 flex-1">Detail</div>
          <div className="shrink-0">Action</div>
          <div className="w-12 shrink-0 text-right">Score</div>
          <div className="hidden w-16 shrink-0 md:block">Engine</div>
          <div className="w-8 shrink-0" />
        </div>

        {loading ? (
          <div className="divide-y divide-[color:var(--border)]">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[color:var(--text-dim)]">
            No decisions match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {groups.map((group) => (
              <li key={group.key}>
                <DecisionFeedRow
                  group={group}
                  expandedId={expandedId}
                  expandedGroupKey={expandedGroupKey}
                  onToggleExpand={handleToggleExpand}
                  onToggleGroup={handleToggleGroup}
                  onOpenDrawer={(id) => setDrawerDecisionId(id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <DecisionDrawer decisionId={drawerDecisionId} onClose={() => setDrawerDecisionId(null)} />
    </div>
  );
}
