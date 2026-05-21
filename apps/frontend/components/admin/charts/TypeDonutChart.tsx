'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { getMetrics, type Window } from '@/lib/admin-api';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const TYPE_COLORS = [
  '#6366F1',
  '#F43F5E',
  '#34D399',
  '#FBBF24',
  '#38BDF8',
  '#E879F9',
  '#F97316',
  '#A78BFA',
];

interface CenterLabelProps {
  cx: number;
  cy: number;
  total: number;
}

function CenterLabel({ cx, cy, total }: CenterLabelProps) {
  return (
    <>
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#e4e4e7" fontSize={20} fontWeight={600}>
        {total.toLocaleString()}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#71717a" fontSize={11}>
        decisions
      </text>
    </>
  );
}

interface Props {
  window: Window;
  height?: number;
}

export default function TypeDonutChart({ window: windowKey, height = 240 }: Props) {
  const { data: resp, isLoading } = useQuery({
    queryKey: ['metrics', windowKey],
    queryFn: () => getMetrics(windowKey),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const { slices, total } = useMemo(() => {
    const byType = resp?.data?.totals?.by_type ?? {};
    const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const t = entries.reduce((sum, [, v]) => sum + v, 0);
    return {
      slices: entries.map(([name, value]) => ({ name, value })),
      total: t,
    };
  }, [resp]);

  const noAnim = prefersReducedMotion();

  if (isLoading) {
    return (
      <div
        role="img"
        className="w-full rounded-full bg-zinc-800 motion-safe:animate-pulse mx-auto"
        style={{ width: height, height }}
        aria-label="Loading decision type donut chart"
      />
    );
  }

  if (slices.length === 0) {
    return (
      <EmptyState
        title="No type data"
        description="Decision type breakdown will appear here once decisions are processed."
      />
    );
  }

  return (
    <div role="img" aria-label="Donut chart showing distribution of decisions by type">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={slices}
            cx="40%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            isAnimationActive={!noAnim}
          >
            {slices.map((entry, index) => (
              <Cell key={entry.name} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
            ))}
            <CenterLabel cx={0} cy={0} total={total} />
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 12,
              color: '#e4e4e7',
            }}
            formatter={(value, name) => [(value ?? 0).toLocaleString(), name as string]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
