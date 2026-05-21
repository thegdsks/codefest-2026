'use client';

import {
  CheckCircle,
  Clock,
  Copy,
  Shield,
  ShieldSlash,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import Skeleton from '@/components/admin/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { SessionRow } from '@/lib/admin-api';

export type SessionFilter = 'all' | 'active' | 'revoked' | 'expired' | 'mfa-pending';
export type TimeRange = '15m' | '1h' | '24h' | '7d';

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4'];

function relativeTime(epochSec?: number): string {
  if (!epochSec) return '-';
  const diffMs = Date.now() - epochSec * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function expiryLabel(row: SessionRow): string {
  if (row.revokedAt) return 'Revoked';
  const exp = row.expiresAt;
  if (!exp) return '-';
  const diffMs = exp * 1000 - Date.now();
  if (diffMs <= 0) return 'Expired';
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  return `in ${diffHr}h`;
}

export function sessionStatus(row: SessionRow): 'active' | 'revoked' | 'expired' | 'mfa-pending' {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt * 1000 < Date.now()) return 'expired';
  if (!row.mfaVerified) return 'mfa-pending';
  return 'active';
}

function StatusPill({ status }: { status: ReturnType<typeof sessionStatus> }) {
  if (status === 'active')
    return (
      <Badge variant="success" size="sm">
        Active
      </Badge>
    );
  if (status === 'revoked')
    return (
      <Badge variant="danger" size="sm">
        Revoked
      </Badge>
    );
  if (status === 'expired')
    return (
      <Badge variant="neutral" size="sm">
        Expired
      </Badge>
    );
  return (
    <Badge variant="warning" size="sm">
      MFA pending
    </Badge>
  );
}

function MfaCell({ row }: { row: SessionRow }) {
  if (row.mfaVerified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle size={12} />
        Verified
      </span>
    );
  }
  if (row.revokedAt || (row.expiresAt && row.expiresAt * 1000 < Date.now())) {
    return <span className="text-xs text-[color:var(--text-dim)]">-</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
      <Warning size={12} />
      Pending
    </span>
  );
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

function inTimeRange(row: SessionRow, range: TimeRange): boolean {
  const ts = row.issuedAt ?? row.createdAt;
  if (!ts) return true;
  const windowMs: Record<TimeRange, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };
  return Date.now() - ts * 1000 <= windowMs[range];
}

interface SessionsTableProps {
  rows: SessionRow[];
  loading: boolean;
  filter: SessionFilter;
  timeRange: TimeRange;
  search: string;
  revokingId: string | null;
  onRowClick: (row: SessionRow) => void;
  onRevoke: (sessionId: string, userId: string) => void;
}

export function SessionsTable({
  rows,
  loading,
  filter,
  timeRange,
  search,
  revokingId,
  onRowClick,
  onRevoke,
}: SessionsTableProps) {
  const filtered = rows.filter((row) => {
    if (!inTimeRange(row, timeRange)) return false;
    const status = sessionStatus(row);
    if (filter !== 'all' && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!row.sessionId.toLowerCase().includes(q) && !row.userId.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <TableHeader />
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {SKELETON_KEYS.map((k) => (
              <tr key={k}>
                {(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] as const).map(
                  (c) => (
                    <td key={c} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={20} />}
        title="No sessions match"
        description="Try adjusting the filter or time range."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <TableHeader />
          </thead>
          <tbody className="divide-y divide-[var(--border)]" aria-live="polite">
            {filtered.map((row) => {
              const status = sessionStatus(row);
              const isRevoking = revokingId === row.sessionId;
              const isRevoked = status === 'revoked';
              const createdTs = row.issuedAt ?? row.createdAt;

              return (
                <tr
                  key={row.sessionId}
                  onClick={() => onRowClick(row)}
                  className="cursor-pointer transition-colors hover:bg-[color:var(--hover)]"
                >
                  <td className="px-4 py-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title={row.sessionId}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(row.sessionId);
                      }}
                      className="group inline-flex items-center gap-1 font-mono text-[11px] text-[color:var(--text)] hover:text-[color:var(--text)]"
                    >
                      <span className="max-w-[120px] truncate">{row.sessionId}</span>
                      <Copy
                        size={10}
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                      className="block max-w-[80px] truncate font-mono text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                      title={row.userId}
                    >
                      {row.userId}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--text-muted)]">
                    {row.type ?? '-'}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs text-[color:var(--text-muted)]">
                    {createdTs ? (
                      <span title={new Date(createdTs * 1000).toLocaleString()}>
                        {relativeTime(createdTs)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs">
                    <span
                      className={
                        status === 'expired' || status === 'revoked'
                          ? 'text-[color:var(--text-dim)]'
                          : 'text-[color:var(--text)]'
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} className="shrink-0" />
                        {expiryLabel(row)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <MfaCell row={row} />
                  </td>
                  <td
                    className="max-w-[100px] truncate px-4 py-3 text-xs text-[color:var(--text-dim)]"
                    title={row.location ?? row.source ?? undefined}
                  >
                    {row.location ?? row.source ?? '-'}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs text-[color:var(--text-dim)]">
                    {row.lastActivityAt ? (
                      <span title={new Date(row.lastActivityAt * 1000).toLocaleString()}>
                        {relativeTime(row.lastActivityAt)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {isRevoked ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--text-dim)]">
                        <XCircle size={11} />
                        Revoked
                      </span>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={isRevoking}
                        onClick={() => onRevoke(row.sessionId, row.userId)}
                      >
                        <ShieldSlash size={11} />
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableHeader() {
  const cols = [
    'Status',
    'Session ID',
    'User',
    'Type',
    'Created',
    'Expires',
    'MFA',
    'Source',
    'Last active',
    'Actions',
  ];
  return (
    <tr className="border-b border-[var(--border)] bg-[color:var(--bg-elevated)]/40">
      {cols.map((col) => (
        <th
          key={col}
          scope="col"
          className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]"
        >
          {col}
        </th>
      ))}
    </tr>
  );
}
