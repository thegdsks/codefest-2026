'use client';

import { Plus, ScrollText } from 'lucide-react';
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
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950">
          <ScrollText size={22} className="text-zinc-400" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">Rules engine not deployed yet</h2>
        <p className="mt-2 text-sm text-zinc-400">
          The rules API is not available. The backend lane is still in progress. Check back when the
          Lambda endpoint for <span className="font-mono text-zinc-300">/admin/rules</span> is live.
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
          <h1 className="text-2xl font-semibold text-zinc-100">Rules</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Engagement rules that fire nudges, offers, and banners based on user signals.
          </p>
        </div>
        <Link
          href="/admin/rules/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <Plus size={14} />
          New rule
        </Link>
      </div>

      <div className="mb-5 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1 w-fit">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
              tab === value ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
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
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-32" />
              </div>
            </li>
          ))}
        </ul>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
          {tab === 'ALL' ? 'No rules yet. Create the first one.' : `No ${tab.toLowerCase()} rules.`}
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
