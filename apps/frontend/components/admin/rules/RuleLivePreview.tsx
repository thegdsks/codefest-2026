'use client';

import { Braces, Check, Copy, FileText, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateRulePayload,
  RuleConditionGroup,
  RuleTestResult,
  SampleMatch,
} from '@/lib/rules-api';
import { testRule } from '@/lib/rules-api';

interface RuleLivePreviewProps {
  payload: CreateRulePayload;
}

function countRules(group: RuleConditionGroup): number {
  let count = 0;
  for (const r of group.rules) {
    if ('combinator' in r) {
      count += countRules(r);
    } else {
      count += 1;
    }
  }
  return count;
}

function flattenRules(
  group: RuleConditionGroup
): Array<{ field: string; operator: string; value: unknown }> {
  const out: Array<{ field: string; operator: string; value: unknown }> = [];
  for (const r of group.rules) {
    if ('combinator' in r) {
      out.push(...flattenRules(r));
    } else {
      out.push({ field: r.field, operator: r.operator, value: r.value });
    }
  }
  return out;
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

const SIGNAL_BADGE_CLASS: Record<string, string> = {
  rage_click:
    'bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)] border-[color:var(--danger-border)]',
  dwell_no_action:
    'bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border-[color:var(--info-border)]',
  abandoned_flow_step:
    'bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] border-[color:var(--warning-border)]',
  repeated_query:
    'bg-[color:var(--accent-violet-bg)] text-[color:var(--accent-violet-fg)] border-[color:var(--accent-violet-border)]',
  points_balance_stare:
    'bg-[color:var(--success-bg)] text-[color:var(--success-fg)] border-[color:var(--success-border)]',
};

function signalBadgeClass(signal: string): string {
  return (
    SIGNAL_BADGE_CLASS[signal] ??
    'bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] border-[color:var(--border-strong)]'
  );
}

function toPlainEnglish(payload: CreateRulePayload): string {
  const whenRules = flattenRules(payload.whenConditions);
  const whoRules = flattenRules(payload.whoConditions);
  const all = [...whenRules, ...whoRules];
  const combinator = payload.whenConditions.combinator ?? 'and';
  const conditionText =
    all.length === 0
      ? 'any event fires'
      : all
          .map((r) => `${r.field} ${r.operator} ${JSON.stringify(r.value)}`)
          .join(` ${combinator.toUpperCase()} `);

  const action = payload.action.actionType ?? 'CUSTOM';
  const surface = payload.action.surface;
  const score = payload.action.score ?? 50;
  return `When ${conditionText}, then ${action.toLowerCase()} via ${surface} with score ${score}.`;
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: RuleTestResult }
  | { kind: 'error'; message: string };

type PreviewView = 'json' | 'plain';

const DEBOUNCE_MS = 500;
const WINDOW_24H_SEC = 24 * 60 * 60;

export default function RuleLivePreview({ payload }: RuleLivePreviewProps) {
  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const plain = useMemo(() => toPlainEnglish(payload), [payload]);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<PreviewView>('json');
  const [state, setState] = useState<TestState>({ kind: 'idle' });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  // Snapshot of the latest payload so the debounced effect can read it without
  // depending on every payload identity change (we already debounce by json).
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const hasConditions = countRules(payload.whenConditions) + countRules(payload.whoConditions) > 0;

  const runTest = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setState({ kind: 'loading' });
    const res = await testRule(payloadRef.current.definition, WINDOW_24H_SEC);
    if (myReq !== reqIdRef.current) return;
    if (res.error) {
      setState({ kind: 'error', message: res.error.message });
      return;
    }
    if (res.data) setState({ kind: 'ok', data: res.data });
  }, []);

  useEffect(() => {
    // Reading json here ties the effect's identity to payload content changes,
    // which is the contract we want for debounced re-tests.
    if (!hasConditions || json.length === 0) {
      setState({ kind: 'idle' });
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void runTest();
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [hasConditions, json, runTest]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(view === 'json' ? json : plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable, ignore silently
    }
  }

  const testing = state.kind === 'loading';

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void runTest()}
        disabled={!hasConditions || testing}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        {testing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        Test this rule
      </button>

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)]/60 p-0.5">
            <button
              type="button"
              onClick={() => setView('json')}
              aria-pressed={view === 'json'}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                view === 'json'
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
              }`}
            >
              <Braces className="size-3" />
              JSON
            </button>
            <button
              type="button"
              onClick={() => setView('plain')}
              aria-pressed={view === 'plain'}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                view === 'plain'
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
              }`}
            >
              <FileText className="size-3" />
              Plain English
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            {copied ? (
              <>
                <Check className="size-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3" />
                Copy
              </>
            )}
          </button>
        </div>
        {view === 'json' ? (
          <pre className="max-h-72 overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {json}
          </pre>
        ) : (
          <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-sm leading-relaxed text-[color:var(--text)]">
            {plain}
          </p>
        )}
      </div>

      <MatchCard state={state} hasConditions={hasConditions} />
    </div>
  );
}

