'use client';

import { ChevronLeft, ChevronRight, MailCheck, MailX, PhoneCall, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import ProgressBar from '@/components/admin/ProgressBar';
import Skeleton from '@/components/admin/Skeleton';
import { type AdminUser, getUsers, type UsersListResponse } from '@/lib/admin-api';
import type { ApiResult } from '@/lib/types';

const PAGE_SIZE = 25;

const SKELETON_ROWS = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];

function CompletionCell({ value }: { value?: number }) {
  if (typeof value !== 'number') return <span className="text-zinc-500">-</span>;
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={pct} tone="emerald" />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-zinc-300">{pct}%</span>
    </div>
  );
}

function VerifyIcons({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-center gap-2 text-zinc-500">
      {user.emailVerified ? (
        <MailCheck size={14} className="text-emerald-400" aria-label="Email verified" />
      ) : (
        <MailX size={14} className="text-zinc-600" aria-label="Email unverified" />
      )}
      {user.phoneVerified ? (
        <PhoneCall size={14} className="text-emerald-400" aria-label="Phone verified" />
      ) : (
        <PhoneOff size={14} className="text-zinc-600" aria-label="Phone unverified" />
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
    const prev = cursorStack[cursorStack.length - 1];
    setCursorStack((s) => s.slice(0, -1));
    setCurrentCursor(prev === '' ? undefined : prev);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paginated UserProfile rows. The passwordHash is never returned by the API.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Page {page}</span>
          <span>
            {users.length} of {PAGE_SIZE}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="grid grid-cols-12 gap-3 border-b border-zinc-800 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          <div className="col-span-3">User</div>
          <div className="col-span-2">Tier</div>
          <div className="col-span-1 text-right">Loyalty</div>
          <div className="col-span-4">Completion</div>
          <div className="col-span-2">Verified</div>
        </div>

        {loading ? (
          <div className="divide-y divide-zinc-800">
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
        ) : users.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">No users to show.</div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {users.map((user) => (
              <li
                key={user.userId}
                className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="col-span-3">
                  <div className="font-mono text-xs text-zinc-200">{user.userId}</div>
                  <div className="text-[11px] text-zinc-500">{user.username}</div>
                </div>
                <div className="col-span-2 text-xs text-zinc-300">{user.tier ?? '-'}</div>
                <div className="col-span-1 text-right tabular-nums text-zinc-200">
                  {user.loyaltyScore ?? '-'}
                </div>
                <div className="col-span-4">
                  <CompletionCell value={user.profileCompletion} />
                </div>
                <div className="col-span-2">
                  <VerifyIcons user={user} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={cursorStack.length === 0 || loading}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!nextCursor || loading}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
