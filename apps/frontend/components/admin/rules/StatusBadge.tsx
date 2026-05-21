'use client';

import type { RuleStatus } from '@/lib/rules-api';

interface StatusBadgeProps {
  status: RuleStatus;
}

const statusConfig: Record<RuleStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className:
      'bg-[color:var(--success-bg)] text-[color:var(--success-fg)] border border-[color:var(--success-border)]',
  },
  DRAFT: {
    label: 'Draft',
    className:
      'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border border-[color:var(--warning-border)]',
  },
  ARCHIVED: {
    label: 'Archived',
    className:
      'bg-[color:var(--bg-elevated)] text-[color:var(--text-dim)] border border-[color:var(--border-strong)]',
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