interface MatchCardProps {
  state: TestState;
  hasConditions: boolean;
}

function MatchCard({ state, hasConditions }: MatchCardProps) {
  if (!hasConditions) {
    return (
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-4 text-sm text-[color:var(--text-muted)]">
        Add conditions to see preview.
      </div>
    );
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-4 text-sm text-[color:var(--text-muted)]">
        <Loader2 className="size-4 animate-spin" />
        running...
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-[color:var(--danger-border)] bg-[color:var(--danger-bg)] p-4 text-sm text-[color:var(--danger-fg)]">
        {state.message}
      </div>
    );
  }

  const { count, samples } = state.data;
  const signalCounts = new Map<string, number>();
  for (const s of samples) {
    signalCounts.set(s.signal, (signalCounts.get(s.signal) ?? 0) + 1);
  }
  const total = samples.length;
  const topSignal = [...signalCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-4">
      <div className="text-sm text-[color:var(--text)]">
        Would have matched <span className="font-semibold text-indigo-300">{count}</span> engagement
        decisions in the last 24h.
      </div>
      {count > 0 && topSignal ? (
        <div className="mt-2">
          <p className="text-[11px] text-[color:var(--text-dim)]">
            Most matches: <span className="text-[color:var(--text-muted)]">{topSignal[0]}</span> (
            {topSignal[1]} / {total} samples)
          </p>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-elevated)]">
            {[...signalCounts.entries()].map(([signal, n]) => (
              <div
                key={signal}
                role="img"
                aria-label={`${signal}: ${n}`}
                className={signalBarClass(signal)}
                style={{ width: `${(n / total) * 100}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}
      {samples.length > 0 ? (
        <details className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-[color:var(--text-muted)]">
            Sample matches ({samples.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {samples.map((s: SampleMatch) => (
              <SampleRow key={s.decisionId} sample={s} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const SIGNAL_BAR_CLASS: Record<string, string> = {
  rage_click: 'bg-rose-500',
  dwell_no_action: 'bg-indigo-500',
  abandoned_flow_step: 'bg-amber-500',
  repeated_query: 'bg-violet-500',
  points_balance_stare: 'bg-emerald-500',
};

function signalBarClass(signal: string): string {
  return SIGNAL_BAR_CLASS[signal] ?? 'bg-zinc-600';
}

interface SampleRowProps {
  sample: SampleMatch;
}

function SampleRow({ sample }: SampleRowProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(sample.decisionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be unavailable, ignore silently
    }
  }

  return (
    <li className="rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1.5 text-[11px] text-[color:var(--text-muted)]">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleCopyId}
          title="Copy decisionId"
          className="truncate text-left font-mono text-[color:var(--text-muted)] hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
        >
          {copied ? 'Copied!' : sample.decisionId}
        </button>
        <span className="shrink-0 text-[color:var(--text-dim)]">
          {formatRelative(sample.timestamp)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[color:var(--text-dim)]">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${signalBadgeClass(sample.signal)}`}
        >
          {sample.signal}
        </span>
        <span className="truncate">for {sample.userId}</span>
      </div>
    </li>
  );
}
