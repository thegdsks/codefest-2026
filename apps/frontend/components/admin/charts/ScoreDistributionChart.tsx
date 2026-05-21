'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDecisions, type Window } from '@/lib/admin-api';
import { bucketScores } from './bucketDecisions';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Props {
  window?: Window;
  height?: number;
}

export default function ScoreDistributionChart({ window: windowKey = '24h', height = 260 }: Props) {
  const { data: resp, isLoading } = useQuery({
    queryKey: ['decisions', windowKey, 500],
    queryFn: () => getDecisions({ window: windowKey, limit: 500 }),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const bins = useMemo(() => {
    const decisions = resp?.data?.decisions ?? [];
    return bucketScores(decisions);
  }, [resp]);

  const hasData = bins.some((b) => b.l1 + b.l1l2 > 0);
  const noAnim = prefersReducedMotion();

  if (isLoading) {
    return (
      <div
        role="img"
        className="w-full rounded bg-[color:var(--bg-elevated)] motion-safe:animate-pulse"
        style={{ height }}
        aria-label="Loading score distribution chart"
      />
    );
  }

  if (!hasData) {
    return (
      <EmptyState
        title="No score data"
        description="Score distribution will appear once decisions are available."
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="Histogram showing score distribution split by engine layer (L1 vs L1+L2)"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 12,
              color: '#e4e4e7',
            }}
            formatter={(value, name) => [
              value ?? 0,
              (name as string) === 'l1' ? 'L1 only' : 'L1 + L2',
            ]}
          />
          {/* Grey zone reference area (score 40-70) */}
          <ReferenceArea
            x1="40-49"
            x2="60-69"
            fill="#52525b"
            fillOpacity={0.12}
            label={{ value: 'grey zone', fill: '#71717a', fontSize: 10, position: 'insideTop' }}
          />
          <Bar
            dataKey="l1"
            stackId="a"
            fill="#71717a"
            name="L1 only"
            isAnimationActive={!noAnim}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="l1l2"
            stackId="a"
            fill="#6366F1"
            name="L1 + L2"
            isAnimationActive={!noAnim}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center gap-4 pl-4 text-xs text-[color:var(--text-dim)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-500" />
          L1 only
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-400" />
          L1 + L2
        </span>
        <span className="flex items-center gap-1.5 ml-2 text-[color:var(--text-dim)]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-700" />
          grey zone 40-70
        </span>
      </div>
    </div>
  );
}
