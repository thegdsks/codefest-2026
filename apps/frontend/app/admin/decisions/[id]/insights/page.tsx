'use client';

import { ArrowClockwise, ArrowLeft, ChartBar } from '@phosphor-icons/react';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import ActionPill from '@/components/admin/ActionPill';
import Skeleton from '@/components/admin/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import {
  type DecisionDetailResponse,
  type DecisionRow,
  getDecision,
  getDecisions,
} from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

function formatTimeAgo(epochSec: number): string {
  const diffMs = Date.now() - epochSec * 1000;
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function DecisionRow_({ row }: { row: DecisionRow }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-elevated)]">
      <span className="w-20 shrink-0 tabular-nums text-[11px] text-zinc-500">
        {formatTimeAgo(row.timestamp)}
      </span>
      <span className="shrink-0 text-[11px] text-zinc-300">{row.decisionType}</span>
      <ActionPill action={row.action} />
      <span className="ml-auto shrink-0 tabular-nums text-[11px] text-zinc-400">
        score {Math.round(row.score)}
      </span>
    </li>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DecisionInsightsPage({ params }: PageProps) {
  const { id } = use(params);
  const decodedId = decodeURIComponent(id);

  const [detail, setDetail] = useState<DecisionDetailResponse | null>(null);
  const [related, setRelated] = useState<DecisionRow[] | null>(null);
  const [detailError, setDetailError] = useState<ApiErrorDetail | null>(null);
  const [relatedError, setRelatedError] = useState<ApiErrorDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(true);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    const res = await getDecision(decodedId);
    setLoadingDetail(false);
    if (res.error) {
      setDetailError(res.error);
    } else {
      setDetail(res.data);
    }
  }, [decodedId]);

  const loadRelated = useCallback(
    async (userId: string) => {
      setLoadingRelated(true);
      const res = await getDecisions({ userId, window: '24h', limit: 20 });
      setLoadingRelated(false);
      if (res.error) {
        setRelatedError(res.error);
      } else {
        setRelated((res.data?.decisions ?? []).filter((d) => d.decisionId !== decodedId));
      }
    },
    [decodedId]
  );

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (detail?.decision?.userId) {
      loadRelated(detail.decision.userId);
    }
  }, [detail, loadRelated]);

  const clustered = useMemo(() => {
    if (!related || !detail) return [];
    const pivot = detail.decision.timestamp;
    const WINDOW_SEC = 300; // 5 minutes around the decision
    return related.filter((d) => Math.abs(d.timestamp - pivot) <= WINDOW_SEC);
  }, [related, detail]);

  const decision = detail?.decision;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/admin/decisions/${encodeURIComponent(decodedId)}`}
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          aria-label="Back to decision"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold text-zinc-100">Decision insights</h1>
        <div className="ml-auto">
          <IconButton
            label="Reload"
            onClick={() => {
              loadDetail();
              if (decision?.userId) loadRelated(decision.userId);
            }}
            disabled={loadingDetail}
          >
            <ArrowClockwise size={16} className={loadingDetail ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {loadingDetail && (
        <div className="mb-6 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}

      {detailError && (
        <EmptyState
          icon={<ChartBar size={22} />}
          title="Decision not found"
          description={`GET /admin/decisions/${decodedId} returned: ${detailError.message}`}
        />
      )}

      {decision && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-zinc-400">{decision.decisionId}</span>
            <ActionPill action={decision.action} />
            <span className="text-xs text-zinc-300">{decision.decisionType}</span>
            <span className="ml-auto font-mono text-xs text-zinc-400">user: {decision.userId}</span>
          </div>
          {decision.correlationId && (
            <div className="mt-1 font-mono text-[11px] text-zinc-600">
              correlation: {decision.correlationId}
            </div>
          )}
        </div>
      )}

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Related decisions (same user, last 24h)
          </h2>
          {loadingRelated && !related && (
            <div className="space-y-2">
              {['r0', 'r1', 'r2'].map((k) => (
                <Skeleton key={k} className="h-10 w-full" />
              ))}
            </div>
          )}
          {relatedError && (
            <EmptyState
              icon={<ChartBar size={22} />}
              title="Could not load related decisions"
              description={`getDecisions({userId}) error: ${relatedError.message}`}
            />
          )}
          {related !== null && related.length === 0 && !relatedError && (
            <EmptyState
              icon={<ChartBar size={22} />}
              title="No other decisions in the last 24h"
              description="This is the only decision for this user in the selected window."
            />
          )}
          {related !== null && related.length > 0 && (
            <ul
              aria-live="polite"
              className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
            >
              {related.map((row) => (
                <DecisionRow_ key={row.decisionId} row={row} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Time-clustered events (within 5 min)
          </h2>
          {!loadingRelated && clustered.length === 0 && (
            <EmptyState
              icon={<ChartBar size={22} />}
              title="No clustered events"
              description="No other decisions occurred within 5 minutes of this one."
            />
          )}
          {clustered.length > 0 && (
            <ul
              aria-live="polite"
              className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
            >
              {clustered.map((row) => (
                <DecisionRow_ key={row.decisionId} row={row} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
