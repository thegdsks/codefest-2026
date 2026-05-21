'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { getMetrics, type Window } from '@/lib/admin-api';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function colorFromPct(pct: number): string {
  if (pct > 80) return '#F43F5E';
  if (pct > 50) return '#FBBF24';
  return '#34D399';
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface Props {
  window: Window;
  height?: number;
}

export default function EngineGuardRadial({ window: windowKey, height = 240 }: Props) {
  const { data: resp, isLoading } = useQuery({
    queryKey: ['metrics', windowKey],
    queryFn: () => getMetrics(windowKey),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const budget = useMemo(() => resp?.data?.budget ?? null, [resp]);

  const noAnim = prefersReducedMotion();

  if (isLoading) {
    return (
      <div
        role="img"
        className="w-full rounded-full bg-[color:var(--bg-elevated)] motion-safe:animate-pulse mx-auto"
        style={{ width: height, height }}
        aria-label="Loading engine guard radial chart"
      />
    );
  }

  const used = budget?.usedUsd;
  const cap = budget?.llmDailyUsd;

  if (used == null || cap == null || cap === 0) {
    return (
      <div
        role="img"
        className="flex flex-col items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-5 text-center"
        style={{ height }}
        aria-label="Engine guard cost data unavailable"
      >
        <p className="text-sm font-semibold text-[color:var(--text-muted)]">
          Guard data unavailable
        </p>
        <p className="mt-1 text-xs text-[color:var(--text-dim)]">No budget data in API response.</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((used / cap) * 100));
  const fillColor = colorFromPct(pct);
  const windowLabel =
    windowKey === '1h'
      ? '60 min window'
      : windowKey === '5m'
        ? '5 min window'
        : windowKey === '6h'
          ? '6 hour window'
          : windowKey === '30d'
            ? '30 day window'
            : windowKey === '7d'
              ? '7 day window'
              : '24 hour window';

  const chartData = [{ name: 'guard', value: pct, fill: fillColor }];

  return (
    <div role="img" aria-label={`Engine guard radial chart showing LLM cost usage: ${pct}% of cap`}>
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius={64}
          outerRadius={96}
          barSize={14}
          data={chartData}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: '#27272a' }}
            dataKey="value"
            angleAxisId={0}
            isAnimationActive={!noAnim}
            cornerRadius={7}
          />
          <text x="50%" y="47%" textAnchor="middle" fill="#e4e4e7" fontSize={16} fontWeight={600}>
            {formatUsd(used)} / {formatUsd(cap)}
          </text>
          <text x="50%" y="57%" textAnchor="middle" fill="#71717a" fontSize={11}>
            {windowLabel}
          </text>
          <text x="50%" y="68%" textAnchor="middle" fill={fillColor} fontSize={13} fontWeight={600}>
            {pct}%
          </text>
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
