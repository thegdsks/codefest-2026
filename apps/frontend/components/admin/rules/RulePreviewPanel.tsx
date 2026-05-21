'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { EngagementRule } from '@/lib/rules-api';

// Lazy-load the flow diagram to avoid SSR issues with @xyflow/react
const RuleFlowPreview = dynamic(() => import('./RuleFlowPreview'), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full rounded-lg border border-zinc-800 bg-zinc-950 animate-pulse" />
  ),
});

type PreviewTab = 'json' | 'flow';

const TABS: Array<{ value: PreviewTab; label: string }> = [
  { value: 'json', label: 'JSON Preview' },
  { value: 'flow', label: 'Flow Diagram' },
];

interface RulePreviewPanelProps {
  rule: EngagementRule;
}

export default function RulePreviewPanel({ rule }: RulePreviewPanelProps) {
  const [tab, setTab] = useState<PreviewTab>('json');

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1 w-fit">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
              tab === value ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'json' ? (
        <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-[11px] leading-relaxed text-zinc-300 max-h-[500px]">
          {JSON.stringify(rule, null, 2)}
        </pre>
      ) : (
        <RuleFlowPreview rule={rule} />
      )}
    </div>
  );
}
