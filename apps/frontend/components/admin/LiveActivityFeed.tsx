'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type DecisionRow, getDecisions } from '@/lib/admin-api';
import ActionPill from './ActionPill';
import DecisionDrawer from './DecisionDrawer';
import type { FeedFilter } from './FilterChips';
import Skeleton from './Skeleton';

export type { FeedFilter } from './FilterChips';

const FRAUD_TYPES = new Set(['FRAUD_LOGIN', 'FRAUD_TRANSFER']);
const ENGAGEMENT_TYPES = new Set(['ENGAGEMENT_OFFER', 'ENGAGEMENT', 'NUDGE', 'OFFER']);

function matchesFilter(row: DecisionRow, filter: FeedFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'fraud') return FRAUD_TYPES.has(row.decisionType);
  if (filter === 'engagement') return ENGAGEMENT_TYPES.has(row.decisionType);
  return !FRAUD_TYPES.has(row.decisionType) && !ENGAGEMENT_TYPES.has(row.decisionType);
}

function formatHMS(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const TYPE_TONE: Record<string, string> = {
  FRAUD_LOGIN: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  FRAUD_TRANSFER: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  ENGAGEMENT_OFFER: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  ENGAGEMENT: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  NUDGE: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  OFFER: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  LOGIN: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  TRANSFER: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  MFA_VERIFY: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  PROFILE_COMPLETENESS: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DECISION_RELEASE: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};
const TYPE_FALLBACK = 'bg-zinc-800 text-zinc-300 border-zinc-700';

function typeTone(t: string): string {
  return TYPE_TONE[t] ?? TYPE_FALLBACK;
}

function scoreTone(score: number): string {
  if (score >= 80) return 'bg-rose-500/20 text-rose-300';
  if (score >= 50) return 'bg-amber-500/20 text-amber-300';
  return 'bg-emerald-500/20 text-emerald-300';
}

const SKELETON_KEYS = ['s0', 's1', 's2', 's3'];

interface LiveActivityFeedProps {
  filter?: FeedFilter;
}

export default function LiveActivityFeed({ filter = 'all' }: LiveActivityFeedProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['live-feed', filter],
    queryFn: async () => {
      const res = await getDecisions({ window: '1h', limit: 50 });
      return res.data;
    },
    refetchInterval: 2_000,
    staleTime: 0,
  });

  const rows = (data?.decisions ?? []).filter((r) => matchesFilter(r, filter)).slice(0, 50);

  const isEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <>
      <section className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Live activity
          </h2>
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            polling 2s
          </span>
        </div>

        <section
          aria-label="Live decision feed"
          aria-live="polite"
          aria-atomic="false"
          className="flex-1 overflow-y-auto"
        >
          {isLoading && (
            <ul className="divide-y divide-zinc-800">
              {SKELETON_KEYS.map((k) => (
                <li key={k} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isError && (
            <p className="px-4 py-6 text-sm text-rose-400">Could not reach API. Retrying.</p>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <p className="text-sm text-zinc-500">Waiting for activity</p>
              <p className="text-[11px] text-zinc-600">New decisions will appear here within 2s</p>
            </div>
          )}

          {!isLoading && !isError && rows.length > 0 && (
            <ul className="divide-y divide-zinc-800/60">
              {rows.map((row) => {
                const reason = (
                  row.reasonText ||
                  row.reasonCode ||
                  row.explanation ||
                  row.reason ||
                  ''
                ).slice(0, 60);
                return (
                  <li key={row.decisionId} className="motion-safe:animate-fade-in">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.decisionId)}
                      className="w-full px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">
                          {formatHMS(row.timestamp)}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeTone(row.decisionType)}`}
                        >
                          {row.decisionType}
                        </span>
                        <ActionPill action={row.action} />
                        <span className="max-w-[100px] shrink-0 truncate font-mono text-[11px] text-zinc-400">
                          {row.userId}
                        </span>
                        <span
                          className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${scoreTone(row.score)}`}
                        >
                          {Math.round(row.score)}
                        </span>
                        <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                          {row.engineLayer}
                        </span>
                      </div>
                      {reason && (
                        <p className="mt-1 truncate text-[11px] text-zinc-600">{reason}</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-600">
          {rows.length > 0 ? `${rows.length} decisions in last 1h` : 'Waiting for activity'}
        </div>
      </section>

      <DecisionDrawer decisionId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
