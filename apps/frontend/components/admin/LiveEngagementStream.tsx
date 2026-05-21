'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { type DecisionRow, listEngagementDecisions } from '@/lib/admin-api';
import ActionPill from './ActionPill';
import EngineBadge from './EngineBadge';
import Skeleton from './Skeleton';

const ENGAGEMENT_TYPES = new Set(['ENGAGEMENT', 'ENGAGEMENT_OFFER', 'NUDGE', 'OFFER']);

const SIGNAL_LABEL: Record<string, string> = {
  rage_click: 'rage_click',
  dwell_no_action: 'dwell_no_action',
  points_balance_stare: 'points_balance_stare',
  abandoned_flow_step: 'abandoned_flow_step',
  repeated_query: 'repeated_query',
};

function signalOf(row: DecisionRow): string {
  // The backend may embed the signal name in reasonCode or explanation.
  const src = row.reasonCode ?? row.reason ?? row.explanation ?? '';
  for (const key of Object.keys(SIGNAL_LABEL)) {
    if (src.toLowerCase().includes(key.replace(/_/g, ''))) {
      return SIGNAL_LABEL[key] ?? key;
    }
  }
  // Derive from reasonCode pattern like DWELL_HIGH -> dwell_no_action
  if (/DWELL/i.test(src)) return 'dwell_no_action';
  if (/RAGE/i.test(src)) return 'rage_click';
  if (/STARE|POINTS/i.test(src)) return 'points_balance_stare';
  if (/ABANDON/i.test(src)) return 'abandoned_flow_step';
  return row.reasonCode ?? '-';
}

function formatRelative(epochSec: number): string {
  const diffMs = Date.now() - epochSec * 1000;
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function scoreTone(score: number): string {
  if (score >= 80) return 'bg-rose-500/20 text-rose-300';
  if (score >= 50) return 'bg-amber-500/20 text-amber-300';
  return 'bg-emerald-500/20 text-emerald-300';
}

const SKELETON_KEYS = ['s0', 's1', 's2'];

export default function LiveEngagementStream() {
  const [paused, setPaused] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [relativeLabel, setRelativeLabel] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['engagement-stream'],
    queryFn: async () => {
      const res = await listEngagementDecisions(3600);
      setLastUpdateAt(Date.now());
      return res.data;
    },
    refetchInterval: paused ? false : 5000,
    staleTime: 0,
  });

  // Keep the "last update Xs ago" label ticking every second.
  useEffect(() => {
    function tick() {
      if (lastUpdateAt === null) {
        setRelativeLabel('');
        return;
      }
      const s = Math.max(0, Math.round((Date.now() - lastUpdateAt) / 1000));
      setRelativeLabel(`${s}s ago`);
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [lastUpdateAt]);

  const rows = (data?.decisions ?? [])
    .filter((r) => ENGAGEMENT_TYPES.has(r.decisionType))
    .slice(0, 50);

  const isEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          Engagement signals - live
        </h2>
        <div className="flex items-center gap-3">
          {lastUpdateAt !== null && (
            <span className="text-[11px] text-[color:var(--text-dim)]">
              {paused ? (
                <span className="text-amber-400">Paused</span>
              ) : (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse mr-1" />
                  Live - last update {relativeLabel}
                </>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className={`rounded px-2 py-1 text-[11px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              paused
                ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="false" className="overflow-y-auto max-h-96">
        {isLoading && (
          <ul className="divide-y divide-[color:var(--border)]">
            {SKELETON_KEYS.map((k) => (
              <li key={k} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-8" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <p className="px-4 py-6 text-sm text-rose-400">Could not reach API. Retrying.</p>
        )}

        {isEmpty && (
          <div className="px-4 py-10 text-center text-sm text-[color:var(--text-dim)]">
            No engagement decisions in the last hour. Fire a signal from the Demo Panel.
          </div>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Signal</th>
                <th className="px-4 py-2">Engine</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]/60">
              {rows.map((row) => (
                <tr
                  key={row.decisionId}
                  className="text-sm hover:bg-[color:var(--bg-elevated)]/50 transition-colors motion-safe:animate-fade-in"
                >
                  <td className="px-4 py-2 text-[11px] text-[color:var(--text-dim)] tabular-nums whitespace-nowrap">
                    {formatRelative(row.timestamp)}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-[color:var(--text-muted)] truncate max-w-[80px]">
                    {row.userId}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-fuchsia-300">
                    {signalOf(row)}
                  </td>
                  <td className="px-4 py-2">
                    <EngineBadge layer={row.engineLayer} compact />
                  </td>
                  <td className="px-4 py-2">
                    <ActionPill action={row.action} />
                  </td>
                  <td className="px-4 py-2 text-[11px] text-[color:var(--text-dim)] truncate max-w-[120px]">
                    {row.reasonCode ?? row.reason ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${scoreTone(row.score)}`}
                    >
                      {Math.round(row.score)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-[color:var(--border)] px-4 py-2 text-[11px] text-[color:var(--text-dim)]">
        {rows.length > 0 ? `${rows.length} engagement decisions in last 1h` : 'Waiting for signals'}
      </div>
    </section>
  );
}
