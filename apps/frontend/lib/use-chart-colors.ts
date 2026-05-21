'use client';

import { useTheme } from 'next-themes';

export interface ChartColorPalette {
  /** Stacked area / line chart: action-type series */
  ALLOW: string;
  BLOCK: string;
  MFA: string;
  REVIEW: string;
  OFFER: string;
  NUDGE: string;
  /** Donut / pie chart: rotating slice palette */
  slices: string[];
  /** Recharts tooltip background and border */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipLabel: string;
  /** Chart axis / grid */
  axisTick: string;
  gridLine: string;
}

const DARK: ChartColorPalette = {
  ALLOW: '#6366F1',
  BLOCK: '#F43F5E',
  MFA: '#FBBF24',
  REVIEW: '#38BDF8',
  OFFER: '#34D399',
  NUDGE: '#E879F9',
  slices: ['#6366F1', '#F43F5E', '#34D399', '#FBBF24', '#38BDF8', '#E879F9', '#F97316', '#A78BFA'],
  tooltipBg: '#18181b',
  tooltipBorder: '#3f3f46',
  tooltipText: '#e4e4e7',
  tooltipLabel: '#a1a1aa',
  axisTick: '#71717a',
  gridLine: '#27272a',
};

const LIGHT: ChartColorPalette = {
  ALLOW: '#4f46e5',
  BLOCK: '#e11d48',
  MFA: '#b45309',
  REVIEW: '#0284c7',
  OFFER: '#059669',
  NUDGE: '#9333ea',
  slices: ['#4f46e5', '#e11d48', '#059669', '#b45309', '#0284c7', '#9333ea', '#c2410c', '#7c3aed'],
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  tooltipText: '#0f172a',
  tooltipLabel: '#64748b',
  axisTick: '#64748b',
  gridLine: '#e2e8f0',
};

/**
 * Returns a theme-aware color palette for Recharts charts.
 * Falls back to dark palette during SSR (before hydration).
 */
export function useChartColors(): ChartColorPalette {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'light' ? LIGHT : DARK;
}
