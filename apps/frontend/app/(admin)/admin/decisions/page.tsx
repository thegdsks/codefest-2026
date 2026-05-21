'use client';

import {
  ArrowClockwise,
  CaretRight,
  DownloadSimple,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ActionPill from '@/components/admin/ActionPill';
import AuthGate from '@/components/admin/AuthGate';
import EngineBadge from '@/components/admin/EngineBadge';
import FilterChips, { type FeedFilter } from '@/components/admin/FilterChips';
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

const FILTER_FRAUD_TYPES: DecisionType[] = ['FRAUD_LOGIN', 'FRAUD_TRANSFER'];
const FILTER_ENGAGEMENT_TYPES: DecisionType[] = ['ENGAGEMENT_OFFER', 'NUDGE'];

const FRAUD_TYPES_SET = new Set<string>(FILTER_FRAUD_TYPES);
const ENGAGEMENT_TYPES_SET = new Set<string>(FILTER_ENGAGEMENT_TYPES);

function matchesFeedFilter(row: DecisionRow, f: FeedFilter): boolean {
  if (f === 'all') return true;
  if (f === 'fraud') return FRAUD_TYPES_SET.has(row.decisionType);
  if (f === 'engagement') return ENGAGEMENT_TYPES_SET.has(row.decisionType);
  return !FRAUD_TYPES_SET.has(row.decisionType) && !ENGAGEMENT_TYPES_SET.has(row.decisionType);
}

const WINDOWS: Window[] = ['1h', '24h', '7d'];

const TYPE_OPTIONS: Array<{ value: '' | DecisionType; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'FRAUD_LOGIN', label: 'FRAUD_LOGIN' },
  { value: 'FRAUD_TRANSFER', label: 'FRAUD_TRANSFER' },
  { value: 'ENGAGEMENT_OFFER', label: 'ENGAGEMENT_OFFER' },
  { value: 'NUDGE', label: 'NUDGE' },
  { value: 'PROFILE_COMPLETENESS', label: 'PROFILE_COMPLETENESS' },
  { value: 'MFA_VERIFY', label: 'MFA_VERIFY' },
  { value: 'DECISION_RELEASE', label: 'DECISION_RELEASE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'TRANSFER', label: 'TRANSFER' },
  { value: 'OFFER', label: 'OFFER' },
];

const POLL_MS = 5_000;

const SKELETON_ROWS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];

function formatTimeAgo(epochSec: number): string {
  const diffMs = Date.now() - epochSec * 1000;
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function reasonOf(row: DecisionRow): string {
  return row.reasonText || row.reasonCode || row.explanation || row.reason || '';
}

export default function DecisionsListPage() {
  const [activeWindow, setActiveWindow] = useState<Window>('24h');
  const [typeFilter, setTypeFilter] = useState<'' | DecisionType>('');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [userIdInput, setUserIdInput] = useState('');
  const [userIdApplied, setUserIdApplied] = useState('');
  const [result, setResult] = useState<ApiResult<DecisionsListResponse> | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      window: activeWindow,
      type: typeFilter || undefined,
      userId: userIdApplied || undefined,
      limit: 100,
    }),
    [activeWindow, typeFilter, userIdApplied]
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
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [query]);

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  if (err && !data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  const rows = (data?.decisions ?? []).filter((r) => matchesFeedFilter(r, feedFilter));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">Decision feed</h1>
          <p className="mt-1 text-sm text-[color:var(--text-dim)]">
            Newest first. Filter, click a row for the audit trail.
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

      <div className="mb-3">
        <FilterChips active={feedFilter} onChange={setFeedFilter} />
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

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setUserIdApplied(userIdInput.trim());
          }}
        >
          <label className="sr-only" htmlFor="user-id-filter">
            User ID
          </label>
          <div className="flex items-center rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2">
            <MagnifyingGlass size={12} className="text-[color:var(--text-dim)]" />
            <input
              id="user-id-filter"
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="userId e.g. USER#001"
              className="bg-transparent px-2 py-1.5 text-xs text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            />
            {userIdApplied ? (
              <button
                type="button"
                aria-label="Clear user filter"
                onClick={() => {
                  setUserIdInput('');
                  setUserIdApplied('');
                }}
                className="text-[color:var(--text-dim)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Apply
          </button>
        </form>

        <div
          aria-live="polite"
          aria-atomic="true"
          className="ml-auto text-xs text-[color:var(--text-dim)]"
        >
          {loading ? 'Loading' : `${rows.length} rows`}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40">
        <div className="grid grid-cols-12 gap-3 border-b border-[color:var(--border)] px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
          <div className="col-span-3">When</div>
          <div className="col-span-2">User</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1">Action</div>
          <div className="col-span-1 text-right">Score</div>
          <div className="col-span-2">Engine</div>
          <div className="col-span-1 text-right">More</div>
        </div>
        {loading ? (
          <div className="divide-y divide-[color:var(--border)]">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="grid grid-cols-12 gap-3 px-4 py-3">
                <Skeleton className="col-span-3 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-1 h-4" />
                <Skeleton className="col-span-1 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-1 h-4" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[color:var(--text-dim)]">
            No decisions match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((row) => {
              const href = `/admin/decisions/${encodeURIComponent(row.decisionId)}`;
              return (
                <li key={row.decisionId}>
                  <Link
                    href={href}
                    className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  >
                    <div className="col-span-3">
                      <div className="text-[color:var(--text)]">{formatTimeAgo(row.timestamp)}</div>
                      <div className="text-[11px] text-[color:var(--text-dim)] tabular-nums">
                        {new Date(row.timestamp * 1000).toLocaleString()}
                      </div>
                    </div>
                    <div className="col-span-2 truncate font-mono text-xs text-[color:var(--text-muted)]">
                      {row.userId}
                    </div>
                    <div className="col-span-2 truncate text-xs text-[color:var(--text-muted)]">
                      {row.decisionType}
                    </div>
                    <div className="col-span-1">
                      <ActionPill action={row.action} />
                    </div>
                    <div className="col-span-1 text-right tabular-nums text-[color:var(--text)]">
                      {Math.round(row.score)}
                    </div>
                    <div className="col-span-2">
                      <EngineBadge
                        layer={row.engineLayer}
                        llmLatencyMs={row.llmLatencyMs}
                        compact
                      />
                      {row.engineLayer === 'L1+L2' && typeof row.llmLatencyMs === 'number' ? (
                        <div className="mt-0.5 text-[11px] text-[color:var(--text-dim)] tabular-nums">
                          {row.llmLatencyMs} ms
                        </div>
                      ) : null}
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-1 text-[color:var(--text-dim)]">
                      <span className="truncate text-[11px]" title={reasonOf(row)}>
                        {reasonOf(row).slice(0, 18)}
                      </span>
                      <CaretRight size={14} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
