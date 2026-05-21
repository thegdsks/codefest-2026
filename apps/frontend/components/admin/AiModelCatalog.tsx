'use client';

import { Check, Info, Warning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { type AiConfigResponse, type AiModel, getAiConfig } from '@/lib/admin-api';
import Skeleton from './Skeleton';

const TIER_LABEL: Record<AiModel['tier'], string> = {
  budget: 'Budget',
  standard: 'Standard',
  premium: 'Premium',
};

const TIER_STYLE: Record<AiModel['tier'], string> = {
  budget:
    'text-[color:var(--success-fg)] bg-[color:var(--success-bg)] ring-[color:var(--success-border)]',
  standard: 'text-indigo-700 dark:text-indigo-400 bg-indigo-400/10 ring-indigo-400/20',
  premium: 'text-rose-700 dark:text-rose-400 bg-rose-400/10 ring-rose-400/20',
};

const FAMILY_LABEL: Record<AiModel['family'], string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  amazon: 'Amazon',
  meta: 'Meta',
  cohere: 'Cohere',
};

function fmtUsd(n: number | null, digits = 2): string {
  if (n === null) return '-';
  return `$${n.toFixed(digits)}`;
}

function fmtClassify(n: number | null): string {
  if (n === null) return '-';
  if (n < 0.0001) return `$${(n * 1000).toFixed(3)}/k`;
  return `$${n.toFixed(5)}`;
}

function TierChip({ tier }: { tier: AiModel['tier'] }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${TIER_STYLE[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function ModelRow({ m, onSelect }: { m: AiModel; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={m.active}
      className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
        m.active
          ? 'border-indigo-400/40 bg-indigo-500/5'
          : 'border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04]'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <span
          aria-hidden="true"
          className={`inline-grid h-5 w-5 place-items-center rounded-full ring-1 ring-inset ${
            m.active
              ? 'bg-indigo-500/20 text-indigo-300 ring-indigo-400/40'
              : 'bg-[color:var(--hover)] text-[color:var(--text-dim)] ring-[color:var(--border)] group-hover:ring-[color:var(--border-strong)]'
          }`}
        >
          {m.active && <Check size={11} weight="bold" aria-hidden="true" />}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-[color:var(--text)]">
            {m.displayName}
          </span>
          <TierChip tier={m.tier} />
          {m.recommended && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--warning-fg)] bg-[color:var(--warning-bg)] ring-1 ring-inset ring-[color:var(--warning-border)]">
              Recommended
            </span>
          )}
          {m.active && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-indigo-300 bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30">
              Active
            </span>
          )}
        </div>
        <p className="mt-1 text-[11.5px] text-[color:var(--text-muted)]">{m.notes}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10.5px]">
          <span className="text-[color:var(--text-muted)]">
            <span className="text-[color:var(--text-dim)] uppercase tracking-wider mr-1">In</span>
            <span className="text-[color:var(--text)] tabular-nums font-mono">
              {fmtUsd(m.inputUsdPerM)}
            </span>
            <span className="text-[color:var(--text-dim)]">/M</span>
          </span>
          <span className="text-[color:var(--text-muted)]">
            <span className="text-[color:var(--text-dim)] uppercase tracking-wider mr-1">Out</span>
            <span className="text-[color:var(--text)] tabular-nums font-mono">
              {fmtUsd(m.outputUsdPerM)}
            </span>
            <span className="text-[color:var(--text-dim)]">/M</span>
          </span>
          <span className="text-[color:var(--text-muted)]">
            <span className="text-[color:var(--text-dim)] uppercase tracking-wider mr-1">Call</span>
            <span className="text-[color:var(--text)] tabular-nums font-mono">
              {fmtClassify(m.classifyCostUsd)}
            </span>
          </span>
        </div>
        <span className="mt-1 inline-block text-[10px] text-[color:var(--text-dim)] font-mono">
          {FAMILY_LABEL[m.family]} · {m.id}
        </span>
      </div>
    </button>
  );
}

export default function AiModelCatalog() {
  const [data, setData] = useState<AiConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getAiConfig();
      if (cancelled) return;
      if (res.error !== null) {
        setErrorMsg(`${res.error.code}: ${res.error.message}`);
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelect = (id: string) => {
    if (!data) return;
    const m = data.models.find((mm) => mm.id === id);
    if (!m) return;
    alert(
      `Switching to ${m.displayName} requires updating LITELLM_MODEL on the Lambda.\n\nRun from the repo root:\n\n  ./scripts/enable-litellm.sh "$LITELLM_BASE_URL" "$LITELLM_API_KEY" "${m.id}"\n\nA follow-up PR will move this to a DDB-backed runtime setting writable from the UI.`
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)]">AI Assist model</h2>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
            LLM the engine uses for layer-2 classification and rule suggestion. Cost shown per
            typical classify call (200 in / 60 out).
          </p>
        </div>
        {data && (
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${
              data.proxyConfigured
                ? 'text-[color:var(--success-fg)] bg-[color:var(--success-bg)] ring-[color:var(--success-border)]'
                : 'text-[color:var(--warning-fg)] bg-[color:var(--warning-bg)] ring-[color:var(--warning-border)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${data.proxyConfigured ? 'bg-[color:var(--success-fg)]' : 'bg-[color:var(--warning-fg)]'}`}
            />
            {data.proxyConfigured ? 'LiteLLM connected' : 'AI Assist degraded'}
          </span>
        )}
      </div>

      <div className="p-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {errorMsg && !loading && (
          <div className="flex items-start gap-2 rounded-md border border-rose-400/20 bg-rose-400/5 p-3 text-[12px] text-rose-300">
            <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Could not load the model catalog: {errorMsg}</span>
          </div>
        )}

        {data && (
          <>
            {!data.activeModelKnown && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-3 text-[12px] text-[color:var(--warning-fg)]">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Active model id{' '}
                  <code className="font-mono text-[11px]">{data.activeModelId}</code> is not in the
                  catalog. Either add it to{' '}
                  <code className="font-mono text-[11px]">apps/backend/src/lib/aiModels.js</code> or
                  unset <code className="font-mono text-[11px]">LITELLM_MODEL</code> to fall back to{' '}
                  <code className="font-mono text-[11px]">{data.defaultModelId}</code>.
                </span>
              </div>
            )}

            {(['budget', 'standard', 'premium'] as const).map((tier) => {
              const rows = data.models.filter((m) => m.tier === tier);
              if (rows.length === 0) return null;
              return (
                <div key={tier} className="mb-4 last:mb-0">
                  <div className="mb-2 flex items-center gap-2">
                    <TierChip tier={tier} />
                    <span className="text-[11px] text-[color:var(--text-muted)]">
                      {tier === 'budget' && 'cheap enough for high-volume scoring'}
                      {tier === 'standard' && 'safe default quality and cost'}
                      {tier === 'premium' && 'reserve for last-resort accuracy'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {rows.map((m) => (
                      <ModelRow key={m.id} m={m} onSelect={() => onSelect(m.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
