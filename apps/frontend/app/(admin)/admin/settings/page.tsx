'use client';

import { Check, Circle, X } from '@phosphor-icons/react';
import { Database, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AiModelCatalog from '@/components/admin/AiModelCatalog';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import {
  adminApiConfig,
  type DevConfigResponse,
  getDevConfig,
  getHealth,
  getMetrics,
  type HealthResponse,
  type MetricsResponse,
  type ReseedResponse,
  reseedDemo,
} from '@/lib/admin-api';
import type { ApiErrorDetail, ApiResult } from '@/lib/types';

interface SettingsState {
  health: ApiResult<HealthResponse> | null;
  metrics: ApiResult<MetricsResponse> | null;
  devConfig: ApiResult<DevConfigResponse> | null;
}

type ReseedStatus =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'running' }
  | { kind: 'success'; result: ReseedResponse }
  | { kind: 'error'; message: string };

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <Circle size={10} className="fill-[var(--text-dim)] text-[var(--text-dim)]" strokeWidth={0} />
    );
  return ok ? (
    <Check size={12} className="text-emerald-500 dark:text-emerald-400" />
  ) : (
    <X size={12} className="text-rose-500 dark:text-rose-400" />
  );
}

function KV({
  label,
  value,
  ok = null,
}: {
  label: string;
  value: React.ReactNode;
  ok?: boolean | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-[var(--border)] px-4 py-2.5 text-sm last:border-0">
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <StatusDot ok={ok} />
        {label}
      </dt>
      <dd className="col-span-2 break-all font-mono text-xs text-[var(--text-muted)]">{value}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState<SettingsState>({
    health: null,
    metrics: null,
    devConfig: null,
  });
  const [reseedStatus, setReseedStatus] = useState<ReseedStatus>({ kind: 'idle' });
  const confirmRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [health, metrics, devConfig] = await Promise.all([
      getHealth(),
      getMetrics('24h'),
      getDevConfig(),
    ]);
    setState({ health, metrics, devConfig });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReseedClick = useCallback(() => {
    setReseedStatus({ kind: 'confirming' });
  }, []);

  const handleReseedConfirm = useCallback(async () => {
    setReseedStatus({ kind: 'running' });
    const res = await reseedDemo();
    if (res.error) {
      setReseedStatus({ kind: 'error', message: res.error.message });
      return;
    }
    if (res.data) {
      setReseedStatus({ kind: 'success', result: res.data });
    }
  }, []);

  const handleReseedCancel = useCallback(() => {
    setReseedStatus({ kind: 'idle' });
  }, []);

  const fatal: ApiErrorDetail | null =
    state.metrics?.error?.code === 'NETWORK_ERROR' ? state.metrics.error : null;

  const demoMode = state.devConfig?.data?.demoMode === true;

  if (fatal) {
    return <AuthGate error={fatal} onRetry={load} />;
  }

  const healthData = state.health?.data ?? null;
  const healthOk = state.health ? state.health.error === null : null;
  const metricsData = state.metrics?.data ?? null;
  const metricsOk = state.metrics ? state.metrics.error === null : null;

  const guard = metricsData?.guard as Record<string, unknown> | undefined;

  const envChecklist = [
    {
      key: 'NEXT_PUBLIC_API_BASE_URL',
      value: adminApiConfig.baseUrl,
      ok: Boolean(adminApiConfig.baseUrl),
    },
    {
      key: 'NEXT_PUBLIC_CLIENT_ID',
      value: adminApiConfig.clientId,
      ok: Boolean(adminApiConfig.clientId),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Configuration</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Read only. Confirms the SPA is wired to a live API and shows engine guard state.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <AiModelCatalog />

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-base font-semibold text-[var(--text)]">
            Frontend env
          </div>
          <dl>
            {envChecklist.map((row) => (
              <KV
                key={row.key}
                label={row.key}
                ok={row.ok}
                value={
                  row.value || <span className="text-rose-600 dark:text-rose-400">missing</span>
                }
              />
            ))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-base font-semibold text-[var(--text)]">
            API health
          </div>
          {!state.health ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-full" rows={3} />
            </div>
          ) : (
            <dl>
              <KV
                label="GET /health"
                ok={healthOk}
                value={healthOk ? 'reachable' : state.health.error?.message || 'unreachable'}
              />
              {healthData
                ? Object.entries(healthData).map(([k, v]) => (
                    <KV key={k} label={k} value={String(v)} />
                  ))
                : null}
            </dl>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-base font-semibold text-[var(--text)]">
            Engine guard snapshot
          </div>
          {!state.metrics ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-full" rows={4} />
            </div>
          ) : (
            <dl>
              <KV
                label="GET /admin/metrics?window=24h"
                ok={metricsOk}
                value={
                  metricsOk
                    ? 'reachable'
                    : `${state.metrics.error?.code}: ${state.metrics.error?.message}`
                }
              />
              {metricsData ? (
                <>
                  <KV label="total decisions (24h)" value={String(metricsData.totals.total)} />
                  <KV label="l1" value={String(metricsData.totals.l1)} />
                  <KV label="l1plus_l2" value={String(metricsData.totals.l1plus_l2)} />
                  <KV label="cost estimate (USD)" value={metricsData.costEstimateUsd.toFixed(4)} />
                </>
              ) : null}
              {guard
                ? Object.entries(guard).map(([k, v]) => (
                    <KV key={`g-${k}`} label={`guard.${k}`} value={JSON.stringify(v)} />
                  ))
                : null}
            </dl>
          )}
        </section>
        {demoMode ? (
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Database size={14} className="text-[var(--text-muted)]" />
              <span className="text-base font-semibold text-[var(--text)]">Demo controls</span>
            </div>
            <div className="px-4 py-4">
              <p className="mb-4 text-sm text-[var(--text-muted)]">
                Restore all 5 DynamoDB tables to the original demo seed. Current state is
                overwritten. Use this before each demo run.
              </p>

              {reseedStatus.kind === 'idle' && (
                <button
                  type="button"
                  onClick={handleReseedClick}
                  className="inline-flex items-center gap-2 rounded-md border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-3 py-2 text-sm text-[color:var(--warning-fg)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                >
                  <RefreshCw size={14} />
                  Reseed demo data
                </button>
              )}

              {reseedStatus.kind === 'confirming' && (
                <div
                  ref={confirmRef}
                  role="alertdialog"
                  aria-modal="false"
                  aria-labelledby="reseed-confirm-title"
                  className="rounded-lg border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-4"
                >
                  <p
                    id="reseed-confirm-title"
                    className="mb-3 text-sm font-medium text-[color:var(--warning-fg)]"
                  >
                    This wipes current state and restores the demo seed. Are you sure?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleReseedConfirm}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                    >
                      <RefreshCw size={13} />
                      Yes, reseed
                    </button>
                    <button
                      type="button"
                      onClick={handleReseedCancel}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {reseedStatus.kind === 'running' && (
                <div
                  aria-live="polite"
                  className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]"
                >
                  <RefreshCw size={14} className="animate-spin" />
                  Reseeding...
                </div>
              )}

              {reseedStatus.kind === 'success' && (
                <div
                  aria-live="polite"
                  className="space-y-2 rounded-lg border border-[color:var(--success-border)] bg-[color:var(--success-bg)] px-4 py-3"
                >
                  <p className="text-sm font-medium text-[color:var(--success-fg)]">
                    Reseed complete
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                    <dt>Tables reset</dt>
                    <dd className="font-mono">{reseedStatus.result.tablesReset.join(', ')}</dd>
                    <dt>Items written</dt>
                    <dd className="font-mono">{reseedStatus.result.itemsWritten}</dd>
                    <dt>Duration</dt>
                    <dd className="font-mono">{reseedStatus.result.durationMs} ms</dd>
                  </dl>
                  <button
                    type="button"
                    onClick={() => setReseedStatus({ kind: 'idle' })}
                    className="mt-1 text-xs text-[var(--text-dim)] underline hover:text-[var(--text-muted)] focus-visible:outline-none"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {reseedStatus.kind === 'error' && (
                <div
                  aria-live="assertive"
                  className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3"
                >
                  <p className="text-sm text-rose-700 dark:text-rose-300">
                    Reseed failed: {reseedStatus.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReseedStatus({ kind: 'idle' })}
                    className="text-xs text-[var(--text-dim)] underline hover:text-[var(--text-muted)] focus-visible:outline-none"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
