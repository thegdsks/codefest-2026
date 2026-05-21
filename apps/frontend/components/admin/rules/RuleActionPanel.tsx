'use client';

import { Badge } from '@/components/ui/Badge';
import type { RuleAction, SurfaceType } from '@/lib/rules-api';

interface RuleActionPanelProps {
  action: RuleAction;
  onChange: (patch: Partial<RuleAction>) => void;
}

const SURFACES: Array<{ value: SurfaceType; label: string; description: string }> = [
  { value: 'banner', label: 'Banner', description: 'Full-width strip at top of screen' },
  { value: 'modal', label: 'Modal', description: 'Centre overlay, requires dismiss' },
  { value: 'tooltip', label: 'Tooltip', description: 'Anchored tip near the trigger element' },
];

const SCORE_ANCHORS: Array<{ label: string; range: string; min: number; max: number }> = [
  { label: 'Allow', range: '0-20', min: 0, max: 20 },
  { label: 'Nudge', range: '20-50', min: 20, max: 50 },
  { label: 'Warn', range: '50-80', min: 50, max: 80 },
  { label: 'Block', range: '80-100', min: 80, max: 100 },
];

const COPY_LIMIT = 200;
const COPY_WARN_AT = 180;

function scoreIsExtreme(score: number | undefined): boolean {
  if (typeof score !== 'number') return false;
  return score > 90 || score < 10;
}

function isUnusualPairing(action: RuleAction): boolean {
  return action.actionType === 'HINT' && action.surface !== 'tooltip';
}

export default function RuleActionPanel({ action, onChange }: RuleActionPanelProps) {
  const score = typeof action.score === 'number' ? action.score : 50;
  const copyLength = action.fallbackCopy.length;
  const overCopy = copyLength >= COPY_LIMIT;
  const warnCopy = copyLength >= COPY_WARN_AT && !overCopy;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Surface
        </h3>
        <fieldset className="space-y-2">
          <legend className="sr-only">Surface type</legend>
          {SURFACES.map(({ value, label, description }) => {
            const selected = action.surface === value;
            const unusual = selected && isUnusualPairing(action);
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                  selected
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80'
                }`}
              >
                <input
                  type="radio"
                  name="surface"
                  value={value}
                  checked={selected}
                  onChange={() => onChange({ surface: value })}
                  className="mt-0.5 accent-indigo-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-zinc-200">{label}</div>
                    {unusual ? (
                      <Badge variant="warning" size="sm">
                        Unusual pairing
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-zinc-500">{description}</div>
                </div>
              </label>
            );
          })}
        </fieldset>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Score weight
          </h3>
          <div className="flex items-center gap-2">
            {scoreIsExtreme(action.score) ? (
              <Badge variant="warning" size="sm">
                Unusually extreme
              </Badge>
            ) : null}
            <span className="font-mono text-sm tabular-nums text-zinc-100">{score}</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => onChange({ score: Number(e.target.value) })}
          aria-label="Score weight"
          className="w-full cursor-pointer accent-indigo-500"
        />
        <div className="mt-1.5 grid grid-cols-4 text-[10px] text-zinc-500">
          {SCORE_ANCHORS.map((a) => (
            <div key={a.label} className="flex flex-col">
              <span className="font-semibold text-zinc-400">{a.label}</span>
              <span>{a.range}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Content
        </h3>
        <label className="mb-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={action.useAI}
            onChange={(e) => onChange({ useAI: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="text-sm text-zinc-200">Use AI-personalized copy</span>
          <span className="text-[11px] text-zinc-500">(LLM generates based on user context)</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-400">
            {action.useAI ? 'Fallback copy (if AI unavailable)' : 'Copy text'}
          </span>
          <textarea
            value={action.fallbackCopy}
            onChange={(e) => onChange({ fallbackCopy: e.target.value.slice(0, COPY_LIMIT) })}
            rows={3}
            maxLength={COPY_LIMIT}
            placeholder="Enter display copy..."
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
          <div
            className={`mt-1 text-right text-[11px] tabular-nums ${
              overCopy ? 'text-rose-400' : warnCopy ? 'text-amber-300' : 'text-zinc-500'
            }`}
          >
            {copyLength} / {COPY_LIMIT}
          </div>
        </label>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Rate limit
        </h3>
        <label className="flex items-center gap-3">
          <span className="whitespace-nowrap text-sm text-zinc-300">Max per user per day</span>
          <input
            type="number"
            min={1}
            max={100}
            value={action.maxPerUserPerDay}
            onChange={(e) => onChange({ maxPerUserPerDay: Math.max(1, Number(e.target.value)) })}
            className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
        </label>
      </div>
    </div>
  );
}
