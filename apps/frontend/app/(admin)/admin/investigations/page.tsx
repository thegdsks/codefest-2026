'use client';

import {
  ArrowsClockwise,
  CaretRight,
  ClockCountdown,
  ShieldCheck,
  Warning,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import Skeleton from '@/components/admin/Skeleton';
import { type DecisionRow, getDecisions } from '@/lib/admin-api';
import type { ApiErrorDetail } from '@/lib/types';

type CaseStatus = 'open' | 'reviewing' | 'action' | 'closed';

interface Case extends DecisionRow {
  status: CaseStatus;
  assignee: string | null;
  slaMinutes: number;
}

const STATUS_ORDER: CaseStatus[] = ['open', 'reviewing', 'action', 'closed'];

const STATUS_META: Record<
  CaseStatus,
  { label: string; tone: string; dot: string; accent: string }
> = {
  open: {
    label: 'Open',
    tone: 'text-rose-300',
    dot: 'bg-rose-400',
    accent: 'border-rose-400/30',
  },
  reviewing: {
    label: 'Reviewing',
    tone: 'text-amber-300',
    dot: 'bg-amber-400',
    accent: 'border-amber-400/30',
  },
  action: {
    label: 'Action needed',
    tone: 'text-indigo-300',
    dot: 'bg-indigo-400',
    accent: 'border-indigo-400/30',
  },
  closed: {
    label: 'Closed',
    tone: 'text-emerald-300',
    dot: 'bg-emerald-400',
    accent: 'border-emerald-400/30',
  },
};

function deriveStatus(row: DecisionRow): CaseStatus {
  const a = (row.action || '').toUpperCase();
  if (a === 'BLOCK' || a === 'HOLD') return 'open';
  if (a === 'MFA') return 'reviewing';
  if (a === 'REVIEW' || a === 'OFFER' || a === 'NUDGE') return 'action';
  return 'closed';
}

const ASSIGNEES = ['Maya R.', 'Jordan K.', 'Sam P.', 'Alex T.', null, null];

function pickAssignee(seed: string): string | null {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ASSIGNEES[hash % ASSIGNEES.length] ?? null;
}

function slaMinutes(ts: number): number {
  const elapsed = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  return Math.max(0, 60 - (elapsed % 60));
}

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-rose-300';
  if (score >= 60) return 'text-amber-300';
  if (score >= 40) return 'text-indigo-300';
  return 'text-emerald-300';
}

function CaseCard({ c, onAdvance }: { c: Case; onAdvance: (id: string) => void }) {
  return (
    <div className="surface-popover group rounded-lg p-3 transition-colors hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[color:var(--text)] truncate">
              {c.userId}
            </span>
            <span className="text-[10px] text-[color:var(--text-dim)] truncate">
              {c.decisionType}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
            {c.reasonText ?? c.reason ?? c.reasonCode ?? 'No reason recorded'}
          </div>
        </div>
        <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${scoreColor(c.score)}`}>
          {c.score}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[10.5px]">
        <span className="inline-flex items-center gap-1 text-[color:var(--text-dim)]">
          <ClockCountdown size={11} aria-hidden="true" />
          <span className="tabular-nums">{c.slaMinutes}m SLA</span>
          <span className="text-zinc-700">·</span>
          <span>{relative(c.timestamp)}</span>
        </span>
        {c.assignee && (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--text-muted)]">
            <span
              aria-hidden="true"
              className="inline-grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 text-[8px] font-semibold text-[color:var(--text)] ring-1 ring-white/10"
            >
              {c.assignee.slice(0, 1)}
            </span>
            <span className="truncate max-w-[80px]">{c.assignee}</span>
          </span>
        )}
      </div>

      {c.status !== 'closed' && (
        <button
          type="button"
          onClick={() => onAdvance(c.decisionId)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-white/[0.04] py-1 text-[10.5px] font-medium text-[color:var(--text-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.08] hover:text-[color:var(--text)]"
        >
          Advance <CaretRight size={10} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Column({
  status,
  cases,
  onAdvance,
}: {
  status: CaseStatus;
  cases: Case[];
  onAdvance: (id: string) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <section
      aria-label={`${meta.label} cases`}
      className={`flex h-full min-h-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] ${meta.accent}`}
    >
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
            aria-hidden="true"
          />
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${meta.tone}`}>
            {meta.label}
          </span>
        </div>
        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[color:var(--text-muted)] ring-1 ring-inset ring-white/[0.06]">
          {cases.length}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2.5">
        {cases.length === 0 && (
          <div className="grid h-32 place-items-center text-[11px] text-[color:var(--text-dim)]">
            No cases
          </div>
        )}
        {cases.map((c) => (
          <CaseCard key={c.decisionId} c={c} onAdvance={onAdvance} />
        ))}
      </div>
    </section>
  );
}

function KpiPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Warning;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="surface-popover flex items-center gap-2.5 rounded-lg px-3 py-2">
      <Icon size={16} className={tone} aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-[18px] font-semibold tabular-nums text-[color:var(--text)] leading-none">
          {value}
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-[color:var(--text-dim)] mt-1">
          {label}
        </span>
      </div>
    </div>
  );
}

export default function InvestigationsPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<ApiErrorDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void refreshKey;
    (async () => {
      const res = await getDecisions({ window: '24h', limit: 60 });
      if (cancelled) return;
      if (res.error !== null) {
        setError(res.error);
        return;
      }
      if (res.data === null) return;
      const items: Case[] = res.data.decisions.map((d) => ({
        ...d,
        status: deriveStatus(d),
        assignee: pickAssignee(d.userId),
        slaMinutes: slaMinutes(d.timestamp),
      }));
      setCases(items);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const grouped = useMemo(() => {
    const buckets: Record<CaseStatus, Case[]> = {
      open: [],
      reviewing: [],
      action: [],
      closed: [],
    };
    if (cases) for (const c of cases) buckets[c.status].push(c);
    return buckets;
  }, [cases]);

  const onAdvance = (id: string) => {
    setCases((prev) => {
      if (!prev) return prev;
      return prev.map((c) => {
        if (c.decisionId !== id) return c;
        const idx = STATUS_ORDER.indexOf(c.status);
        const next = STATUS_ORDER[Math.min(idx + 1, STATUS_ORDER.length - 1)];
        return { ...c, status: next };
      });
    });
  };

  if (error) return <AuthGate error={error} onRetry={() => setRefreshKey((k) => k + 1)} />;

  const totalOpen = grouped.open.length + grouped.reviewing.length + grouped.action.length;
  const highRisk = (cases ?? []).filter((c) => c.score >= 70 && c.status !== 'closed').length;
  const slaBreach = (cases ?? []).filter((c) => c.slaMinutes <= 15 && c.status !== 'closed').length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-50">
            Investigations
          </h1>
          <p className="mt-1 text-[12.5px] text-[color:var(--text-dim)]">
            Active fraud cases derived from the last 24h of decisions. Hover a card to advance
            status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-[color:var(--text-muted)] ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.06] hover:text-[color:var(--text)]"
        >
          <ArrowsClockwise size={12} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <KpiPill
          icon={Warning}
          label="Active cases"
          value={String(totalOpen)}
          tone="text-amber-300"
        />
        <KpiPill
          icon={Warning}
          label="High risk (≥70)"
          value={String(highRisk)}
          tone="text-rose-300"
        />
        <KpiPill
          icon={ShieldCheck}
          label="SLA at risk"
          value={String(slaBreach)}
          tone="text-indigo-300"
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cases === null
          ? STATUS_ORDER.map((s) => (
              <div key={s} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                <Skeleton className="h-4 w-24 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))
          : STATUS_ORDER.map((s) => (
              <Column key={s} status={s} cases={grouped[s]} onAdvance={onAdvance} />
            ))}
      </div>
    </div>
  );
}
