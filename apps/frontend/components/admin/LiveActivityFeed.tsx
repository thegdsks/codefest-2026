'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type ActivityEvent,
  type DecisionActivityEvent,
  getActivityFeed,
  type SignalActivityEvent,
} from '@/lib/admin-api';
import DecisionDrawer from './DecisionDrawer';

// Re-exported for backward compatibility with DecisionDrawer and other consumers.
export const DECISION_TYPE_LABEL: Record<string, string> = {
  FRAUD_LOGIN: 'Login check',
  FRAUD_TRANSFER: 'Transfer check',
  MFA_EVENT: 'MFA outcome',
  MFA_VERIFY: 'MFA verification',
  ENGAGEMENT: 'Engagement signal',
  ENGAGEMENT_OFFER: 'Offer surface',
  NUDGE: 'Nudge',
  PROFILE_COMPLETENESS: 'Profile check',
  LOGIN: 'Login',
  TRANSFER: 'Transfer',
  OFFER: 'Offer',
  DECISION_RELEASE: 'Manual release',
};

type FilterKind = 'all' | 'DECISION' | 'SESSION' | 'DEMO_EVENT' | 'SIGNAL';

const FILTER_PILLS: { label: string; value: FilterKind }[] = [
  { label: 'All', value: 'all' },
  { label: 'Decisions', value: 'DECISION' },
  { label: 'Sessions', value: 'SESSION' },
  { label: 'Signals', value: 'SIGNAL' },
  { label: 'Demo actions', value: 'DEMO_EVENT' },
];

const MAX_ACCUMULATED = 200;

function rowBorderClass(ev: ActivityEvent): string {
  if (ev.kind === 'SESSION') return 'border-l-2 border-l-sky-500/70';
  if (ev.kind === 'DEMO_EVENT') return 'border-l-2 border-l-violet-500/70';
  if (ev.kind === 'SIGNAL') return 'border-l-2 border-l-teal-400/70';
  const d = ev as DecisionActivityEvent;
  // Guard: raw may be absent on malformed payloads from the feed endpoint.
  if (d.raw?.action === 'BLOCK') return 'border-l-2 border-l-rose-500/70';
  return 'border-l-2 border-l-amber-500/50';
}

function kindBadgeClass(kind: ActivityEvent['kind']): string {
  if (kind === 'SESSION') return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  if (kind === 'DEMO_EVENT') return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
  if (kind === 'SIGNAL') return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
  return 'bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] border-[color:var(--border-strong)]';
}

function kindLabel(kind: ActivityEvent['kind']): string {
  if (kind === 'SESSION') return 'Session';
  if (kind === 'DEMO_EVENT') return 'Demo';
  if (kind === 'SIGNAL') return 'Signal';
  return 'Decision';
}

