'use client';

import { Gift, Hand, Lightbulb, Sliders } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ActionType, RuleAction } from '@/lib/rules-api';

interface RuleActionTemplatesProps {
  action: RuleAction;
  onApply: (patch: Partial<RuleAction>) => void;
}

interface Template {
  id: ActionType;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  preset: Partial<RuleAction>;
}

const TEMPLATES: Template[] = [
  {
    id: 'HINT',
    title: 'Calm a rage-clicker',
    description: 'Soft inline tooltip when a user gets frustrated.',
    icon: Lightbulb,
    preset: {
      actionType: 'HINT',
      surface: 'tooltip',
      score: 80,
      fallbackCopy:
        'Looks like that did not work. Try refreshing or message support if it keeps happening.',
    },
  },
  {
    id: 'NUDGE',
    title: 'Encourage redemption',
    description: 'Banner that prompts users to use their points.',
    icon: Hand,
    preset: {
      actionType: 'NUDGE',
      surface: 'banner',
      score: 75,
      fallbackCopy: 'Your points are ready to use. Tap to see redemption options.',
    },
  },
  {
    id: 'OFFER',
    title: 'Recover abandoner',
    description: 'Modal with a time-boxed bonus to bring users back.',
    icon: Gift,
    preset: {
      actionType: 'OFFER',
      surface: 'modal',
      score: 70,
      fallbackCopy: 'Complete this in the next 5 minutes and earn 2x bonus points.',
    },
  },
];

const CUSTOM: Pick<Template, 'id' | 'title' | 'description' | 'icon'> = {
  id: 'CUSTOM',
  title: 'Custom',
  description: 'Configure surface, score, and copy manually below.',
  icon: Sliders,
};

function matchesPreset(action: RuleAction, preset: Partial<RuleAction>): boolean {
  return (
    action.actionType === preset.actionType &&
    action.surface === preset.surface &&
    action.score === preset.score &&
    action.fallbackCopy === preset.fallbackCopy
  );
}

export default function RuleActionTemplates({ action, onApply }: RuleActionTemplatesProps) {
  const isCustom =
    !action.actionType ||
    action.actionType === 'CUSTOM' ||
    !TEMPLATES.some((t) => matchesPreset(action, t.preset));

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Action templates
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TEMPLATES.map((t) => {
          const active = matchesPreset(action, t.preset);
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onApply(t.preset)}
              className={`text-left rounded-xl border bg-zinc-900/40 px-3 py-3 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                active ? 'border-indigo-500/50 ring-2 ring-indigo-400/70' : 'border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-indigo-300" />
                <span className="text-sm font-medium text-zinc-100">{t.title}</span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-zinc-500">{t.description}</div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() =>
            onApply({
              actionType: 'CUSTOM',
            })
          }
          className={`text-left rounded-xl border bg-zinc-900/40 px-3 py-3 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
            isCustom ? 'border-indigo-500/50 ring-2 ring-indigo-400/70' : 'border-zinc-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <CUSTOM.icon className="size-4 text-indigo-300" />
            <span className="text-sm font-medium text-zinc-100">{CUSTOM.title}</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-zinc-500">{CUSTOM.description}</div>
        </button>
      </div>
    </div>
  );
}
