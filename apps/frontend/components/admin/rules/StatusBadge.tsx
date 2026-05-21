'use client';

import type { RuleStatus } from '@/lib/rules-api';

interface StatusBadgeProps {
  status: RuleStatus;
}

const statusConfig: Record<RuleStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-zinc-700/40 text-zinc-500 border border-zinc-700',
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.DRAFT;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
