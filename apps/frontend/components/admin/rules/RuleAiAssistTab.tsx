'use client';

import { Check, Sparkles, TriangleAlert, X } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ai-rule-description" className="sr-only">
          Rule description
        </label>
        <textarea
          id="ai-rule-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Describe the rule. Example: When a Gold-tier user dwells on their points balance for more than 8 seconds, show a nudge banner suggesting redemption options."
          className="block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Plain English in, structured rule out. You can tweak the result before saving.
        </p>
        <Button
          variant="primary"
          size="md"
          onClick={handleSuggest}
          loading={status.kind === 'loading'}
          disabled={!description.trim()}
        >
          <Sparkles className="size-4" />
          Suggest a rule
        </Button>
      </div>

      {status.kind === 'offline' ? (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
          AI assist is offline (LiteLLM not configured). You can still author the rule manually
          under the <span className="font-medium text-indigo-300">Visual</span> tab.
        </div>
      ) : null}

      {status.kind === 'error' ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
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
        <Sparkles className="size-4 text-indigo-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
          AI suggestion
        </span>
      </div>
      <div className="text-sm font-medium text-zinc-100">{result.name}</div>
      <p className="mt-1 text-sm text-zinc-400">{result.explanation}</p>

      <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-zinc-300">
          View compiled conditions
        </summary>
        <pre className="mt-2 overflow-auto text-[11px] leading-relaxed text-zinc-300">
          {JSON.stringify(conditions, null, 2)}
        </pre>
      </details>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDiscard}>
          <X className="size-3.5" />
          Discard
        </Button>
        <Button variant="primary" size="sm" onClick={onApply}>
          <Check className="size-3.5" />
          Apply to draft
        </Button>
      </div>
    </div>
  );
}
