'use client';

import { Clock, ShieldCheck, ShieldX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import {
  getSessions,
  revokeSession,
  type SessionRow,
  type SessionsListResponse,
} from '@/lib/admin-api';
import type { ApiErrorDetail, ApiResult } from '@/lib/types';

const POLL_MS = 5_000;

const SKELETON_ROWS = ['s0', 's1', 's2', 's3'];

function formatEpochSec(s?: number): string {
  if (!s) return '-';
  return new Date(s * 1000).toLocaleString();
}

function timeUntil(s?: number): string {
  if (!s) return '';
  const diffMs = s * 1000 - Date.now();
  if (diffMs <= 0) return 'expired';
  const m = Math.round(diffMs / 60000);
  if (m < 60) return `expires in ${m}m`;
  const h = Math.round(m / 60);
  return `expires in ${h}h`;
}

interface RowsState {
  rows: SessionRow[];
  endpointMissing: boolean;
  fatal: ApiErrorDetail | null;
}

export default function SessionsPage() {
  const [state, setState] = useState<RowsState | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeErr, setRevokeErr] = useState<ApiErrorDetail | null>(null);

  const load = useCallback(async () => {
    const res: ApiResult<SessionsListResponse> = await getSessions();
    if (res.error) {
      const code = (res.error.code || '').toUpperCase();
      const missing =
        code === '404' || code === 'NOT_FOUND' || code === '501' || code === 'NOT_IMPLEMENTED';
      const fatalCodes = new Set(['401', 'UNAUTHORIZED', '403', 'FORBIDDEN', 'NETWORK_ERROR']);
      if (!missing && fatalCodes.has(code)) {
        setState({ rows: [], endpointMissing: false, fatal: res.error });
        return;
      }
      setState({ rows: [], endpointMissing: missing, fatal: null });
      return;
    }
    setState({ rows: res.data?.sessions ?? [], endpointMissing: false, fatal: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await getSessions();
      if (cancelled) return;
      if (res.error) {
        const code = (res.error.code || '').toUpperCase();
        const missing =
          code === '404' || code === 'NOT_FOUND' || code === '501' || code === 'NOT_IMPLEMENTED';
        const fatalCodes = new Set(['401', 'UNAUTHORIZED', '403', 'FORBIDDEN', 'NETWORK_ERROR']);
        if (!missing && fatalCodes.has(code)) {
          setState({ rows: [], endpointMissing: false, fatal: res.error });
          return;
        }
        setState({ rows: [], endpointMissing: missing, fatal: null });
        return;
      }
      setState({ rows: res.data?.sessions ?? [], endpointMissing: false, fatal: null });
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state?.fatal) {
    return <AuthGate error={state.fatal} onRetry={load} />;
  }

  const loading = state === null;
  const endpointMissing = state?.endpointMissing ?? false;
  const rows = state?.rows ?? [];

  const onRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    setRevokeErr(null);
    const res = await revokeSession(sessionId);
    setRevokingId(null);
    if (res.error) {
      setRevokeErr(res.error);
      return;
    }
    load();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Sessions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Active session tokens. Force logout from here.
          </p>
        </div>
      </div>

      {endpointMissing ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm">
          <div className="mb-1 font-semibold text-amber-200">Endpoint not deployed yet</div>
          <p className="text-amber-100/80">
            The backend has not shipped <code className="font-mono">GET /admin/sessions</code> yet.
            This page polls every 5 seconds and will populate as soon as the endpoint is live.
          </p>
        </div>
      ) : null}

      {revokeErr ? (
        <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          {revokeErr.code}: {revokeErr.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="grid grid-cols-12 gap-3 border-b border-zinc-800 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          <div className="col-span-4">Session</div>
          <div className="col-span-2">User</div>
          <div className="col-span-3">Issued</div>
          <div className="col-span-2">Expires</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {loading && !endpointMissing ? (
          <div className="divide-y divide-zinc-800">
            {SKELETON_ROWS.map((k) => (
              <div key={k} className="grid grid-cols-12 gap-3 px-4 py-3">
                <Skeleton className="col-span-4 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-3 h-4" />
                <Skeleton className="col-span-2 h-4" />
                <Skeleton className="col-span-1 h-4" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500">
            <ShieldCheck size={14} />
            No active sessions.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {rows.map((row) => (
              <li
                key={row.sessionId}
                className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="col-span-4 truncate font-mono text-xs text-zinc-200">
                  {row.sessionId}
                </div>
                <div className="col-span-2 truncate font-mono text-xs text-zinc-300">
                  {row.userId}
                </div>
                <div className="col-span-3 text-xs text-zinc-400 tabular-nums">
                  {formatEpochSec(row.issuedAt)}
                </div>
                <div className="col-span-2 text-xs text-zinc-400 tabular-nums">
                  <div>{formatEpochSec(row.expiresAt)}</div>
                  <div className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                    <Clock size={10} />
                    {timeUntil(row.expiresAt)}
                  </div>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRevoke(row.sessionId)}
                    disabled={revokingId === row.sessionId}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    <ShieldX size={11} />
                    {revokingId === row.sessionId ? 'Revoking' : 'Force logout'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
