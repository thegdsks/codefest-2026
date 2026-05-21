'use client';

import { Activity, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import type { EngagementRule } from '@/lib/rules-api';
import StatusBadge from './StatusBadge';

interface RuleCardProps {
  rule: EngagementRule;
}

function formatUpdatedAt(epochSec: number): string {
  const diffMs = Date.now() - epochSec * 1000;
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function RuleCard({ rule }: RuleCardProps) {
  return (
    <li>
      <Link
        href={`/admin/rules/${encodeURIComponent(rule.ruleId)}`}
        className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{rule.name}</span>
            <StatusBadge status={rule.status} />
          </div>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {formatUpdatedAt(rule.updatedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Activity size={11} />
              {rule.firesLast24h} fires / 24h
            </span>
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-zinc-600" />
      </Link>
    </li>
  );
}
