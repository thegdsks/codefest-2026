'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { type AuditTrailStep, type DecisionRow, getDecision } from '@/lib/admin-api';
import Skeleton from './Skeleton';

interface DecisionDrawerProps {
  decisionId: string | null;
  onClose: () => void;
}

function DecisionSummary({ decision }: { decision: DecisionRow }) {
  const rows: [string, string][] = [
    ['Decision ID', decision.decisionId],
    ['User ID', decision.userId],
    ['Type', decision.decisionType],
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
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Summary</h3>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
            <dd className="break-all font-mono text-xs text-zinc-200">{value}</dd>
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
      <p className="text-xs font-medium text-zinc-200">{step.step}</p>
      {meta && <p className="mt-0.5 text-[11px] text-zinc-500">{meta}</p>}
      {typeof step.score === 'number' && (
        <p className="mt-0.5 tabular-nums text-[11px] text-zinc-500">
          score: {Math.round(step.score)}
        </p>
      )}
      {step.reasonCode && (
        <p className="mt-0.5 text-[11px] text-zinc-500">reason: {step.reasonCode}</p>
      )}
      {step.llmModel && (
        <p className="mt-0.5 text-[11px] text-zinc-500">
          model: {step.llmModel}
          {typeof step.llmLatencyMs === 'number' ? ` (${step.llmLatencyMs} ms)` : ''}
        </p>
      )}
    </li>
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
        className={`fixed inset-y-0 right-0 z-50 w-[480px] overflow-y-auto border-l border-zinc-800 bg-zinc-950 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Decision detail</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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

              {(decision.reasonText || decision.explanation || decision.reason) && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    AI rationale
                  </h3>
                  <p className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300">
                    {decision.reasonText || decision.explanation || decision.reason}
                  </p>
                </section>
              )}

              {auditTrail.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Audit trail
                  </h3>
                  <ol className="relative space-y-4 border-l border-zinc-800 pl-4">
                    {auditTrail.map((step) => (
                      <AuditTrailItem key={`${step.step}-${step.score ?? 0}`} step={step} />
                    ))}
                  </ol>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Raw JSON
                </h3>
                <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-400">
                  {JSON.stringify(decision, null, 2)}
                </pre>
              </section>
            </>
          )}

          {!isLoading && !decision && isOpen && (
            <p className="text-sm text-zinc-500">Could not load decision detail.</p>
          )}
        </div>
      </aside>
    </>
  );
}
