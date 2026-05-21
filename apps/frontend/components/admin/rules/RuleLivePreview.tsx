'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateRulePayload, RuleTestResult, SampleMatch } from '@/lib/rules-api';
import { testRule } from '@/lib/rules-api';

interface RuleLivePreviewProps {
  payload: CreateRulePayload;
}

function countRules(group: CreateRulePayload['whenConditions']): number {
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

type TestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: RuleTestResult }
  | { kind: 'error'; message: string };

const DEBOUNCE_MS = 500;
const WINDOW_24H_SEC = 24 * 60 * 60;

export default function RuleLivePreview({ payload }: RuleLivePreviewProps) {
  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<TestState>({ kind: 'idle' });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const hasConditions = countRules(payload.whenConditions) + countRules(payload.whoConditions) > 0;

  useEffect(() => {
    if (!hasConditions) {
      setState({ kind: 'idle' });
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const myReq = ++reqIdRef.current;
      setState({ kind: 'loading' });
      testRule(payload as unknown as Record<string, unknown>, WINDOW_24H_SEC).then((res) => {
        if (myReq !== reqIdRef.current) return;
        if (res.error) {
          setState({ kind: 'error', message: res.error.message });
          return;
        }
        if (res.data) setState({ kind: 'ok', data: res.data });
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [hasConditions, payload]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable, ignore silently
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            JSON definition
          </h3>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
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
        <pre className="max-h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
          {json}
        </pre>
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
        Add conditions to see preview.
      </div>
    );
  }

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
        <Loader2 className="size-4 animate-spin" />
        running...
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {state.message}
      </div>
    );
  }

  const { count, samples } = state.data;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-sm text-zinc-200">
        Would have matched <span className="font-semibold text-indigo-300">{count}</span> engagement
        decisions in the last 24h.
      </div>
      {samples.length > 0 ? (
        <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300">
            Sample matches ({samples.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {samples.map((s: SampleMatch) => (
              <li
                key={s.decisionId}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-zinc-300">{s.decisionId}</span>
                  <span className="shrink-0 text-zinc-500">{s.timestamp}</span>
                </div>
                <div className="mt-0.5 text-zinc-500">
                  {s.signal} for {s.userId}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
