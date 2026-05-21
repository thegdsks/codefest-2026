import type { DecisionRow } from '@/lib/admin-api';

export type CaseStatus = 'open' | 'reviewing' | 'action' | 'closed';

export interface Case extends DecisionRow {
  status: CaseStatus;
  assignee: string | null;
  slaMinutes: number;
}

export const STATUS_ORDER: CaseStatus[] = ['open', 'reviewing', 'action', 'closed'];

export interface StatusMeta {
  label: string;
  tone: string;
  dot: string;
  accent: string;
  ring: string;
}

export const STATUS_META: Record<CaseStatus, StatusMeta> = {
  open: {
    label: 'Open',
    tone: 'text-rose-300',
    dot: 'bg-rose-400',
    accent: 'border-rose-400/30',
    ring: 'ring-rose-400/40',
  },
  reviewing: {
    label: 'Reviewing',
    tone: 'text-amber-300',
    dot: 'bg-amber-400',
    accent: 'border-amber-400/30',
    ring: 'ring-amber-400/40',
  },
  action: {
    label: 'Action needed',
    tone: 'text-indigo-300',
    dot: 'bg-indigo-400',
    accent: 'border-indigo-400/30',
    ring: 'ring-indigo-400/40',
  },
  closed: {
    label: 'Closed',
    tone: 'text-emerald-300',
    dot: 'bg-emerald-400',
    accent: 'border-emerald-400/30',
    ring: 'ring-emerald-400/40',
  },
};

export const ME = 'Maya R.';

export type ScoreBand = 'low' | 'med' | 'high';

export interface FilterState {
  decisionTypes: Set<string>;
  scoreBands: Set<ScoreBand>;
  assignees: Set<string>;
  quick: QuickFilter | null;
}

export type QuickFilter = 'my-open' | 'stale' | 'block-only';

export function deriveStatus(row: DecisionRow): CaseStatus {
  const a = (row.action || '').toUpperCase();
  if (a === 'BLOCK' || a === 'HOLD') return 'open';
  if (a === 'MFA') return 'reviewing';
  if (a === 'REVIEW' || a === 'OFFER' || a === 'NUDGE') return 'action';
  return 'closed';
}

const ASSIGNEES: (string | null)[] = [ME, 'Jordan K.', 'Sam P.', 'Alex T.', null, null];

export function pickAssignee(seed: string): string | null {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ASSIGNEES[hash % ASSIGNEES.length] ?? null;
}

export function slaMinutes(ts: number): number {
  const elapsed = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  return Math.max(0, 60 - (elapsed % 60));
}

export function relative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-rose-300';
  if (score >= 60) return 'text-amber-300';
  if (score >= 40) return 'text-indigo-300';
  return 'text-emerald-300';
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return 'high';
  if (score >= 40) return 'med';
  return 'low';
}
