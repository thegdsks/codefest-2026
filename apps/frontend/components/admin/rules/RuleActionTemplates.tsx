'use client';

import { Gift, Hand, Lightbulb, Sliders } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { ActionType, RuleAction } from '@/lib/rules-api';

interface RuleActionTemplatesProps {
  action: RuleAction;
  onApply: (patch: Partial<RuleAction>) => void;
}

type SurfaceMockId = 'tooltip' | 'banner' | 'modal' | 'custom';

interface Template {
  id: ActionType;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  mock: SurfaceMockId;
  preset: Partial<RuleAction>;
}

const TEMPLATES: Template[] = [
  {
    id: 'HINT',
    title: 'Calm a rage-clicker',
    description: 'Soft inline tooltip when a user gets frustrated.',
    icon: Lightbulb,
    mock: 'tooltip',
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
    mock: 'banner',
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
    mock: 'modal',
    preset: {
      actionType: 'OFFER',
      surface: 'modal',
      score: 70,
      fallbackCopy: 'Complete this in the next 5 minutes and earn 2x bonus points.',
    },
  },
];

const CUSTOM: Pick<Template, 'id' | 'title' | 'description' | 'icon' | 'mock'> = {
  id: 'CUSTOM',
  title: 'Custom',
  description: 'Configure surface, score, and copy manually below.',
  icon: Sliders,
  mock: 'custom',
};

function matchesPreset(action: RuleAction, preset: Partial<RuleAction>): boolean {
  return (
    action.actionType === preset.actionType &&
    action.surface === preset.surface &&
    action.score === preset.score &&
    action.fallbackCopy === preset.fallbackCopy
  );
}

interface SurfaceMockProps {
  mock: SurfaceMockId;
  copy: string;
}

function SurfaceMock({ mock, copy }: SurfaceMockProps) {
  if (mock === 'tooltip') {
    return (
      <div className="flex h-14 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/80 px-2">
        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] text-zinc-200 shadow-sm">
          {copy}
        </span>
      </div>
    );
  }
  if (mock === 'banner') {
    return (
      <div className="flex h-14 items-center rounded-md border border-zinc-800 bg-zinc-950/80 p-1.5">
        <div className="flex h-full w-full items-center overflow-hidden rounded bg-zinc-900">
          <div className="h-full w-1 shrink-0 bg-indigo-500" />
          <span className="truncate px-2 text-[10px] text-zinc-200">{copy}</span>
        </div>
      </div>
    );
  }
  if (mock === 'modal') {
    return (
      <div className="flex h-14 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/80 p-1.5">
        <div className="flex h-full w-3/4 flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-900 shadow-md">
          <div className="flex h-3 items-center gap-1 border-b border-zinc-800 bg-zinc-950 px-1.5">
            <span className="size-1 rounded-full bg-zinc-700" />
            <span className="size-1 rounded-full bg-zinc-700" />
          </div>
          <div className="flex flex-1 items-center justify-center px-1.5">
            <span className="truncate text-[9px] text-zinc-300">{copy}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-14 items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 text-[10px] text-zinc-600">
      Build your own
    </div>
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
              aria-pressed={active}
              className={`relative text-left rounded-xl border bg-zinc-900/40 p-3 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                active ? 'border-indigo-500/50 ring-2 ring-indigo-400/70' : 'border-zinc-800'
              }`}
            >
              {active ? (
                <span className="absolute right-2 top-2">
                  <Badge variant="accent" size="sm">
                    Selected
                  </Badge>
                </span>
              ) : null}
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-indigo-300" />
                <span className="text-sm font-medium text-zinc-100">{t.title}</span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-zinc-500">{t.description}</div>
              <div className="mt-3">
                <SurfaceMock mock={t.mock} copy={t.preset.fallbackCopy ?? ''} />
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onApply({ actionType: 'CUSTOM' })}
          aria-pressed={isCustom}
          className={`relative text-left rounded-xl border bg-zinc-900/40 p-3 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
            isCustom ? 'border-indigo-500/50 ring-2 ring-indigo-400/70' : 'border-zinc-800'
          }`}
        >
          {isCustom ? (
            <span className="absolute right-2 top-2">
              <Badge variant="accent" size="sm">
                Selected
              </Badge>
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <CUSTOM.icon className="size-4 text-indigo-300" />
            <span className="text-sm font-medium text-zinc-100">{CUSTOM.title}</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-zinc-500">{CUSTOM.description}</div>
          <div className="mt-3">
            <SurfaceMock mock="custom" copy="" />
          </div>
        </button>
      </div>
    </div>
  );
}
