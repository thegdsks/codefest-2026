import { Sparkles } from 'lucide-react';
import type { EngineLayer } from '@/lib/admin-api';

interface EngineBadgeProps {
  layer: EngineLayer;
  llmLatencyMs?: number;
  llmModel?: string;
  compact?: boolean;
}

export default function EngineBadge({
  layer,
  llmLatencyMs,
  llmModel,
  compact = false,
}: EngineBadgeProps) {
  if (layer === 'L1+L2') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500/30 to-fuchsia-500/30 border border-indigo-400/40 px-2 py-0.5 text-xs font-medium text-indigo-100">
          <Sparkles size={11} />
          L1+L2
        </span>
        {!compact && typeof llmLatencyMs === 'number' ? (
          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs tabular-nums text-zinc-300">
            {llmLatencyMs} ms
          </span>
        ) : null}
        {!compact && llmModel ? (
          <span className="inline-flex rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-400">
            {llmModel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
      L1
    </span>
  );
}
