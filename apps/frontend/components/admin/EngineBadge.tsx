import { Sparkle } from '@phosphor-icons/react';
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
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-100">
          <Sparkle size={11} />
          L1+L2
        </span>
        {!compact && typeof llmLatencyMs === 'number' ? (
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs tabular-nums text-[var(--text-muted)]">
            {llmLatencyMs} ms
          </span>
        ) : null}
        {!compact && llmModel ? (
          <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-dim)]">
            {llmModel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
      L1
    </span>
  );
}
