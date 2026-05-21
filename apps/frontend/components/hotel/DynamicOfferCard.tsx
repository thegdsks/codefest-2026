'use client';

import { useEngagement } from '@signal-force/engagement-sdk/react';
import { Sparkles } from 'lucide-react';

/**
 * DynamicOfferCard
 *
 * Reads the active intervention from the engagement SDK. When the backend
 * engine surfaces an offer_modal or nudge_banner intervention, this card
 * renders the engine-generated message and CTA. Otherwise it shows a soft
 * placeholder that does not look broken to the user.
 *
 * Drop this into any page where hardcoded promo cards previously lived.
 * The wrapping section/layout is left intact by the caller.
 */
export default function DynamicOfferCard() {
  const { currentIntervention, dismiss } = useEngagement();

  if (
    currentIntervention !== null &&
    (currentIntervention.surface === 'offer_modal' ||
      currentIntervention.surface === 'nudge_banner')
  ) {
    return (
      <div className="p-4 bg-[#775a19]/5 border-l-4 border-[#775a19] text-left relative overflow-hidden animate-fade-in shadow-sm">
        <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#775a19]/10 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-center gap-1.5 text-[#775a19] mb-2">
          <Sparkles size={13} className="shrink-0 animate-pulse" />
          <span className="text-[9px] font-bold tracking-widest uppercase font-sans">
            Personalized Offer
          </span>
        </div>

        <p className="text-[11px] text-gray-900 font-sans leading-relaxed">
          {currentIntervention.message}
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          {currentIntervention.ctaLabel ? (
            <a
              href={currentIntervention.ctaUrl ?? '#'}
              className="text-[9px] text-white font-bold uppercase tracking-wider bg-[#775a19] px-3 py-1.5 hover:bg-[#5c4312] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#775a19]"
            >
              {currentIntervention.ctaLabel}
            </a>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="text-[9px] text-gray-400 font-bold uppercase tracking-wider hover:text-gray-600 transition-colors bg-transparent border-none p-0 focus:outline-none ml-auto"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border border-dashed border-gray-200 text-left">
      <p className="text-xs text-gray-400 font-sans">
        No personalized offers right now - keep browsing.
      </p>
    </div>
  );
}
