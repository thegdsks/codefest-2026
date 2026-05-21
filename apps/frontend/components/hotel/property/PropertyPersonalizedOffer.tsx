'use client';

import { Sparkles, Tag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import type { PersonalizedOffer } from '@/lib/hotel/customer-api';
import { fetchPersonalizedOffer } from '@/lib/hotel/customer-api';
import type { PropertyPersonalizedOfferContext } from '@/lib/hotel/surface-types';
import { useSurfaceEligibility } from '@/lib/hotel/use-surface-eligibility';

interface PropertyPersonalizedOfferProps {
  propertyId: string;
  propertyName: string;
}

/**
 * Renders an AI-composed personalized offer card above the booking card when
 * the PROPERTY_PERSONALIZED_OFFER surface is in the SHOWN state. Tracks dwell
 * time on mount and fetches the offer once the surface becomes SHOWN.
 */
export default function PropertyPersonalizedOffer({
  propertyId,
  propertyName: _propertyName,
}: PropertyPersonalizedOfferProps) {
  const { session } = useCustomer();
  const { surfaces } = useSurfaceEligibility();
  const mountRef = useRef(Date.now());
  const [offer, setOffer] = useState<PersonalizedOffer | null>(null);
  const [fetching, setFetching] = useState(false);
  const fetchedRef = useRef(false);

  const surface = surfaces.PROPERTY_PERSONALIZED_OFFER;
  const ctx = surface?.context as PropertyPersonalizedOfferContext | undefined;
  const isShown = surface?.state === 'SHOWN';

  useEffect(() => {
    if (!isShown || !session || fetchedRef.current) return;
    fetchedRef.current = true;

    const dwellMs = Date.now() - mountRef.current;
    setFetching(true);

    fetchPersonalizedOffer(session.token, session.userId, propertyId, dwellMs)
      .then((res) => {
        if (res.data?.offer) setOffer(res.data.offer);
      })
      .catch(() => {
        // Silently degrade - offer card simply does not appear.
      })
      .finally(() => setFetching(false));
  }, [isShown, session, propertyId]);

  // Not yet shown or no offer available - render nothing.
  if (!isShown || (!offer && !fetching)) return null;

  if (fetching) {
    return (
      <div className="mb-6 p-5 border border-[#b8962e]/30 bg-[#b8962e]/5 animate-pulse">
        <div className="h-3 w-2/3 bg-[#b8962e]/20 rounded mb-2" />
        <div className="h-2 w-full bg-[#b8962e]/10 rounded mb-1" />
        <div className="h-2 w-4/5 bg-[#b8962e]/10 rounded" />
      </div>
    );
  }

  if (!offer) return null;

  const tierLabel = ctx?.userTier ?? '';

  return (
    <div className="mb-6 p-5 border border-[#b8962e]/40 bg-gradient-to-br from-[#b8962e]/8 to-[#b8962e]/3 relative overflow-hidden text-left animate-fade-in shadow-sm">
      {/* Warm glow accent */}
      <div className="absolute -right-6 -top-6 w-28 h-28 bg-[#b8962e]/15 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between mb-3 border-b border-[#b8962e]/15 pb-2">
        <div className="flex items-center gap-1.5 text-[#b8962e]">
          <Sparkles size={14} className="shrink-0" />
          <span className="text-[10px] font-bold tracking-widest uppercase font-sans">
            Personalized Offer
            {tierLabel ? ` for ${tierLabel} Members` : ''}
          </span>
        </div>
        {offer.discountPct > 0 && (
          <div className="flex items-center gap-1 bg-[#b8962e] text-white px-2 py-0.5 rounded-[3px] text-[10px] font-bold font-mono">
            <Tag size={10} className="mr-0.5" />
            <span>{offer.discountPct}% OFF</span>
          </div>
        )}
      </div>

      <h4 className="text-sm font-bold font-sans text-gray-900 mb-1.5">{offer.headline}</h4>
      <p className="text-xs text-gray-700 font-sans leading-relaxed mb-3">{offer.body}</p>

      {offer.validUntilMin <= 60 && (
        <p className="text-[10px] text-[#b8962e] font-sans font-semibold mb-3">
          Valid for the next {offer.validUntilMin} minutes only.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-[#b8962e]/15 pt-2">
        <div className="flex flex-wrap gap-1">
          {offer.personalizationFactors.slice(0, 2).map((factor) => (
            <span
              key={factor}
              className="text-[8px] bg-[#b8962e]/10 text-[#b8962e] px-1.5 py-0.5 font-bold uppercase tracking-wider font-sans"
            >
              {factor}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="text-[9px] text-[#b8962e] font-bold uppercase tracking-wider hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0 focus:outline-none font-sans"
        >
          {offer.cta}
        </button>
      </div>
    </div>
  );
}
