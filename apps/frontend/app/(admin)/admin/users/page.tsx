'use client';

import {
  CaretLeft,
  CaretRight,
  EnvelopeSimple,
  EnvelopeSimpleOpen,
  Phone,
  PhoneSlash,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import ProgressBar from '@/components/admin/ProgressBar';
import Skeleton from '@/components/admin/Skeleton';
import { type AdminUser, getUsers, type UsersListResponse } from '@/lib/admin-api';
import type { ApiResult } from '@/lib/types';

const PAGE_SIZE = 25;

const SKELETON_ROWS = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];

function CompletionCell({ value }: Readonly<{ value?: number }>) {
  if (typeof value !== 'number') return <span className="text-[var(--text-dim)]">-</span>;
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={pct} tone="emerald" />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">
        {pct}%
      </span>
    </div>
  );
}

function VerifyIcons({ user }: Readonly<{ user: AdminUser }>) {
  return (
    <div className="flex items-center gap-2 text-[var(--text-dim)]">
      {user.emailVerified ? (
        <EnvelopeSimple
          size={14}
          className="text-emerald-500 dark:text-emerald-400"
          aria-label="Email verified"
        />
      ) : (
        <EnvelopeSimpleOpen
          size={14}
          className="text-[var(--text-dim)]"
          aria-label="Email unverified"
        />
      )}
      {user.phoneVerified ? (
        <Phone
          size={14}
          className="text-emerald-500 dark:text-emerald-400"
          aria-label="Phone verified"
        />
      ) : (
        <PhoneSlash size={14} className="text-[var(--text-dim)]" aria-label="Phone unverified" />
      )}
    </div>
  );
}

export default function UsersPage() {
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ApiResult<UsersListResponse> | null>(null);

  const load = useCallback(async () => {
    const res = await getUsers({ limit: PAGE_SIZE, cursor: currentCursor });
    setResult(res);
  }, [currentCursor]);

  useEffect(() => {
    setResult(null);
    load();
  }, [load]);

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  if (err && !data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  const users = data?.users ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const page = cursorStack.length + 1;

  const onNext = () => {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, currentCursor ?? '']);
    setCurrentCursor(nextCursor);
  };

  const onPrev = () => {
    if (cursorStack.length === 0) return;
    const prev = cursorStack.at(-1);
    setCursorStack((s) => s.slice(0, -1));
    setCurrentCursor(prev === '' ? undefined : prev);
  };

  let tableBody: ReactNode;
  if (loading) {
    tableBody = (
      <div className="divide-y divide-[var(--border)]">
        {SKELETON_ROWS.map((k) => (
          <div key={k} className="grid grid-cols-12 gap-3 px-4 py-3">
            <Skeleton className="col-span-3 h-4" />
            <Skeleton className="col-span-2 h-4" />
            <Skeleton className="col-span-1 h-4" />
            <Skeleton className="col-span-4 h-4" />
            <Skeleton className="col-span-2 h-4" />
          </div>
        ))}
      </div>
    );
  } else if (users.length === 0) {
    tableBody = (
      <div className="px-4 py-10 text-center text-sm text-[var(--text-dim)]">
        No user profiles found. Seed the table with{' '}
        <code className="font-mono text-[var(--text-muted)]">seed_data/UserProfile.json</code> and
        run the DynamoDB BatchWrite script.
      </div>
    );
  } else {
    tableBody = (
      <ul className="divide-y divide-[var(--border)]">
        {users.map((user) => (
          <li key={user.userId}>
            <Link
              href={`/admin/users/${encodeURIComponent(user.userId)}`}
              className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm motion-safe:transition-colors hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]/70"
            >
              <div className="col-span-3">
                <div className="font-mono text-xs text-[var(--text)]">{user.userId}</div>
                <div className="text-xs text-[var(--text-dim)]">{user.username}</div>
              </div>
              <div className="col-span-2 text-xs text-[var(--text-muted)]">{user.tier ?? '-'}</div>
              <div className="col-span-1 text-right tabular-nums text-sm text-[var(--text)]">
                {user.loyaltyScore ?? '-'}
              </div>
              <div className="col-span-4">
                <CompletionCell value={user.profileCompletion} />
              </div>
              <div className="col-span-2">
                <VerifyIcons user={user} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Users</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Paginated UserProfile rows. The passwordHash is never returned by the API.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
          <span>Page {page}</span>
          <span>
            {users.length} of {PAGE_SIZE}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          <div className="col-span-3">User</div>
          <div className="col-span-2">Tier</div>
          <div className="col-span-1 text-right">Loyalty</div>
          <div className="col-span-4">Completion</div>
          <div className="col-span-2">Verified</div>
        </div>

        {tableBody}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={cursorStack.length === 0 || loading}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <CaretLeft size={14} />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!nextCursor || loading}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          Next
          <CaretRight size={14} />
        </button>
      </div>
    </div>
  );
}