function formatRelative(epochMs: number): string {
  const diffSec = Math.floor((Date.now() - epochMs) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function stableEventKey(ev: ActivityEvent): string {
  if (ev.kind === 'DECISION') return `decision-${ev.decisionId}`;
  if (ev.kind === 'SESSION') return `session-${ev.sessionId}`;
  if (ev.kind === 'SIGNAL') return `signal-${ev.userId}-${ev.timestamp}`;
  return `demo-${ev.timestamp}-${ev.actor}`;
}

function eventSubject(ev: ActivityEvent): string {
  if (ev.kind === 'DECISION' || ev.kind === 'SESSION' || ev.kind === 'SIGNAL') return ev.userId;
  return ev.actor;
}

function recentCount(events: ActivityEvent[], windowSec: number): number {
  const cutoff = Date.now() - windowSec * 1000;
  return events.filter((e) => e.timestamp >= cutoff).length;
}

// Subcomponent: expanded detail panel for a single event row.
interface EventDetailProps {
  ev: ActivityEvent;
  onOpenDecision: (id: string) => void;
  onClose: () => void;
}

function EventDetail({ ev, onOpenDecision, onClose }: EventDetailProps) {
  return (
    <div className="border-t border-[color:var(--border)] bg-[color:var(--bg-elevated)]/40 px-4 pb-3 pt-2">
      <div className="flex items-center justify-between pb-1.5">
        <span className="text-[11px] font-medium text-[color:var(--text-muted)]">Raw payload</span>
        <div className="flex items-center gap-2">
          {ev.kind === 'DECISION' && (
            <button
              type="button"
              onClick={() => {
                onOpenDecision(ev.decisionId);
                onClose();
              }}
              className="rounded px-2 py-0.5 text-[11px] text-indigo-400 hover:bg-indigo-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors"
            >
              Open in drawer
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Collapse"
            className="rounded px-2 py-0.5 text-[11px] text-[color:var(--text-dim)] hover:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors"
          >
            Collapse
          </button>
        </div>
      </div>
      <pre className="max-h-40 overflow-y-auto rounded bg-[color:var(--bg-surface)] p-2 font-mono text-[10px] text-[color:var(--text-muted)] leading-relaxed">
        {JSON.stringify(
          ev.kind === 'DEMO_EVENT'
            ? ev.payload
            : ev.kind === 'SIGNAL'
              ? (ev as SignalActivityEvent).raw
              : ev.raw,
          null,
          2
        )}
      </pre>
    </div>
  );
}

// Subcomponent: a single row in the feed.
interface FeedRowProps {
  ev: ActivityEvent;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenDecision: (id: string) => void;
  onCollapseDetail: () => void;
}

function FeedRow({ ev, isExpanded, onToggle, onOpenDecision, onCollapseDetail }: FeedRowProps) {
  return (
    <li className={rowBorderClass(ev)}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2 text-left transition-colors hover:bg-[color:var(--bg-elevated)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/70"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 tabular-nums text-[11px] text-[color:var(--text-dim)]">
            {formatRelative(ev.timestamp)}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${kindBadgeClass(ev.kind)}`}
          >
            {kindLabel(ev.kind)}
          </span>
          <span className="flex-1 truncate text-xs text-[color:var(--text-muted)]">
            {ev.summary}
          </span>
          <span className="shrink-0 truncate font-mono text-[11px] text-[color:var(--text-dim)]">
            {eventSubject(ev)}
          </span>
        </div>
      </button>
      {isExpanded && (
        <EventDetail ev={ev} onOpenDecision={onOpenDecision} onClose={onCollapseDetail} />
      )}
    </li>
  );
}

export default function LiveActivityFeed() {
  const [paused, setPaused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKind>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [drawerDecisionId, setDrawerDecisionId] = useState<string | null>(null);
  const [cursorMs, setCursorMs] = useState<number>(0);
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const [lastUpdateAt, setLastUpdateAt] = useState<number>(Date.now());
  const [relativeLabel, setRelativeLabel] = useState('just now');
  const listRef = useRef<HTMLUListElement>(null);

  useQuery({
    queryKey: ['unified-activity-feed', cursorMs],
    queryFn: async () => {
      const res = await getActivityFeed(cursorMs || undefined);
      if (res.data) {
        const incoming = res.data.events;
        if (incoming.length > 0) {
          setAllEvents((prev) => {
            const existingKeys = new Set(prev.map(stableEventKey));
            const fresh = incoming.filter((e) => !existingKeys.has(stableEventKey(e)));
            if (fresh.length === 0) return prev;
            const merged = [...fresh, ...prev].slice(0, MAX_ACCUMULATED);
            return merged;
          });
          setCursorMs(res.data.nextCursor);
          setLastUpdateAt(Date.now());
        }
      }
      return res.data ?? null;
    },
    refetchInterval: paused ? false : 3_000,
    staleTime: 0,
  });

  // Auto-scroll to top when near the top.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop < 120) {
      el.scrollTop = 0;
    }
  });

  // Relative time ticker.
  useEffect(() => {
    setRelativeLabel(formatRelative(lastUpdateAt));
    const id = setInterval(() => {
      setRelativeLabel(formatRelative(lastUpdateAt));
    }, 1_000);
    return () => clearInterval(id);
  }, [lastUpdateAt]);

  const filtered =
    activeFilter === 'all' ? allEvents : allEvents.filter((e) => e.kind === activeFilter);

  const count60s = recentCount(allEvents, 60);

  return (
    <>
      <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[color:var(--text-muted)]" aria-hidden="true" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Live activity
            </h2>
            {count60s > 0 && (
              <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                {count60s} / 60s
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[color:var(--text-dim)]">
              Updated {relativeLabel}
            </span>
            {!paused && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume polling' : 'Pause polling'}
              className="rounded p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 transition-colors"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Filter pills */}
        {/* biome-ignore lint/a11y/useSemanticElements: fieldset injects UA padding that breaks the tab-bar layout. */}
        <div
          className="flex gap-1.5 border-b border-[color:var(--border)] px-4 py-2"
          role="group"
          aria-label="Filter by event kind"
        >
          {FILTER_PILLS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveFilter(value)}
              aria-pressed={activeFilter === value}
              className={`rounded-full border px-3 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                activeFilter === value
                  ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-300'
                  : 'border-[color:var(--border)] bg-transparent text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Event list */}
        <section
          aria-label="Unified activity feed"
          aria-live="polite"
          aria-atomic="false"
          className="flex-1 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <p className="text-sm text-[color:var(--text-dim)]">Waiting for activity</p>
              <p className="text-[11px] text-[color:var(--text-dim)]">
                Events will appear here within 3s
              </p>
            </div>
          ) : (
            <ul ref={listRef} className="divide-y divide-[color:var(--border)]/60">
              {filtered.map((ev) => {
                const key = stableEventKey(ev);
                return (
                  <FeedRow
                    key={key}
                    ev={ev}
                    isExpanded={expandedKey === key}
                    onToggle={() => setExpandedKey((prev) => (prev === key ? null : key))}
                    onOpenDecision={setDrawerDecisionId}
                    onCollapseDetail={() => setExpandedKey(null)}
                  />
                );
              })}
            </ul>
          )}
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[color:var(--border)] px-4 py-2">
          <span className="text-[11px] text-[color:var(--text-dim)]">
            {filtered.length > 0 ? `${filtered.length} events` : 'No events yet'}
            {paused && <span className="ml-2 text-amber-400">paused</span>}
          </span>
        </div>
      </section>

      <DecisionDrawer decisionId={drawerDecisionId} onClose={() => setDrawerDecisionId(null)} />
    </>
  );
}
