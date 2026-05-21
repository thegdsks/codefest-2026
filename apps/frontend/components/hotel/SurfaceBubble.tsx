'use client';

/**
 * SurfaceBubble.tsx
 *
 * Renders a single surface nudge card. Supports inline and fixed placements.
 *
 * Impression tracking: the engagement endpoint at POST /engagement/event only
 * accepts signals in { rage_click, dwell_no_action, abandoned_flow_step,
 * repeated_query, points_balance_stare }. NUDGE_SHOWN is not a valid signal,
 * so impression tracking falls back to client-side deduplication via
 * sessionStorage['sf.impression.<surfaceId>'].
 */

import { Gift, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SurfaceEvaluation } from '@/lib/hotel/surface-types';

type BubblePlacement = 'top-right' | 'bottom-right' | 'bottom-left' | 'inline';

type BubbleState = 'idle' | 'pending' | 'done';

interface SurfaceBubbleProps {
  surface: SurfaceEvaluation;
  placement: BubblePlacement;
  onDismiss: () => void;
  onAction: () => Promise<void>;
}

const PLACEMENT_CLASSES: Record<Exclude<BubblePlacement, 'inline'>, string> = {
  'top-right': 'fixed top-6 right-6 z-50',
  'bottom-right': 'fixed bottom-24 right-6 z-50',
  'bottom-left': 'fixed bottom-24 left-6 z-50',
};

function recordImpression(surfaceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `sf.impression.${surfaceId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // private browsing or storage full; no-op
  }
}

export default function SurfaceBubble({
  surface,
  placement,
  onDismiss,
  onAction,
}: SurfaceBubbleProps) {
  const [bubbleState, setBubbleState] = useState<BubbleState>('idle');
  const [visible, setVisible] = useState(true);
  const impressionFired = useRef(false);

  // Fire impression once on mount (client-side dedup only; see file header).
  useEffect(() => {
    if (impressionFired.current) return;
    impressionFired.current = true;
    recordImpression(surface.surfaceId);
  }, [surface.surfaceId]);

  // Auto-dismiss 3s after successful action.
  useEffect(() => {
    if (bubbleState !== 'done') return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 3000);
    return () => clearTimeout(timer);
  }, [bubbleState, onDismiss]);

  if (!visible) return null;

  const copy = surface.copy;
  const action = surface.nextAction;

  async function handleAction() {
    if (bubbleState !== 'idle') return;
    setBubbleState('pending');
    try {
      await onAction();
      setBubbleState('done');
    } catch {
      setBubbleState('idle');
    }
  }

  const cardContent = (
    <div className="relative bg-white border border-gray-200 border-l-4 border-l-[#775a19] shadow-lg shadow-[#775a19]/10 w-80 max-w-[calc(100vw-3rem)]">
      {/* Close button */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer bg-transparent border-none p-0"
      >
        <X size={14} />
      </button>

      <div className="p-5 pr-8">
        {/* Headline */}
        <div className="flex items-center gap-2 mb-2">
          <Gift size={14} className="text-[#775a19] shrink-0" />
          {copy?.headline && (
            <h3 className="font-serif text-sm font-semibold text-black leading-snug">
              {copy.headline}
            </h3>
          )}
        </div>

        {/* Body */}
        {copy?.body && (
          <p className="font-sans text-xs text-gray-600 leading-relaxed mb-4">{copy.body}</p>
        )}

        {/* Action area */}
        {bubbleState === 'idle' && action && (
          <button
            type="button"
            onClick={handleAction}
            className="bg-black hover:bg-[#775a19] text-white text-[10px] font-sans font-bold uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer border-none"
          >
            {action.label}
          </button>
        )}

        {bubbleState === 'pending' && (
          <div className="flex items-center gap-2 text-xs text-gray-500 font-sans">
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-[#775a19] rounded-full animate-spin" />
            Working...
          </div>
        )}

        {bubbleState === 'done' && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 font-sans font-bold uppercase tracking-wider">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
            </svg>
            Done
          </div>
        )}
      </div>
    </div>
  );

  if (placement === 'inline') {
    return <div className="animate-fade-in mb-6">{cardContent}</div>;
  }

  return (
    <div
      className={`${PLACEMENT_CLASSES[placement]} animate-surface-slide-in`}
      role="status"
      aria-live="polite"
    >
      {cardContent}
    </div>
  );
}
