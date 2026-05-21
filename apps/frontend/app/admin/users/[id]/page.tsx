'use client';

import {
  ArrowClockwise,
  ArrowLeft,
  Desktop,
  IdentificationCard,
  Pulse,
  User,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import ActionPill from '@/components/admin/ActionPill';
import Skeleton from '@/components/admin/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import {
  type AdminUser,
  type DecisionsListResponse,
  getDecisions,
  getSessions,
  getUser,
  type SessionsListResponse,
} from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

type Tab = 'activity' | 'sessions' | 'profile';

const TIER_VARIANT: Record<string, 'neutral' | 'info' | 'accent' | 'success'> = {
  GOLD: 'success',
  PLATINUM: 'accent',
  SILVER: 'info',
};

function tierVariant(tier?: string): 'neutral' | 'info' | 'accent' | 'success' {
  return TIER_VARIANT[tier ?? ''] ?? 'neutral';
}

function formatDate(epochSec?: number): string {
  if (!epochSec) return '-';
  return new Date(epochSec * 1000).toLocaleString();
}

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

interface ActivityTabProps {
  userId: string;
}

function ActivityTab({ userId }: ActivityTabProps) {
  const [data, setData] = useState<DecisionsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDecisions({ userId, window: '7d', limit: 50 }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.error) setError(res.error);
      else setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {['a0', 'a1', 'a2', 'a3'].map((k) => (
          <Skeleton key={k} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Pulse size={22} />}
        title="Could not load activity"
        description={error.message}
      />
    );
  }

  const decisions = data?.decisions ?? [];

  if (decisions.length === 0) {
    return (
      <EmptyState
        icon={<Pulse size={22} />}
        title="No decisions in the last 7 days"
        description="Activity will appear here when decisions are processed for this user."
      />
    );
  }

  return (
    <section aria-live="polite" aria-label="User activity decisions">
      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {decisions.map((row) => (
          <li
            key={row.decisionId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-elevated)]"
          >
            <span className="w-24 shrink-0 tabular-nums text-[11px] text-zinc-500">
              {formatTimeAgo(row.timestamp)}
            </span>
            <span className="shrink-0 text-[11px] text-zinc-300">{row.decisionType}</span>
            <ActionPill action={row.action} />
            <span className="ml-auto shrink-0 tabular-nums text-[11px] text-zinc-400">
              score {Math.round(row.score)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-600">{decisions.length} decisions, last 7 days</p>
    </section>
  );
}

function SessionsTab() {
  const [data, setData] = useState<SessionsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSessions().then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.error) setError(res.error);
      else setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {['s0', 's1'].map((k) => (
          <Skeleton key={k} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Desktop size={22} />}
        title="Sessions endpoint unavailable"
        description={`GET /admin/sessions returned: ${error.message}`}
      />
    );
  }

  const sessions = data?.sessions ?? [];

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Desktop size={22} />}
        title="No active sessions"
        description="Sessions will appear here when the user logs in."
      />
    );
  }

  return (
    <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {sessions.map((s) => (
        <li key={s.sessionId} className="px-4 py-2.5 text-sm">
          <div className="font-mono text-[11px] text-zinc-300">{s.sessionId}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Issued {formatDate(s.issuedAt)} &middot; expires {formatDate(s.expiresAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface ProfileTabProps {
  user: AdminUser;
}

function ProfileTab({ user }: ProfileTabProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-300">
        {JSON.stringify(user, null, 2)}
      </pre>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const decodedId = decodeURIComponent(id);

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDetail | null>(null);
  const [tab, setTab] = useState<Tab>('activity');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getUser(decodedId);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setUser(res.data);
    }
  }, [decodedId]);

  useEffect(() => {
    load();
  }, [load]);

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'activity', label: 'Activity', icon: <Pulse size={14} /> },
    { id: 'sessions', label: 'Sessions', icon: <Desktop size={14} /> },
    { id: 'profile', label: 'Profile', icon: <IdentificationCard size={14} /> },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/users"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          aria-label="Back to users"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold text-zinc-100">User detail</h1>
        <div className="ml-auto">
          <IconButton label="Reload user data" onClick={load} disabled={loading}>
            <ArrowClockwise size={16} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {loading && !user && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      )}

      {error && !user && (
        <EmptyState
          icon={<User size={22} />}
          title="User not found"
          description={`GET /admin/users/${decodedId} returned: ${error.message}`}
          action={
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          }
        />
      )}

      {user && (
        <>
          <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-lg font-semibold text-zinc-100">
                {(user.username ?? user.userId).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-zinc-100">{user.username}</span>
                  {user.tier && (
                    <Badge variant={tierVariant(user.tier)} size="sm">
                      {user.tier}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-xs text-zinc-500">{user.userId}</div>
              </div>
              {typeof user.points === 'number' && (
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums text-zinc-100">
                    {user.points.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500">points</div>
                </div>
              )}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                  tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100',
                ].join(' ')}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div>
            {tab === 'activity' && <ActivityTab userId={user.userId} />}
            {tab === 'sessions' && <SessionsTab />}
            {tab === 'profile' && <ProfileTab user={user} />}
          </div>
        </>
      )}
    </div>
  );
}
