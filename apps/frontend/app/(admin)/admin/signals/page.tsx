'use client';

import { ArrowClockwise, CaretDown, CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import {
  getSignals,
  type SignalRow,
  type SignalsListResponse,
  type SignalType,
  type SignalWindow,
} from '@/lib/admin-api';
import type { ApiResult } from '@/lib/types';

const WINDOWS: SignalWindow[] = ['1h', '24h', '7d', '30d'];

const SIGNAL_TYPES: Array<{ value: '' | SignalType; label: string }> = [
  { value: '', label: 'All signals' },
  { value: 'rage_click', label: 'Rage click' },
  { value: 'dwell_no_action', label: 'Dwell - no action' },
  { value: 'abandoned_flow_step', label: 'Abandoned flow step' },
  { value: 'repeated_query', label: 'Repeated query' },
  { value: 'points_balance_stare', label: 'Balance stare' },
];

const SIGNAL_PILL_COLORS: Record<string, string> = {
  rage_click:
    'bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)] border-[color:var(--danger-border)]',
  dwell_no_action:
    'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  abandoned_flow_step:
    'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  repeated_query:
    'bg-[color:var(--accent-violet-bg)] text-[color:var(--accent-violet-fg)] border-[color:var(--accent-violet-border)]',
  points_balance_stare:
    'bg-[color:var(--accent-sky-bg)] text-[color:var(--accent-sky-fg)] border-[color:var(--accent-sky-border)]',
};

const SIGNAL_PILL_DEFAULT =
  'bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] border-[color:var(--border-strong)]';

const SKELETON_ROWS = ['s0', 's1', 's2', 's3', 's4', 's5'];

function pollIntervalMs(w: SignalWindow): number {
  if (w === '1h') return 5_000;
  if (w === '24h') return 15_000;
  return 60_000;
}

function formatTimeAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

function signalPillClass(signal: string): string {
  return SIGNAL_PILL_COLORS[signal] ?? SIGNAL_PILL_DEFAULT;
}

function signalLabel(signal: string): string {
  const found = SIGNAL_TYPES.find((s) => s.value === signal);
  return found ? found.label : signal;
}

interface SignalRowItemProps {
  row: SignalRow;
}

function SignalRowItem({ row }: SignalRowItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="divide-y divide-[color:var(--border)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full grid grid-cols-12 items-start gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        aria-expanded={expanded}
      >
        <div className="col-span-3">
          <div className="text-[color:var(--text)]">{formatTimeAgo(row.activityTime)}</div>
          <div className="text-[11px] text-[color:var(--text-dim)] tabular-nums">
            {formatTimestamp(row.activityTime)}
          </div>
        </div>
        <div className="col-span-2">
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${signalPillClass(row.signal)}`}
          >
            {signalLabel(row.signal)}
          </span>
        </div>
        <div className="col-span-2 truncate font-mono text-xs text-[color:var(--text-muted)]">
          {row.userId}
        </div>
        <div className="col-span-3 truncate text-xs text-[color:var(--text-dim)]">
          <span className="font-mono">{row.target || '-'}</span>
        </div>
        <div className="col-span-1 truncate text-xs text-[color:var(--text-muted)]">
          {row.contextSummary}
        </div>
        <div className="col-span-1 flex items-center justify-end text-[color:var(--text-dim)]">
          {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
        </div>
      </button>

      {expanded ? (
        <div className="px-4 py-3 bg-[color:var(--bg-surface)]/60">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
            Full payload
          </div>
          <pre className="overflow-x-auto rounded-md bg-[color:var(--bg)] p-3 text-[11px] text-[color:var(--text-muted)] leading-relaxed">
            {JSON.stringify(
              {
                activityId: row.activityId,
                userId: row.userId,
                signal: row.signal,
                target: row.target,
                activityTime: row.activityTime,
                count: row.count,
                score: row.score,
                action: row.action,
                sessionId: row.sessionId,
                ruleId: row.ruleId,
                trustScore: row.trustScore,
                scrollDepth: row.scrollDepth,
                context: row.context,
              },
              null,
              2
            )}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

export default function SignalsPage() {
  const [activeWindow, setActiveWindow] = useState<SignalWindow>('24h');
  const [signalFilter, setSignalFilter] = useState<'' | SignalType>('');
  const [userIdInput, setUserIdInput] = useState('');
  const [userIdApplied, setUserIdApplied] = useState('');
  const [result, setResult] = useState<ApiResult<SignalsListResponse> | null>(null);

  const query = useMemo(
    () => ({
      window: activeWindow,
      signal: signalFilter || undefined,
      userId: userIdApplied || undefined,
      limit: 100,
    }),
    [activeWindow, signalFilter, userIdApplied]
  );

  const load = useCallback(async () => {
    const res = await getSignals(query);
    setResult(res);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await getSignals(query);
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

  const data = result?.data ?? null;
  const apiErr = result?.error ?? null;
  const loading = result === null;

  if (apiErr && !data) {
    return <AuthGate error={apiErr} onRetry={load} />;
  }

  const rows = data?.signals ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--text)]">Signal history</h1>
          <p className="mt-1 text-sm text-[color:var(--text-dim)]">
            Engagement signals captured by the SDK. Click a row for full payload.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <ArrowClockwise size={12} />
          Refresh
        </button>
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

        <div className="flex flex-wrap gap-1.5">
          {SIGNAL_TYPES.map((opt) => (
            <button
              key={opt.value || 'ALL'}
              type="button"
              onClick={() => setSignalFilter(opt.value as '' | SignalType)}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                signalFilter === opt.value
                  ? opt.value
                    ? signalPillClass(opt.value)
                    : 'bg-[color:var(--accent)] text-[color:var(--accent-fg)] border-transparent'
                  : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setUserIdApplied(userIdInput.trim());
          }}
        >
          <label className="sr-only" htmlFor="signal-user-filter">
            User ID
          </label>
          <div className="flex items-center rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-2">
            <MagnifyingGlass size={12} className="text-[color:var(--text-dim)]" />
            <input
              id="signal-user-filter"
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
          {loading ? 'Loading' : `${rows.length} signals`}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40">
        <div className="grid grid-cols-12 gap-3 border-b border-[color:var(--border)] px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
          <div className="col-span-3">When</div>
          <div className="col-span-2">Signal</div>
          <div className="col-span-2">User</div>
          <div className="col-span-3">Target</div>
          <div className="col-span-1">Context</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="divide-y divide-[color:var(--border)]">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="grid grid-cols-12 gap-3 px-4 py-3">
                <Skeleton className="col-span-3 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-3 h-4" />
                <Skeleton className="col-span-1 h-4" />
                <Skeleton className="col-span-1 h-4" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[color:var(--text-dim)]">
            No signals match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((row) => (
              <SignalRowItem key={row.activityId} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
