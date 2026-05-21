'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDecisions, type Window } from '@/lib/admin-api';
import { bucketDecisions, windowToMs } from './bucketDecisions';

const ACTION_COLORS: Record<string, string> = {
  ALLOW: '#6366F1',
  BLOCK: '#F43F5E',
  MFA: '#FBBF24',
  REVIEW: '#38BDF8',
  OFFER: '#34D399',
  NUDGE: '#E879F9',
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatBucketLabel(tsMs: number, windowKey: Window): string {
  const d = new Date(tsMs);
  if (windowKey === '7d') {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  window: Window;
  height?: number;
}

export default function DecisionsOverTimeChart({ window: windowKey, height = 280 }: Props) {
  const { windowMs, bucketMs } = windowToMs(windowKey);

  const { data: resp, isLoading } = useQuery({
    queryKey: ['decisions', windowKey, 500],
    queryFn: () => getDecisions({ window: windowKey, limit: 500 }),
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const buckets = useMemo(() => {
    const decisions = resp?.data?.decisions ?? [];
    return bucketDecisions(decisions, windowMs, bucketMs);
  }, [resp, windowMs, bucketMs]);

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        ts: b.ts,
        label: formatBucketLabel(b.ts, windowKey),
        ALLOW: b.ALLOW,
        BLOCK: b.BLOCK,
        MFA: b.MFA,
        REVIEW: b.REVIEW,
        OFFER: b.OFFER,
        NUDGE: b.NUDGE,
      })),
    [buckets, windowKey]
  );

  const hasData = buckets.some((b) => b.ALLOW + b.BLOCK + b.MFA + b.REVIEW + b.OFFER + b.NUDGE > 0);

  const noAnim = prefersReducedMotion();

  if (isLoading) {
    return (
      <div
        role="img"
        className="w-full rounded bg-[color:var(--bg-elevated)] motion-safe:animate-pulse"
        style={{ height }}
        aria-label="Loading decisions over time chart"
      />
    );
  }

  if (!hasData) {
    return (
      <EmptyState
        title="No decisions in this window"
        description="Decisions will appear here as they are processed."
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="Stacked area chart showing decision counts over time by action type"
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {Object.entries(ACTION_COLORS).map(([action, color]) => (
              <linearGradient key={action} id={`dot-${action}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0.04} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717a', fontSize: 10 }}
            interval="preserveStartEnd"
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
            labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
            cursor={{ stroke: '#52525b', strokeWidth: 1 }}
          />
          {Object.entries(ACTION_COLORS).map(([action, color]) => (
            <Area
              key={action}
              type="monotone"
              dataKey={action}
              stackId="1"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#dot-${action})`}
              isAnimationActive={!noAnim}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
