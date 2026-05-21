'use client';

import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Sparkline({ data, color = '#6366F1' }: SparklineProps) {
  // Guard: callers may pass undefined when the metrics query is still loading.
  const safeData = Array.isArray(data) ? data : [];
  const chartData = useMemo(() => safeData.map((v, i) => ({ i, v })), [safeData]);
  const noAnim = prefersReducedMotion();

  if (safeData.length === 0) return null;

  return (
    <ResponsiveContainer width={60} height={20}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#', '')})`}
          dot={false}
          isAnimationActive={!noAnim}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
