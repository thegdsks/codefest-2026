'use client';

import {
  ArrowSquareOut,
  CheckCircle,
  Clock,
  Shield,
  ShieldSlash,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Skeleton from '@/components/admin/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  getDecisions,
  getUserRisk,
  type RiskRecentDecision,
  type SessionRow,
  type UserRiskResponse,
} from '@/lib/admin-api';

interface SessionDetailDrawerProps {
  session: SessionRow | null;
  onClose: () => void;
  revoking: boolean;
  onRevoke: (sessionId: string, userId: string) => void;
}

function absoluteTs(epochSec?: number): string {
  if (!epochSec) return '-';
  return new Date(epochSec * 1000).toLocaleString();
}

function relativeTime(epochSec?: number): string {
  if (!epochSec) return '';
  const diffMs = Date.now() - epochSec * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function ttlLabel(expiresAt?: number): string {
  if (!expiresAt) return '-';
  const diffMs = expiresAt * 1000 - Date.now();
  if (diffMs <= 0) return 'Expired';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m`;
}

function sessionStatus(row: SessionRow): 'active' | 'revoked' | 'expired' | 'mfa-pending' {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt * 1000 < Date.now()) return 'expired';
  if (!row.mfaVerified) return 'mfa-pending';
  return 'active';
}

function StatusPill({ status }: { status: ReturnType<typeof sessionStatus> }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>;
  if (status === 'revoked') return <Badge variant="danger">Revoked</Badge>;
  if (status === 'expired') return <Badge variant="neutral">Expired</Badge>;
  return <Badge variant="warning">MFA pending</Badge>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
      {children}
    </h3>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-xs text-[color:var(--text-dim)]">{label}</dt>
      <dd className="text-xs text-[color:var(--text)]">{children}</dd>
    </div>
  );
}

function RiskLevelBadge({ level }: { level?: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  if (level === 'HIGH')
    return (
      <Badge variant="danger" size="sm">
        HIGH
      </Badge>
    );
  if (level === 'MEDIUM')
    return (
      <Badge variant="warning" size="sm">
        MEDIUM
      </Badge>
    );
  return (
    <Badge variant="success" size="sm">
      LOW
    </Badge>
  );
}

function RecentDecisionRow({ d }: { d: RiskRecentDecision }) {
  const actionColor =
    d.action === 'BLOCK'
      ? 'text-rose-400'
      : d.action === 'MFA'
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <li className="flex items-start gap-2 py-2 text-xs">
      <span
        className="w-20 shrink-0 tabular-nums text-[color:var(--text-dim)]"
        title={absoluteTs(d.timestamp)}
      >
        {relativeTime(d.timestamp)}
      </span>
      <span className="w-28 shrink-0 truncate text-[color:var(--text-muted)]">
        {d.decisionType}
      </span>
      <span className={`w-16 shrink-0 font-medium ${actionColor}`}>{d.action}</span>
      <span className="text-[color:var(--text-dim)]">{d.riskLevel ?? ''}</span>
    </li>
  );
}

function IdentitySection({ session }: { session: SessionRow }) {
  return (
    <section>
      <SectionHeading>Identity</SectionHeading>
      <dl className="space-y-2">
        <FieldRow label="User ID">
          <Link
            href={`/admin/users/${encodeURIComponent(session.userId)}`}
            className="inline-flex items-center gap-1 font-mono text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            {session.userId}
            <ArrowSquareOut size={11} />
          </Link>
        </FieldRow>
        <FieldRow label="Device">{session.deviceId ?? '-'}</FieldRow>
        <FieldRow label="Location">{session.location ?? '-'}</FieldRow>
        <FieldRow label="IP address">{session.ipAddress || '-'}</FieldRow>
      </dl>
    </section>
  );
}

function LifecycleSection({
  session,
  isRevoked,
  status,
}: {
  session: SessionRow;
  isRevoked: boolean;
  status: ReturnType<typeof sessionStatus>;
}) {
  const createdTs = session.issuedAt ?? session.createdAt;
  return (
    <section>
      <SectionHeading>Lifecycle</SectionHeading>
      <dl className="space-y-2">
        <FieldRow label="Type">{session.type ?? session.recordType ?? '-'}</FieldRow>
        <FieldRow label="Created">
          {createdTs ? <span title={relativeTime(createdTs)}>{absoluteTs(createdTs)}</span> : '-'}
        </FieldRow>
        <FieldRow label="Expires">
          {session.expiresAt ? (
            <span title={relativeTime(session.expiresAt)}>{absoluteTs(session.expiresAt)}</span>
          ) : (
            '-'
          )}
        </FieldRow>
        <FieldRow label="Last activity">
          {session.lastActivityAt ? (
            <span title={absoluteTs(session.lastActivityAt)}>
              {relativeTime(session.lastActivityAt)}
            </span>
          ) : (
            '-'
          )}
        </FieldRow>
        {session.revokedAt && (
          <FieldRow label="Revoked at">{absoluteTs(session.revokedAt)}</FieldRow>
        )}
        {!isRevoked && status !== 'expired' && (
          <FieldRow label="TTL remaining">
            <span className="inline-flex items-center gap-1 text-[color:var(--text)]">
              <Clock size={11} />
              {ttlLabel(session.expiresAt)}
            </span>
          </FieldRow>
        )}
      </dl>
    </section>
  );
}

function MfaSection({ session }: { session: SessionRow }) {
  return (
    <section>
      <SectionHeading>MFA</SectionHeading>
      <dl className="space-y-2">
        <FieldRow label="Verified">
          {session.mfaVerified ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle size={12} />
              Yes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Warning size={12} />
              No
            </span>
          )}
        </FieldRow>
        {session.mfaPath && <FieldRow label="MFA path">{session.mfaPath}</FieldRow>}
        <FieldRow label="Platform status">
          <Link
            href="/admin/mfa-status"
            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            View MFA posture
            <ArrowSquareOut size={11} />
          </Link>
        </FieldRow>
      </dl>
    </section>
  );
}

function RiskSection({
  riskData,
  loading,
}: {
  riskData: UserRiskResponse | null;
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeading>Risk</SectionHeading>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : riskData ? (
        <dl className="space-y-2">
          <FieldRow label="Risk score">
            <span className="tabular-nums text-[color:var(--text)]">
              {Math.round(riskData.riskScore)}
            </span>
          </FieldRow>
          <FieldRow label="Stored score">
            <span className="tabular-nums text-[color:var(--text-muted)]">
              {riskData.storedRiskScore !== undefined ? Math.round(riskData.storedRiskScore) : '-'}
            </span>
          </FieldRow>
          <FieldRow label="Blocked">
            {riskData.isBlocked ? (
              <Badge variant="danger" size="sm">
                Yes
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                No
              </Badge>
            )}
          </FieldRow>
          {riskData.recentDecisions && riskData.recentDecisions.length > 0 && (
            <FieldRow label="Recent trend">
              <div className="flex items-center gap-1">
                {riskData.recentDecisions.slice(0, 5).map((d) => (
                  <RiskLevelBadge key={d.decisionId} level={d.riskLevel} />
                ))}
              </div>
            </FieldRow>
          )}
        </dl>
      ) : (
        <p className="text-xs text-[color:var(--text-dim)]">Risk data unavailable.</p>
      )}
    </section>
  );
}

function DecisionsSection({
  decisions,
  loading,
}: {
  decisions: RiskRecentDecision[];
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeading>Recent decisions (this user)</SectionHeading>
      {loading ? (
        <div className="space-y-2">
          {['a', 'b', 'c'].map((k) => (
            <Skeleton key={k} className="h-4 w-full" />
          ))}
        </div>
      ) : decisions.length > 0 ? (
        <ul className="divide-y divide-zinc-800/50">
          {decisions.map((d) => (
            <RecentDecisionRow key={d.decisionId} d={d} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[color:var(--text-dim)]">No recent decisions found.</p>
      )}
    </section>
  );
}

export function SessionDetailDrawer({
  session,
  onClose,
  revoking,
  onRevoke,
}: SessionDetailDrawerProps) {
  const isOpen = session !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const userId = session?.userId;

  const { data: riskData, isLoading: riskLoading } = useQuery({
    queryKey: ['user-risk', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await getUserRisk(userId);
      return res.data ?? null;
    },
    enabled: isOpen && Boolean(userId),
    staleTime: 30_000,
  });

  const { data: decisionsData, isLoading: decisionsLoading } = useQuery({
    queryKey: ['decisions-user', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await getDecisions({ userId, limit: 5 });
      return res.data ?? null;
    },
    enabled: isOpen && Boolean(userId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const status = session ? sessionStatus(session) : 'expired';
  const isRevoked = status === 'revoked';

  const recentDecisions: RiskRecentDecision[] =
    (decisionsData?.decisions?.slice(0, 5) as RiskRecentDecision[] | undefined) ??
    riskData?.recentDecisions?.slice(0, 5) ??
    [];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" onClick={onClose} />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Session detail"
        className={`fixed inset-y-0 right-0 z-50 flex w-[520px] flex-col overflow-hidden border-l border-[color:var(--border)] bg-[color:var(--bg)] shadow-2xl shadow-black/60 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {session && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-indigo-400" />
                <span
                  className="max-w-[220px] truncate font-mono text-xs text-[color:var(--text)]"
                  title={session.sessionId}
                >
                  {session.sessionId}
                </span>
                <StatusPill status={status} />
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close session detail"
                className="rounded-md p-1 text-[color:var(--text-dim)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-5">
                <section>
                  {isRevoked ? (
                    <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--text-dim)]">
                      <XCircle size={12} />
                      Revoked{session.revokedAt ? ` ${absoluteTs(session.revokedAt)}` : ''}
                    </div>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      loading={revoking}
                      onClick={() => onRevoke(session.sessionId, session.userId)}
                    >
                      <ShieldSlash size={13} />
                      Revoke session
                    </Button>
                  )}
                </section>

                <IdentitySection session={session} />
                <LifecycleSection session={session} isRevoked={isRevoked} status={status} />
                <MfaSection session={session} />
                <RiskSection riskData={riskData ?? null} loading={riskLoading} />
                <DecisionsSection decisions={recentDecisions} loading={decisionsLoading} />
              </div>
            </div>

            <div className="shrink-0 border-t border-[color:var(--border)] px-5 py-4">
              <Link
                href={`/admin/users/${encodeURIComponent(session.userId)}`}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                Open full user page
                <ArrowSquareOut size={12} />
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
