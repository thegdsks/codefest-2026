'use client';

import { MagnifyingGlass, Shield, ShieldCheck, ShieldSlash, Users } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import { SessionDetailDrawer } from '@/components/admin/sessions/SessionDetailDrawer';
import {
  type SessionFilter,
  SessionsTable,
  type TimeRange,
} from '@/components/admin/sessions/SessionsTable';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { getMfaStatus, getSessions, revokeSession, type SessionRow } from '@/lib/admin-api';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

const STATUS_FILTERS: { value: SessionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'expired', label: 'Expired' },
  { value: 'mfa-pending', label: 'MFA pending' },
];

function isSessionActive(row: SessionRow): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt * 1000 < Date.now()) return false;
  return true;
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
          {label}
        </p>
        <p className="text-lg font-semibold tabular-nums text-[color:var(--text)]">{value}</p>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ sessionId: string; userId: string } | null>(
    null
  );
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const queryClient = useQueryClient();

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: async () => {
      const res = await getSessions();
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: mfaData } = useQuery({
    queryKey: ['admin-mfa-status'],
    queryFn: async () => {
      const res = await getMfaStatus();
      return res.data ?? null;
    },
    staleTime: 60_000,
  });

  const sessions = sessionsData?.sessions ?? [];
  const activeCount = sessions.filter(isSessionActive).length;
  const mfaVerifiedCount = sessions.filter((s) => s.mfaVerified).length;
  const mfaPercent =
    sessions.length > 0 ? Math.round((mfaVerifiedCount / sessions.length) * 100) : 0;

  const handleRevokeRequest = useCallback((sessionId: string, userId: string) => {
    setRevokeTarget({ sessionId, userId });
    setRevokeError(null);
  }, []);

  const handleRevokeConfirm = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);

    if (selectedSession?.sessionId === revokeTarget.sessionId) {
      setSelectedSession((prev) =>
        prev ? { ...prev, revokedAt: Math.floor(Date.now() / 1000) } : prev
      );
    }

    const res = await revokeSession(revokeTarget.sessionId);
    setRevoking(false);

    if (res.error) {
      setRevokeError(`${res.error.code}: ${res.error.message}`);
      if (selectedSession?.sessionId === revokeTarget.sessionId) {
        setSelectedSession((prev) => (prev ? { ...prev, revokedAt: undefined } : prev));
      }
      return;
    }

    setRevokeTarget(null);
    await queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
  }, [revokeTarget, selectedSession, queryClient]);

  if (sessionsError) {
    return (
      <AuthGate
        error={{ code: 'FETCH_ERROR', message: (sessionsError as Error).message }}
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['admin-sessions'] })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--text)]">Sessions</h1>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Session lifecycle, MFA status, and risk context. Click a row to inspect.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard icon={<Users size={16} />} label="Total sessions" value={sessions.length} />
        <StatCard icon={<Shield size={16} />} label="Active now" value={activeCount} />
        <StatCard icon={<ShieldCheck size={16} />} label="MFA verified" value={`${mfaPercent}%`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-dim)]">
            Time range
          </span>
          <div className="flex items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40 p-0.5">
            {TIME_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeRange(opt.value)}
                className={
                  timeRange === opt.value
                    ? 'rounded-md bg-indigo-500 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-md px-3 py-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <MagnifyingGlass
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or session ID..."
            className="h-8 w-64 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40 pl-7 pr-3 text-xs text-[color:var(--text)] placeholder:text-[color:var(--text-dim)] focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? 'inline-flex items-center rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]'
                : 'inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40 px-3 py-1 text-xs text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {revokeError && (
        <div
          aria-live="polite"
          className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300"
        >
          {revokeError}
        </div>
      )}

      <SessionsTable
        rows={sessions}
        loading={sessionsLoading}
        filter={filter}
        timeRange={timeRange}
        search={search}
        revokingId={revoking && revokeTarget ? revokeTarget.sessionId : null}
        onRowClick={setSelectedSession}
        onRevoke={handleRevokeRequest}
      />

      <SessionDetailDrawer
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        revoking={revoking && revokeTarget?.sessionId === selectedSession?.sessionId}
        onRevoke={handleRevokeRequest}
      />

      <Modal
        open={revokeTarget !== null && !revoking}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        variant="destructive"
        title="Revoke session?"
        description={
          revokeTarget
            ? `Revoke session for ${revokeTarget.userId}? They will be signed out on their next request.`
            : undefined
        }
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        onConfirm={handleRevokeConfirm}
        confirmLoading={revoking}
      />

      {mfaData && (
        <div className="mt-4 flex items-center gap-2 text-[11px] text-[color:var(--text-dim)]">
          <ShieldSlash size={11} />
          Platform MFA: {mfaData.enrolled} enrolled, {mfaData.notEnrolled} not enrolled out of{' '}
          {mfaData.total} users
          {mfaData.enrolledPercent !== undefined && (
            <Badge variant="neutral" size="sm">
              {mfaData.enrolledPercent}% enrolled
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
