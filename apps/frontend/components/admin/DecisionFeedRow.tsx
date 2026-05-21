'use client';

import {
  ArrowsLeftRight,
  CaretDown,
  CaretRight,
  Key,
  LockOpen,
  Shield,
  Sparkle,
} from '@phosphor-icons/react';
import type { DecisionRow } from '@/lib/admin-api';
import ActionPill from './ActionPill';

// ---------------------------------------------------------------------------
// Grouped row type: one or more consecutive identical decisions collapsed.
// ---------------------------------------------------------------------------
export interface DecisionGroup {
  key: string;
  rows: DecisionRow[];
  latest: DecisionRow;
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(epochSec: number): string {
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

function reasonOf(row: DecisionRow): string {
  return row.reasonText || row.reasonCode || row.explanation || row.reason || '';
}

// Color of the 4px left border, keyed by action.
function actionBorderClass(action: string): string {
  const map: Record<string, string> = {
    ALLOW: 'border-l-emerald-500',
    BLOCK: 'border-l-rose-500',
    REVIEW: 'border-l-blue-400',
    MFA: 'border-l-amber-400',
    HOLD: 'border-l-amber-400',
    NUDGE: 'border-l-violet-400',
    OFFER: 'border-l-emerald-400',
    RELEASE: 'border-l-sky-400',
  };
  return map[action] ?? 'border-l-[color:var(--border)]';
}

// Risk dot color.
function riskDotClass(risk?: string): string {
  if (risk === 'HIGH') return 'bg-rose-500';
  if (risk === 'MEDIUM') return 'bg-amber-400';
  return 'bg-emerald-500';
}

// ---------------------------------------------------------------------------
// Per-type icon
// ---------------------------------------------------------------------------
type IconSize = number;

function TypeIcon({ type, size = 14 }: { type: string; size?: IconSize }) {
  const cls = 'shrink-0';
  if (type === 'FRAUD_LOGIN' || type === 'LOGIN') return <Shield size={size} className={cls} />;
  if (type === 'FRAUD_TRANSFER' || type === 'TRANSFER')
    return <ArrowsLeftRight size={size} className={cls} />;
  if (
    type === 'ENGAGEMENT_OFFER' ||
    type === 'ENGAGEMENT' ||
    type === 'NUDGE' ||
    type === 'OFFER' ||
    type === 'PROFILE_COMPLETENESS'
  )
    return <Sparkle size={size} className={cls} />;
  if (type === 'MFA_VERIFY' || type === 'MFA_EVENT') return <Key size={size} className={cls} />;
  if (type === 'DECISION_RELEASE') return <LockOpen size={size} className={cls} />;
  return <Shield size={size} className={cls} />;
}

// Icon color by type.
function typeIconColor(type: string): string {
  if (
    type === 'FRAUD_LOGIN' ||
    type === 'LOGIN' ||
    type === 'FRAUD_TRANSFER' ||
    type === 'TRANSFER'
  )
    return 'text-rose-400';
  if (
    type === 'ENGAGEMENT_OFFER' ||
    type === 'ENGAGEMENT' ||
    type === 'NUDGE' ||
    type === 'OFFER' ||
    type === 'PROFILE_COMPLETENESS'
  )
    return 'text-violet-400';
  if (type === 'MFA_VERIFY' || type === 'MFA_EVENT') return 'text-indigo-400';
  if (type === 'DECISION_RELEASE') return 'text-sky-400';
  return 'text-[color:var(--text-dim)]';
}

// ---------------------------------------------------------------------------
// Per-type inline summary line
// ---------------------------------------------------------------------------
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-DecisionType switch
function typeSubline(row: DecisionRow): string {
  const type = row.decisionType;

  if (type === 'FRAUD_LOGIN' || type === 'LOGIN') {
    const parts: string[] = [];
    const r = row as DecisionRow & {
      location?: string;
      deviceType?: string;
      browser?: string;
      ipAddress?: string;
      ip?: string;
    };
    if (r.location) parts.push(r.location);
    if (r.deviceType && r.browser) parts.push(`${r.deviceType} ${r.browser}`);
    else if (r.deviceType) parts.push(r.deviceType);
    else if (r.browser) parts.push(r.browser);
    const ip = r.ipAddress ?? r.ip;
    if (ip) parts.push(ip);
    return parts.length > 0 ? parts.join(', ') : reasonOf(row);
  }

  if (type === 'FRAUD_TRANSFER' || type === 'TRANSFER') {
    const r = row as DecisionRow & {
      amount?: number | string;
      recipientId?: string;
      velocityCount?: number;
    };
    const parts: string[] = [];
    if (r.amount != null) parts.push(`${r.amount} SFC`);
    if (r.recipientId) parts.push(`to ${r.recipientId}`);
    if (typeof r.velocityCount === 'number' && r.velocityCount > 1)
      parts.push(`${r.velocityCount}th in last hour`);
    return parts.length > 0 ? parts.join(', ') : reasonOf(row);
  }

  if (
    type === 'ENGAGEMENT_OFFER' ||
    type === 'ENGAGEMENT' ||
    type === 'NUDGE' ||
    type === 'OFFER' ||
    type === 'PROFILE_COMPLETENESS'
  ) {
    const r = row as DecisionRow & {
      signal?: string;
      target?: string;
      surface?: string;
    };
    if (r.signal && r.target && r.surface)
      return `Signal: ${r.signal} on ${r.target}, fired ${row.reasonCode ?? ''} -> ${r.surface}`;
    if (r.signal && r.target) return `Signal: ${r.signal} on ${r.target}`;
    return reasonOf(row);
  }

  if (type === 'MFA_VERIFY' || type === 'MFA_EVENT') {
    const r = row as DecisionRow & { mfaPath?: string };
    const path = r.mfaPath ?? row.reasonCode ?? '';
    return path ? `MFA via ${path}` : reasonOf(row);
  }

  if (type === 'DECISION_RELEASE') {
    return row.originalDecisionId ? `Released ${row.originalDecisionId}` : reasonOf(row);
  }

  return reasonOf(row);
}

// ---------------------------------------------------------------------------
// Inline expand panel
// ---------------------------------------------------------------------------
function InlineExpand({
  row,
  onOpenDrawer,
}: {
  row: DecisionRow;
  onOpenDrawer: (id: string) => void;
}) {
  const explanation = row.explanation || row.reasonText || row.reason || '';
  const isL2 = row.engineLayer === 'L1+L2';

  return (
    <div className="border-t border-[color:var(--border)] bg-[color:var(--bg-surface)]/60 px-4 py-3">
      {explanation ? (
        <p className="mb-2 text-xs leading-relaxed text-[color:var(--text-muted)]">{explanation}</p>
      ) : null}
      {isL2 ? (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--text-dim)]">
          {row.llmModel ? <span>Model: {row.llmModel}</span> : null}
          {typeof row.llmLatencyMs === 'number' ? (
            <span>Latency: {row.llmLatencyMs} ms</span>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onOpenDrawer(row.decisionId)}
        className="text-[11px] text-indigo-400 underline-offset-2 hover:text-indigo-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        Open full audit
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group count chip
// ---------------------------------------------------------------------------
function GroupChip({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={expanded ? 'Collapse group' : `${count} similar decisions - click to expand`}
      className="inline-flex items-center gap-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--text-muted)] hover:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
    >
      x{count}
      {expanded ? <CaretDown size={9} /> : <CaretRight size={9} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------
interface SingleRowProps {
  row: DecisionRow;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onOpenDrawer: (id: string) => void;
}

function SingleRow({ row, expandedId, onToggleExpand, onOpenDrawer }: SingleRowProps) {
  const isExpanded = expandedId === row.decisionId;
  const href = `/admin/decisions/${encodeURIComponent(row.decisionId)}`;
  const sub = typeSubline(row);
  const borderCls = actionBorderClass(row.action);
  const iconColor = typeIconColor(row.decisionType);
  const isL2 = row.engineLayer === 'L1+L2';

  return (
    <>
      <div
        className={`relative border-l-4 ${borderCls} flex items-stretch transition-colors hover:bg-[color:var(--bg-surface)]`}
      >
        {/* Icon column */}
        <div className={`flex w-10 shrink-0 items-center justify-center ${iconColor}`}>
          <TypeIcon type={row.decisionType} size={14} />
        </div>

        {/* Main content - links to full detail page */}
        <a
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
          onClick={(_e) => {
            // If the user clicks the chevron area, stop navigation
          }}
        >
          {/* Timestamp */}
          <div className="w-24 shrink-0">
            <div className="text-xs text-[color:var(--text)]">{formatTimeAgo(row.timestamp)}</div>
            <div className="text-[10px] tabular-nums text-[color:var(--text-dim)]">
              {new Date(row.timestamp * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
          </div>

          {/* User */}
          <div className="w-24 shrink-0 truncate font-mono text-xs text-[color:var(--text-muted)]">
            {row.userId}
          </div>

          {/* Sub-line: type-specific detail */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-[color:var(--text)]" title={sub}>
              {sub || '-'}
            </div>
          </div>

          {/* Action pill */}
          <div className="shrink-0">
            <ActionPill action={row.action} />
          </div>

          {/* Score + risk dot */}
          <div className="flex w-12 shrink-0 items-center justify-end gap-1">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${riskDotClass(row.riskLevel)}`}
              title={row.riskLevel ?? 'LOW'}
            />
            <span className="tabular-nums text-xs text-[color:var(--text)]">
              {Math.round(row.score)}
            </span>
          </div>

          {/* Engine badge */}
          <div className="hidden w-16 shrink-0 md:block">
            {isL2 ? (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--warning-fg)]">
                <Sparkle size={9} />
                L1+L2
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-dim)]">
                L1
              </span>
            )}
          </div>
        </a>

        {/* Expand toggle - separate from link */}
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse detail' : 'Expand detail'}
          onClick={() => onToggleExpand(row.decisionId)}
          className="flex w-8 shrink-0 items-center justify-center text-[color:var(--text-dim)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
        >
          {isExpanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
        </button>
      </div>

      {isExpanded ? <InlineExpand row={row} onOpenDrawer={onOpenDrawer} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Group row (collapsed multiple identical back-to-back decisions)
// ---------------------------------------------------------------------------
interface GroupRowProps {
  group: DecisionGroup;
  expandedId: string | null;
  expandedGroupKey: string | null;
  onToggleExpand: (id: string) => void;
  onToggleGroup: (key: string) => void;
  onOpenDrawer: (id: string) => void;
}

function GroupRow({
  group,
  expandedId,
  expandedGroupKey,
  onToggleExpand,
  onToggleGroup,
  onOpenDrawer,
}: GroupRowProps) {
  const isGroupExpanded = expandedGroupKey === group.key;
  const { latest } = group;

  return (
    <>
      {/* Representative row for the group */}
      <div className="relative">
        <div className="flex items-center gap-1 px-2 py-0.5">
          <GroupChip
            count={group.count}
            expanded={isGroupExpanded}
            onToggle={() => onToggleGroup(group.key)}
          />
        </div>
        <SingleRow
          row={latest}
          expandedId={expandedId}
          onToggleExpand={onToggleExpand}
          onOpenDrawer={onOpenDrawer}
        />
      </div>

      {/* Expanded group: show all rows in the group */}
      {isGroupExpanded
        ? group.rows.map((r) => (
            <div key={r.decisionId} className="bg-[color:var(--bg-surface)]/30 pl-4">
              <SingleRow
                row={r}
                expandedId={expandedId}
                onToggleExpand={onToggleExpand}
                onOpenDrawer={onOpenDrawer}
              />
            </div>
          ))
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Exported feed row component - dispatches to group or single
// ---------------------------------------------------------------------------
interface DecisionFeedRowProps {
  group: DecisionGroup;
  expandedId: string | null;
  expandedGroupKey: string | null;
  onToggleExpand: (id: string) => void;
  onToggleGroup: (key: string) => void;
  onOpenDrawer: (id: string) => void;
}

export default function DecisionFeedRow({
  group,
  expandedId,
  expandedGroupKey,
  onToggleExpand,
  onToggleGroup,
  onOpenDrawer,
}: DecisionFeedRowProps) {
  if (group.count === 1) {
    return (
      <SingleRow
        row={group.latest}
        expandedId={expandedId}
        onToggleExpand={onToggleExpand}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  return (
    <GroupRow
      group={group}
      expandedId={expandedId}
      expandedGroupKey={expandedGroupKey}
      onToggleExpand={onToggleExpand}
      onToggleGroup={onToggleGroup}
      onOpenDrawer={onOpenDrawer}
    />
  );
}
