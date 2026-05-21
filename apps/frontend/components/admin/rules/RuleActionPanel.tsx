'use client';

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

export default function RuleActionPanel({ action, onChange }: RuleActionPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Surface
        </h3>
        <fieldset className="space-y-2">
          <legend className="sr-only">Surface type</legend>
          {SURFACES.map(({ value, label, description }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
                action.surface === value
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80'
              }`}
            >
              <input
                type="radio"
                name="surface"
                value={value}
                checked={action.surface === value}
                onChange={() => onChange({ surface: value })}
                className="mt-0.5 accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium text-zinc-200">{label}</div>
                <div className="text-[11px] text-zinc-500">{description}</div>
              </div>
            </label>
          ))}
        </fieldset>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Content
        </h3>
        <label className="flex items-center gap-2 cursor-pointer mb-3">
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
            onChange={(e) => onChange({ fallbackCopy: e.target.value })}
            rows={3}
            placeholder="Enter display copy..."
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
        </label>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Rate Limit
        </h3>
        <label className="flex items-center gap-3">
          <span className="text-sm text-zinc-300 whitespace-nowrap">Max per user per day</span>
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
