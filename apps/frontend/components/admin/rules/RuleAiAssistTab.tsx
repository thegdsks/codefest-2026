'use client';

import { Check, Sparkle, Warning, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { type AiSuggestResult, aiSuggest, type RuleConditionGroup } from '@/lib/rules-api';

interface RuleAiAssistTabProps {
  onApply: (result: AiSuggestResult) => void;
}

type SuggestStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; result: AiSuggestResult }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

const PROMPT_TEMPLATES = [
  'When a user clicks the same button 5+ times in 3 seconds, show a help tooltip explaining the next step.',
  'When a Silver-tier user views the same property 3 times without booking, send a personalized 2x points offer.',
  'When a user abandons a points transfer mid-flow, show a banner with a one-tap resume button.',
  'When a Gold-tier user has not enrolled MFA, nudge them with a security reminder on the profile page.',
  'When a user dwells on the points balance for more than 8 seconds, show a redemption modal.',
  'When a transfer over 50000 SFC is initiated from a new device, force MFA verification.',
] as const;

export default function RuleAiAssistTab({ onApply }: RuleAiAssistTabProps) {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<SuggestStatus>({ kind: 'idle' });

  async function handleSuggest() {
    if (!description.trim()) return;
    setStatus({ kind: 'loading' });
    const res = await aiSuggest(description.trim());
    if (res.error) {
      if (res.error.code === '503' || /offline/i.test(res.error.message)) {
        setStatus({ kind: 'offline' });
        return;
      }
      setStatus({ kind: 'error', message: res.error.message });
      return;
    }
    if (res.data) {
      setStatus({ kind: 'ok', result: res.data });
    }
  }

  function handleDiscard() {
    setStatus({ kind: 'idle' });
  }

  function handleApply(result: AiSuggestResult) {
    onApply(result);
    setStatus({ kind: 'idle' });
  }

  function applyTemplate(template: string) {
    setDescription(template);
    const el = document.getElementById('ai-rule-description');
    el?.focus();
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-[color:var(--text-muted)]">
            Describe your rule
          </span>
          <span className="inline-flex items-center rounded border border-[color:var(--info-border)] bg-[color:var(--info-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--info-fg)]">
            BETA
          </span>
          <span className="text-[10px] text-[color:var(--text-dim)]">
            Falls back to manual when LLM is unreachable
          </span>
        </div>

        <fieldset className="mb-2 flex flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">Prompt templates</legend>
          {PROMPT_TEMPLATES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)] transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              <Sparkle size={10} weight="fill" className="shrink-0 text-indigo-400" />
              <span className="max-w-[220px] truncate">{tpl}</span>
            </button>
          ))}
        </fieldset>

        <label htmlFor="ai-rule-description" className="sr-only">
          Rule description
        </label>
        <textarea
          id="ai-rule-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Describe the rule. Example: When a Gold-tier user dwells on their points balance for more than 8 seconds, show a nudge banner suggesting redemption options."
          className="block w-full rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg-surface)] px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[color:var(--text-dim)]">
          Plain English in, structured rule out. You can tweak the result before saving.
        </p>
        <Button
          variant="primary"
          size="md"
          onClick={handleSuggest}
          loading={status.kind === 'loading'}
          disabled={!description.trim()}
        >
          <Sparkle size={16} />
          Suggest a rule
        </Button>
      </div>

      {status.kind === 'offline' ? (
        <div className="rounded-lg border border-[color:var(--border-strong)]/60 bg-[color:var(--bg-surface)]/40 px-4 py-3 text-sm text-[color:var(--text-muted)]">
          AI assist is offline (LiteLLM not configured). You can still author the rule manually
          under the <span className="font-medium text-indigo-300">Visual</span> tab.
        </div>
      ) : null}

      {status.kind === 'error' ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
          <Warning size={16} className="mt-0.5 shrink-0" />
          <span>{status.message}</span>
        </div>
      ) : null}

      {status.kind === 'ok' ? (
        <SuggestionCard
          result={status.result}
          onApply={() => handleApply(status.result)}
          onDiscard={handleDiscard}
        />
      ) : null}
    </div>
  );
}

interface SuggestionCardProps {
  result: AiSuggestResult;
  onApply: () => void;
  onDiscard: () => void;
}

function SuggestionCard({ result, onApply, onDiscard }: SuggestionCardProps) {
  const conditions: RuleConditionGroup = result.conditions;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkle size={16} className="text-indigo-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          AI suggestion
        </span>
      </div>
      <div className="text-sm font-medium text-[color:var(--text)]">{result.name}</div>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">{result.explanation}</p>

      <details className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-[color:var(--text-muted)]">
          View compiled conditions
        </summary>
        <pre className="mt-2 overflow-auto text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          {JSON.stringify(conditions, null, 2)}
        </pre>
      </details>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDiscard}>
          <X size={14} />
          Discard
        </Button>
        <Button variant="primary" size="sm" onClick={onApply}>
          <Check size={14} />
          Apply to draft
        </Button>
      </div>
    </div>
  );
}
