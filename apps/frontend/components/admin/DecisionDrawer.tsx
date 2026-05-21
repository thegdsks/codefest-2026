'use client';

import { X } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Check, X as XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  type AuditTrailStep,
  type DecisionRow,
  type DecisionTrace,
  getDecision,
  type TraceCondition,
} from '@/lib/admin-api';
import { DECISION_TYPE_LABEL } from './LiveActivityFeed';
import Skeleton from './Skeleton';

interface DecisionDrawerProps {
  decisionId: string | null;
  onClose: () => void;
}

interface AiExplanation {
  paragraph: string;
  riskFactors: string[];
  recommendation: string;
}

function DecisionSummary({ decision }: { decision: DecisionRow }) {
  const rows: [string, string][] = [
    ['Decision ID', decision.decisionId],
    ['User ID', decision.userId],
    ['Type', DECISION_TYPE_LABEL[decision.decisionType] ?? decision.decisionType],
    ['Action', decision.action],
    ['Score', String(Math.round(decision.score))],
    ['Risk level', decision.riskLevel ?? '-'],
    ['Engine layer', decision.engineLayer],
    ['Channel', decision.channel ?? '-'],
    ['Reason code', decision.reasonCode ?? '-'],
    ['LLM model', decision.llmModel ?? '-'],
    [
      'LLM latency',
      typeof decision.llmLatencyMs === 'number' ? `${decision.llmLatencyMs} ms` : '-',
    ],
    ['Timestamp', new Date(decision.timestamp * 1000).toLocaleString()],
  ];

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
        Summary
      </h3>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-32 shrink-0 text-[color:var(--text-dim)]">{label}</dt>
            <dd className="break-all font-mono text-xs text-[color:var(--text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AuditTrailItem({ step }: { step: AuditTrailStep }) {
  const meta = [step.label, step.action, step.riskLevel].filter(Boolean).join(' · ');
  return (
    <li className="relative">
      <span className="absolute -left-[17px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full border border-indigo-500/60 bg-indigo-500/40" />
      <p className="text-xs font-medium text-[color:var(--text)]">{step.step}</p>
      {meta && <p className="mt-0.5 text-[11px] text-[color:var(--text-dim)]">{meta}</p>}
      {typeof step.score === 'number' && (
        <p className="mt-0.5 tabular-nums text-[11px] text-[color:var(--text-dim)]">
          score: {Math.round(step.score)}
        </p>
      )}
      {step.reasonCode && (
        <p className="mt-0.5 text-[11px] text-[color:var(--text-dim)]">reason: {step.reasonCode}</p>
      )}
      {step.llmModel && (
        <p className="mt-0.5 text-[11px] text-[color:var(--text-dim)]">
          model: {step.llmModel}
          {typeof step.llmLatencyMs === 'number' ? ` (${step.llmLatencyMs} ms)` : ''}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Trace components
// ---------------------------------------------------------------------------

function EngineLayerChip({ layer }: { layer: 'L1' | 'L1+L2' }) {
  const isL2 = layer === 'L1+L2';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isL2 ? 'bg-amber-500/15 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'
      }`}
    >
      {layer}
    </span>
  );
}

function MatchedConditionRow({ condition }: { condition: TraceCondition }) {
  const valueIsComplex = typeof condition.value === 'object' && condition.value !== null;
  const displayValue = valueIsComplex
    ? JSON.stringify(condition.value, null, 2)
    : String(condition.value);

  return (
    <li className="flex items-start gap-2 py-1">
      <span className="mt-0.5 shrink-0">
        {condition.satisfied ? (
          <Check size={12} className="text-emerald-500" />
        ) : (
          <XIcon size={12} className="text-rose-500" />
        )}
      </span>
      <span className="min-w-0 text-[11px]">
        <span className="text-[color:var(--text)]">{condition.field}</span>
        <span className="mx-1 text-[color:var(--text-dim)]">{condition.operator}</span>
        {valueIsComplex ? (
          <pre className="mt-1 overflow-x-auto rounded border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-1.5 text-[10px] leading-relaxed text-[color:var(--text-muted)]">
            {displayValue}
          </pre>
        ) : (
          <span className="font-mono text-[color:var(--text-muted)]">{displayValue}</span>
        )}
      </span>
    </li>
  );
}

function TraceSection({ trace }: { trace: DecisionTrace | null }) {
  if (trace === null) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
          Why this fired
        </h3>
        <p className="text-xs text-[color:var(--text-dim)]">No trace recorded for this decision.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
        Why this fired
      </h3>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm font-medium text-[color:var(--text)]">
          {trace.ruleName ?? 'No rule attribution'}
        </span>
        <EngineLayerChip layer={trace.engineLayer} />
        {typeof trace.latencyMs === 'number' && (
          <span className="font-mono text-[11px] text-[color:var(--text-dim)]">
            {trace.latencyMs} ms
          </span>
        )}
      </div>

      {/* Guard: matched may be absent if the backend omits it on older records. */}
      {(trace.matched ?? []).length > 0 && (
        <ul className="mb-3 space-y-0.5">
          {(trace.matched ?? []).map((condition) => (
            <MatchedConditionRow
              key={`${condition.field}-${condition.operator}-${String(condition.value)}`}
              condition={condition}
            />
          ))}
        </ul>
      )}

      {trace.llmRationale && (
        <details className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)]">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-[color:var(--text-muted)]">
            LLM rationale
          </summary>
          <p className="whitespace-pre-wrap px-3 pb-3 pt-1 font-sans text-xs leading-relaxed text-[color:var(--text-muted)]">
            {trace.llmRationale}
          </p>
        </details>
      )}
    </section>
  );
}

function AiAnalysisSection({ explanation }: { explanation: AiExplanation }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
        AI Analysis
      </h3>
      <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-3">
        <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
          {explanation.paragraph}
        </p>
        {/* Guard: riskFactors may be missing on partial AI responses. */}
        {(explanation.riskFactors ?? []).length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
              Risk Factors
            </p>
            <ul className="space-y-1">
              {(explanation.riskFactors ?? []).map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-1.5 text-[11px] text-[color:var(--text-muted)]"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
            Recommendation
          </p>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {explanation.recommendation}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function DecisionDrawer({ decisionId, onClose }: DecisionDrawerProps) {
  const isOpen = decisionId !== null;
  const closeRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['decision', decisionId],
    queryFn: async () => {
      if (!decisionId) return null;
      const res = await getDecision(decisionId);
      return res.data;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const decision = data?.decision ?? null;
  const auditTrail = data?.auditTrail ?? [];
  const trace = data !== null && data !== undefined && 'trace' in data ? data.trace : undefined;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" onClick={onClose} />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Decision detail"
        data-open={isOpen ? 'true' : 'false'}
        className={`fixed inset-y-0 right-0 z-50 w-[480px] overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--bg)] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[color:var(--text)]">Decision detail</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {isLoading && (
            <div className="space-y-3">
              {['a', 'b', 'c', 'd', 'e'].map((k) => (
                <Skeleton key={k} className="h-4 w-full" />
              ))}
            </div>
          )}

          {!isLoading && decision && (
            <>
              <DecisionSummary decision={decision} />

              {trace !== undefined && <TraceSection trace={trace} />}

              {decision.aiExplanation &&
                (decision.action === 'BLOCK' ||
                  decision.action === 'REVIEW' ||
                  decision.action === 'MFA') && (
                  <AiAnalysisSection explanation={decision.aiExplanation} />
                )}

              {(decision.reasonText || decision.explanation || decision.reason) && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
                    AI rationale
                  </h3>
                  <p className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
                    {decision.reasonText || decision.explanation || decision.reason}
                  </p>
                </section>
              )}

              {auditTrail.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
                    Audit trail
                  </h3>
                  <ol className="relative space-y-4 border-l border-[color:var(--border)] pl-4">
                    {auditTrail.map((step) => (
                      <AuditTrailItem key={`${step.step}-${step.score ?? 0}`} step={step} />
                    ))}
                  </ol>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
                  Raw JSON
                </h3>
                <pre className="overflow-x-auto rounded-md border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                  {JSON.stringify(decision, null, 2)}
                </pre>
              </section>
            </>
          )}

          {!isLoading && !decision && isOpen && (
            <p className="text-sm text-[color:var(--text-dim)]">Could not load decision detail.</p>
          )}
        </div>
      </aside>
    </>
  );
}
