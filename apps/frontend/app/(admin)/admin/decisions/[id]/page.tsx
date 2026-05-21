'use client';

import { ArrowLeft, CheckCircle, ShieldSlash } from '@phosphor-icons/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import ActionPill from '@/components/admin/ActionPill';
import AuthGate from '@/components/admin/AuthGate';
import EngineBadge from '@/components/admin/EngineBadge';
import Skeleton from '@/components/admin/Skeleton';
import { type DecisionDetailResponse, getDecision, releaseDecision } from '@/lib/admin-api';
import type { ApiErrorDetail, ApiResult } from '@/lib/types';

function canRelease(action: string): boolean {
  const a = action.toUpperCase();
  return a === 'BLOCK' || a === 'HOLD';
}

function reasonOf(row: DecisionDetailResponse['decision']): string {
  return row.reasonText || row.explanation || row.reasonCode || row.reason || '';
}

interface RowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function Row({ label, value, mono = false }: RowProps) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[var(--border)] px-4 py-2.5 text-sm last:border-0">
      <dt className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className={`col-span-2 text-[var(--text)] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  const decisionId = params?.id ? decodeURIComponent(params.id) : '';

  const [result, setResult] = useState<ApiResult<DecisionDetailResponse> | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<ApiErrorDetail | null>(null);
  const [releaseOk, setReleaseOk] = useState(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!decisionId) return;
    const res = await getDecision(decisionId);
    setResult(res);
  }, [decisionId]);

  useEffect(() => {
    setResult(null);
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    },
    []
  );

  const onRelease = async () => {
    setReleasing(true);
    setReleaseError(null);
    setReleaseOk(false);
    const res = await releaseDecision(decisionId);
    setReleasing(false);
    if (res.error) {
      setReleaseError(res.error);
    } else {
      setReleaseOk(true);
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(load, 500);
    }
  };

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  if (err && !data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  const decision = data?.decision ?? null;
  const trail = data?.auditTrail ?? [];
  const releasable = decision ? canRelease(decision.action) : false;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link
          href="/admin/decisions"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <ArrowLeft size={14} />
          Back to decisions
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl text-[var(--text)]">{decisionId || '...'}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Single decision row plus a synthesized audit trail.
          </p>
        </div>
        {decision && releasable ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onRelease}
              disabled={releasing}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              <ShieldSlash size={12} />
              {releasing ? 'Releasing' : 'Release this block'}
            </button>
            {releaseOk ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
                <CheckCircle size={12} />
                Released. Refreshing.
              </span>
            ) : null}
            {releaseError ? (
              <span className="text-xs text-rose-600 dark:text-rose-300">
                {releaseError.code}: {releaseError.message}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] lg:col-span-2">
          <div className="border-b border-[var(--border)] px-4 py-3 text-base font-semibold text-[var(--text)]">
            Decision row
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-full" rows={6} />
            </div>
          ) : decision ? (
            <dl>
              <Row label="Decision ID" value={decision.decisionId} mono />
              <Row label="User" value={decision.userId} mono />
              <Row label="Type" value={decision.decisionType} />
              <Row
                label="Action"
                value={
                  <span className="inline-flex items-center gap-2">
                    <ActionPill action={decision.action} />
                    <span className="text-xs text-[var(--text-dim)]">
                      score {Math.round(decision.score)}
                    </span>
                    {decision.riskLevel ? (
                      <span className="text-xs text-[var(--text-dim)]">
                        risk {decision.riskLevel}
                      </span>
                    ) : null}
                  </span>
                }
              />
              <Row
                label="Engine"
                value={
                  <EngineBadge
                    layer={decision.engineLayer}
                    llmLatencyMs={decision.llmLatencyMs}
                    llmModel={decision.llmModel}
                  />
                }
              />
              <Row label="Reason" value={reasonOf(decision) || '-'} />
              <Row label="Channel" value={decision.channel || '-'} />
              <Row
                label="Timestamp"
                value={`${new Date(decision.timestamp * 1000).toLocaleString()} (${decision.timestamp})`}
              />
              <Row label="Correlation" value={decision.correlationId || '-'} mono />
              <Row label="Final" value={decision.isFinalDecision ? 'yes' : 'no'} />
              {decision.originalDecisionId ? (
                <Row label="Releases" value={decision.originalDecisionId} mono />
              ) : null}
              <Row label="Model" value={decision.modelVersion || '-'} />
            </dl>
          ) : null}
        </section>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-base font-semibold text-[var(--text)]">
            Audit trail
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-12 w-full" rows={2} />
            </div>
          ) : trail.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--text-dim)]">No audit steps.</div>
          ) : (
            <ol className="relative px-4 py-4">
              {trail.map((step, idx) => (
                <li key={step.step} className="relative pb-4 pl-6 last:pb-0">
                  <span className="absolute left-0 top-1 inline-flex h-3 w-3 items-center justify-center rounded-full border border-indigo-400/60 bg-[var(--bg)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                  </span>
                  {idx < trail.length - 1 ? (
                    <span className="absolute left-[5px] top-4 h-full w-px bg-[var(--border)]" />
                  ) : null}
                  <div className="text-sm font-medium text-[var(--text)]">{step.step}</div>
                  <dl className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                    {step.action ? (
                      <div>
                        action: <span className="text-[var(--text)]">{step.action}</span>
                      </div>
                    ) : null}
                    {typeof step.score === 'number' ? (
                      <div>
                        score: <span className="text-[var(--text)]">{Math.round(step.score)}</span>
                      </div>
                    ) : null}
                    {step.riskLevel ? (
                      <div>
                        risk: <span className="text-[var(--text)]">{step.riskLevel}</span>
                      </div>
                    ) : null}
                    {step.reasonCode ? (
                      <div>
                        reason: <span className="text-[var(--text)]">{step.reasonCode}</span>
                      </div>
                    ) : null}
                    {step.llmModel ? (
                      <div>
                        model: <span className="text-[var(--text)]">{step.llmModel}</span>
                      </div>
                    ) : null}
                    {typeof step.llmLatencyMs === 'number' ? (
                      <div>
                        latency:{' '}
                        <span className="tabular-nums text-[var(--text)]">
                          {step.llmLatencyMs} ms
                        </span>
                      </div>
                    ) : null}
                    {step.label && step.label !== step.action ? (
                      <div>
                        label: <span className="text-[var(--text)]">{step.label}</span>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
