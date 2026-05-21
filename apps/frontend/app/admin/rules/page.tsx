'use client';

import { Plus, Scroll } from '@phosphor-icons/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import RuleCard from '@/components/admin/rules/RuleCard';
import Skeleton from '@/components/admin/Skeleton';
import {
  type EngagementRule,
  getRules,
  type RuleStatus,
  type RulesListResponse,
} from '@/lib/rules-api';
import type { ApiResult } from '@/lib/types';

type FilterTab = 'ALL' | RuleStatus;

const TABS: Array<{ value: FilterTab; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const SKELETON_KEYS = ['s0', 's1', 's2', 's3'];

function RulesNotDeployed() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]">
          <Scroll size={22} className="text-[var(--text-muted)]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Rules engine not deployed yet</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          The rules API is not available. The backend lane is still in progress. Check back when the
          Lambda endpoint for <span className="font-mono text-[var(--text)]">/admin/rules</span> is
          live.
        </p>
      </div>
    </div>
  );
}

export default function RulesListPage() {
  const [tab, setTab] = useState<FilterTab>('ALL');
  const [result, setResult] = useState<ApiResult<RulesListResponse> | null>(null);

  const load = useCallback(async () => {
    const filter = tab === 'ALL' ? undefined : { status: tab as RuleStatus };
    const res = await getRules(filter);
    setResult(res);
  }, [tab]);

  useEffect(() => {
    setResult(null);
    load();
  }, [load]);

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  if (err && !data) {
    const is404 = err.code === '404' || err.code === 'NOT_FOUND';
    if (is404) return <RulesNotDeployed />;
    return <AuthGate error={err} onRetry={load} />;
  }

  const rules: EngagementRule[] = data?.rules ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Rules</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Engagement rules that fire nudges, offers, and banners based on user signals.
          </p>
        </div>
        <Link
          href="/admin/rules/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <Plus size={14} />
          Create rule
        </Link>
      </div>

      <div className="mb-5 flex w-fit items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-1">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
              tab === value
                ? 'bg-[var(--text)] text-[var(--bg)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <ul className="space-y-3">
          {SKELETON_KEYS.map((k) => (
            <li key={k}>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4">
                <Skeleton className="mb-2 h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </li>
          ))}
        </ul>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-10 text-center text-sm text-[var(--text-dim)]">
          {tab === 'ALL'
            ? 'No engagement rules yet. Use the Create rule button to add the first one.'
            : `No ${tab.toLowerCase()} rules. Switch to All or create a new rule.`}
        </div>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <RuleCard key={rule.ruleId} rule={rule} />
          ))}
        </ul>
      )}
    </div>
  );
}
