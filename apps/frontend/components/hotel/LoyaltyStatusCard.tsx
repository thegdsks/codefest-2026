'use client';

import { ChevronDown, ChevronUp, Gift, Star, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { animateCounter } from '@/lib/hotel/animate-counter';
import type { MilesEntry } from '@/lib/hotel/customer-api';
import { useLoyaltySummary } from '@/lib/hotel/use-loyalty-summary';

// Arc geometry constants
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function milesIcon(type: MilesEntry['type']) {
  switch (type) {
    case 'TRANSFER_OUT':
      return <TrendingDown size={14} className="shrink-0" />;
    case 'TRANSFER_IN':
      return <TrendingUp size={14} className="shrink-0" />;
    case 'BOOKING_EARNED':
      return <Star size={14} className="shrink-0" />;
    case 'PROMO_BONUS':
      return <Gift size={14} className="shrink-0" />;
    case 'REDEMPTION':
      return <Zap size={14} className="shrink-0" />;
  }
}

function milesLabel(type: MilesEntry['type']) {
  switch (type) {
    case 'TRANSFER_OUT':
      return 'Transfer Out';
    case 'TRANSFER_IN':
      return 'Transfer In';
    case 'BOOKING_EARNED':
      return 'Booking Earned';
    case 'PROMO_BONUS':
      return 'Promo Bonus';
    case 'REDEMPTION':
      return 'Redemption';
  }
}

interface Props {
  compact?: boolean;
}

export default function LoyaltyStatusCard({ compact = false }: Props) {
  const { data, isLoading } = useLoyaltySummary();
  const [displayPoints, setDisplayPoints] = useState(0);
  const [arcProgress, setArcProgress] = useState(0);
  const [showBenefits, setShowBenefits] = useState(false);
  const cancelCounterRef = useRef<(() => void) | null>(null);
  const cancelArcRef = useRef<(() => void) | null>(null);

  // Detect reduced-motion preference once on mount
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!data) return;

    const targetPoints = data.currentPoints;
    const targetArc = data.tierProgress;

    if (prefersReducedMotion) {
      setDisplayPoints(targetPoints);
      setArcProgress(targetArc);
      return;
    }

    // Cancel any running animations from a previous data load
    cancelCounterRef.current?.();
    cancelArcRef.current?.();

    cancelCounterRef.current = animateCounter(0, targetPoints, 600, setDisplayPoints);
    cancelArcRef.current = animateCounter(0, Math.round(targetArc * 1000), 300, (v) =>
      setArcProgress(v / 1000)
    );

    return () => {
      cancelCounterRef.current?.();
      cancelArcRef.current?.();
    };
  }, [data, prefersReducedMotion]);

  if (isLoading || !data) {
    return (
      <div
        role="status"
        aria-label="Loading loyalty summary"
        className={`bg-white border border-gray-250/20 silk-shadow ${compact ? 'p-4' : 'p-8'} animate-pulse`}
      >
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-8 bg-gray-100 rounded w-2/3" />
      </div>
    );
  }

  const strokeDashoffset = CIRCUMFERENCE * (1 - arcProgress);
  const recentSlice = data.recentMiles.slice(0, 5);

  if (compact) {
    return (
      <div className="bg-white border border-gray-200 shadow-lg p-5 w-72 font-sans">
        {/* Arc + points */}
        <div className="flex items-center gap-4 mb-4">
          <svg
            width="72"
            height="72"
            viewBox="0 0 140 140"
            aria-hidden="true"
            className="shrink-0 -rotate-90"
          >
            <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#f0ece6" strokeWidth="10" />
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              stroke="#775a19"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: prefersReducedMotion ? 'none' : undefined }}
            />
          </svg>
          <div className="text-left">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] font-sans block">
              {data.currentTier} Status
            </span>
            <p className="font-mono text-xl font-bold text-black leading-tight">
              {displayPoints.toLocaleString()}
            </p>
            <span className="text-[10px] text-gray-400 font-sans uppercase tracking-wider">
              SFC Points
            </span>
          </div>
        </div>

        {data.nextTier && (
          <div className="text-xs font-sans text-gray-500 border-t border-gray-100 pt-3">
            <span className="font-bold text-black">
              {data.pointsToNextTier.toLocaleString()} pts
            </span>{' '}
            to {data.nextTier}
          </div>
        )}
      </div>
    );
  }

  // Full card mode
  return (
    <div
      className="bg-white border border-gray-250/20 silk-shadow p-8"
      data-signal="points_balance"
      data-stare-target="points"
    >
      {/* Tier pills */}
      <div className="flex items-center gap-2 mb-6">
        <span className="bg-[#ffdea5] text-[#261900] px-3.5 py-1 text-[10px] font-sans font-bold uppercase tracking-wider">
          {data.currentTier}
        </span>
        {data.nextTier && (
          <>
            <span className="text-gray-300 text-sm">›</span>
            <span className="bg-gray-100 text-gray-500 px-3.5 py-1 text-[10px] font-sans font-bold uppercase tracking-wider">
              {data.nextTier}
            </span>
          </>
        )}
      </div>

      {/* Arc + counter */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative w-[140px] h-[140px]">
          <svg
            width="140"
            height="140"
            viewBox="0 0 140 140"
            aria-label={`${Math.round(arcProgress * 100)}% through ${data.currentTier} tier`}
            className="-rotate-90"
          >
            <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#f0ece6" strokeWidth="10" />
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              stroke="#775a19"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center rotate-90">
            <span className="font-mono text-2xl font-bold text-black leading-none whitespace-nowrap">
              {displayPoints.toLocaleString()}
            </span>
            <span className="text-[10px] text-gray-400 font-sans uppercase tracking-wider mt-0.5 whitespace-nowrap">
              SFC Points
            </span>
          </div>
        </div>

        {data.nextTier && (
          <p className="text-[11px] text-gray-500 font-sans mt-3 text-center">
            <span className="font-bold text-black">
              {data.pointsToNextTier.toLocaleString()} pts
            </span>{' '}
            to {data.nextTier}
          </p>
        )}
      </div>

      {/* Benefits toggle */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowBenefits((v) => !v)}
          className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[#775a19] transition-colors cursor-pointer bg-transparent border-none py-1"
          aria-expanded={showBenefits}
        >
          <span>{data.currentTier} Benefits</span>
          {showBenefits ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showBenefits && (
          <div className="mt-3 animate-fade-in">
            <ul className="space-y-1.5 mb-4">
              {data.tierBenefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs font-sans text-gray-700">
                  <span className="text-[#775a19] mt-0.5 shrink-0">•</span>
                  {b}
                </li>
              ))}
            </ul>

            {data.nextTier && data.nextTierBenefits.length > 0 && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  {data.nextTier} Benefits
                </p>
                <ul className="space-y-1.5">
                  {data.nextTierBenefits.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs font-sans text-gray-400">
                      <span className="mt-0.5 shrink-0">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent miles strip */}
      {recentSlice.length > 0 && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Recent Activity
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {recentSlice.map((entry) => {
              const positive = entry.amount > 0;
              return (
                <div
                  key={entry.id}
                  className={`flex-none flex flex-col gap-1 rounded p-3 min-w-[110px] border font-sans text-xs ${
                    positive
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                      : 'bg-red-50 border-red-100 text-red-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {milesIcon(entry.type)}
                    <span className="text-[9px] uppercase tracking-wider font-bold">
                      {milesLabel(entry.type)}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm leading-none">
                    {positive ? '+' : ''}
                    {entry.amount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
