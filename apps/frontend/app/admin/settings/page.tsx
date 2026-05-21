'use client';

import { Check, Circle, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import {
  adminApiConfig,
  getHealth,
  getMetrics,
  type HealthResponse,
  type MetricsResponse,
} from '@/lib/admin-api';
import type { ApiErrorDetail, ApiResult } from '@/lib/types';

interface SettingsState {
  health: ApiResult<HealthResponse> | null;
  metrics: ApiResult<MetricsResponse> | null;
}

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
  const [state, setState] = useState<SettingsState>({ health: null, metrics: null });

  const load = useCallback(async () => {
    const [health, metrics] = await Promise.all([getHealth(), getMetrics('24h')]);
    setState({ health, metrics });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fatal: ApiErrorDetail | null =
    state.metrics?.error?.code === 'NETWORK_ERROR' ? state.metrics.error : null;

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
      </div>
    </div>
  );
}
