'use client';

import { attachDwellNoActionDetector, attachRageClickDetector } from '@signal-force/engagement-sdk';
import {
  Award,
  Clock,
  Compass,
  Heart,
  Map as MapView,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { type MouseEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { DESTINATIONS } from '@/lib/hotel/data';
import type { PrestigeAdvanceContext } from '@/lib/hotel/surface-types';
import { useSurfaceEligibility } from '@/lib/hotel/use-surface-eligibility';
import { useTrackedEngagement } from '@/lib/hotel/use-tracked-engagement';

const NEIGHBORHOODS = [
  'Luberon Valley',
  'Aix-en-Provence',
  'Saint-Rémy',
  'Kumar-Sharma Estate',
] as const;

const AMENITY_FILTERS = [
  { key: 'Pool', display: 'Private Infinity Pool' },
  { key: 'Dining', display: 'Michelin Dining Tier' },
  { key: 'Cellar', display: 'Curated Wine Cellar' },
  { key: 'Spa', display: 'Premium Onsite Spa' },
] as const;

function ResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCustomer();
  const { trackEvent } = useTrackedEngagement();
  const { surfaces } = useSurfaceEligibility();
  const resultsPrestigeSurface = surfaces['RESULTS_PRESTIGE_ADVANCE'];
  const searchQuery = searchParams.get('q') ?? 'Provence';
  const dateRange = searchParams.get('dates') ?? 'Oct 14 — Oct 21';

  // Rage click: user frantically clicking results without booking
  useEffect(() => {
    const detach = attachRageClickDetector((signal) => trackEvent(signal));
    return detach;
  }, [trackEvent]);

  // Dwell without action: user staring at results without clicking through
  // Use a shorter threshold (15s) since results page is action-oriented
  useEffect(() => {
    const detach = attachDwellNoActionDetector((signal) => trackEvent(signal), 15_000);
    return detach;
  }, [trackEvent]);

  const [maxPrice, setMaxPrice] = useState(2500);
  const [likedProperties, setLikedProperties] = useState<Record<string, boolean>>({});
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<Record<string, boolean>>({
    'Luberon Valley': true,
    'Aix-en-Provence': true,
    'Saint-Rémy': true,
    'Kumar-Sharma Estate': true,
  });
  const [selectedAmenities, setSelectedAmenities] = useState<Record<string, boolean>>({
    Pool: false,
    Spa: false,
    Dining: true,
    Cellar: false,
  });

  const [timeLeft, setTimeLeft] = useState(3 * 3600);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
  };

  const resultsPrestigeCtx = resultsPrestigeSurface?.context as PrestigeAdvanceContext | undefined;
  const pointsAway = resultsPrestigeCtx?.pointsToNextTier ?? user.nextTierPoints ?? 8000;
  const nextTierName =
    resultsPrestigeCtx?.nextTier ?? (user.status === 'Gold' ? 'Platinum' : 'Diamond');
  const resultsPrestigeHeadline =
    resultsPrestigeSurface?.copy?.headline ?? 'Prestige Advance Benefit';

  const toggleLike = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setLikedProperties((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleNeighborhood = (name: string) => {
    setSelectedNeighborhoods((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleAmenity = (key: string) => {
    setSelectedAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredDestinations = useMemo(() => {
    return DESTINATIONS.filter((item) => {
      if (item.price > maxPrice) return false;

      const hasAnyNeighborhood = Object.values(selectedNeighborhoods).some(Boolean);
      if (hasAnyNeighborhood && !selectedNeighborhoods[item.neighborhood]) {
        return false;
      }

      const checkedAmenities = Object.entries(selectedAmenities)
        .filter(([, checked]) => checked)
        .map(([key]) => key);

      for (const amenity of checkedAmenities) {
        if (
          amenity === 'Dining' &&
          !item.amenities.some(
            (a) => a.toLowerCase().includes('dining') || a.toLowerCase().includes('michelin')
          )
        ) {
          return false;
        }
        if (
          amenity === 'Pool' &&
          !item.amenities.some(
            (a) => a.toLowerCase().includes('pool') || a.toLowerCase().includes('basalt')
          )
        ) {
          return false;
        }
        if (amenity === 'Spa' && !item.amenities.some((a) => a.toLowerCase().includes('spa'))) {
          return false;
        }
        if (
          amenity === 'Cellar' &&
          !item.amenities.some(
            (a) => a.toLowerCase().includes('cellar') || a.toLowerCase().includes('wine')
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [maxPrice, selectedNeighborhoods, selectedAmenities]);

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <main className="max-w-[1440px] mx-auto px-8 py-10">
        <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-250/20 pb-8 gap-4">
          <div>
            <span className="font-sans text-[11px] text-[#775a19] uppercase tracking-widest font-semibold mb-2 block">
              Curation results
            </span>
            <h1 className="font-serif text-3xl md:text-5xl font-light text-black">
              Estates in {searchQuery}
            </h1>
            <p className="font-sans text-sm text-gray-500 mt-2">
              Viewing {filteredDestinations.length} exceptional sanctuaries matching your
              preferences for {dateRange}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 bg-[#efeded]/60 px-5 py-3 border border-gray-200 text-xs font-sans font-bold hover:bg-[#eae8e7] transition-all cursor-pointer"
            >
              <MapView size={14} className="text-[#775a19]" />
              <span>Show Map</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 bg-[#efeded]/60 px-5 py-3 border border-gray-200 text-xs font-sans font-bold hover:bg-[#eae8e7] transition-all cursor-pointer"
            >
              <SlidersHorizontal size={14} className="text-[#775a19]" />
              <span>Sort: Recommended</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Filter Sidebar */}
          <aside className="md:col-span-3 space-y-8 sticky top-28">
            <section className="bg-white p-6 border border-gray-200/50 shadow-sm">
              <h3 className="text-xs text-black font-bold uppercase tracking-widest mb-6 border-b border-gray-100 pb-2 flex items-center justify-between font-sans">
                <span>Price per night</span>
                <span className="text-[#775a19] text-xs font-mono">${maxPrice} max</span>
              </h3>
              <div className="px-1">
                <input
                  type="range"
                  min="400"
                  max="2500"
                  step="50"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#775a19]"
                />
                <div className="flex justify-between text-[11px] text-gray-400 font-sans mt-4">
                  <span>$400/night</span>
                  <span>$2,500/night</span>
                </div>
              </div>
            </section>

            <section className="bg-white p-6 border border-gray-200/50 shadow-sm">
              <h3 className="text-xs text-black font-bold uppercase tracking-widest mb-6 border-b border-gray-100 pb-2 font-sans">
                Neighborhoods
              </h3>
              <div className="space-y-4">
                {NEIGHBORHOODS.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-3 cursor-pointer group select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedNeighborhoods[name] || false}
                      onChange={() => toggleNeighborhood(name)}
                      className="w-4.5 h-4.5 border-gray-300 text-black rounded focus:ring-0 focus:ring-offset-0 cursor-pointer accent-black"
                    />
                    <span className="text-xs font-sans text-gray-700 group-hover:text-[#775a19] transition-colors">
                      {name}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-white p-6 border border-gray-200/50 shadow-sm">
              <h3 className="text-xs text-black font-bold uppercase tracking-widest mb-6 border-b border-gray-100 pb-2 font-sans">
                Amenities
              </h3>
              <div className="space-y-4 font-sans text-xs">
                {AMENITY_FILTERS.map(({ key, display }) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 cursor-pointer group select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAmenities[key] || false}
                      onChange={() => toggleAmenity(key)}
                      className="w-4.5 h-4.5 border-gray-300 text-black rounded focus:ring-0 focus:ring-offset-0 cursor-pointer accent-black"
                    />
                    <span className="text-xs text-gray-700 group-hover:text-[#775a19] transition-colors">
                      {display}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </aside>

          {/* Right Results list view */}
          <div className="md:col-span-9 space-y-6">
            {filteredDestinations.length > 0 ? (
              filteredDestinations.map((item) => (
                <article
                  key={item.id}
                  className="bg-white flex flex-col md:flex-row group overflow-hidden silk-shadow border border-gray-200/30 hover:border-gray-200 transition-all duration-300"
                >
                  <div className="md:w-[45%] h-64 md:h-auto relative overflow-hidden bg-black shrink-0">
                    <button
                      type="button"
                      onClick={() => router.push(`/property/${item.id}`)}
                      className="relative block w-full h-full p-0 border-none bg-transparent cursor-pointer"
                    >
                      <Image
                        fill
                        alt={item.name}
                        src={item.image}
                        className="object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out group-hover:opacity-90"
                        sizes="(max-width: 768px) 100vw, 45vw"
                      />
                    </button>
                    {item.featured && (
                      <div className="absolute top-4 left-4 bg-[#ffdea5] text-[#261900] px-3 py-1 text-[9px] font-sans font-bold uppercase tracking-wider shadow-sm">
                        Featured Sanctum
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => toggleLike(item.id, e)}
                      className="absolute top-4 right-4 bg-white/40 hover:bg-white backdrop-blur-md p-2 rounded-full text-black hover:text-[#775a19] transition-all cursor-pointer border-none shadow-sm"
                    >
                      <Heart
                        size={15}
                        fill={likedProperties[item.id] ? '#775a19' : 'none'}
                        className={likedProperties[item.id] ? 'text-[#775a19]' : 'text-black'}
                      />
                    </button>
                  </div>

                  <div className="md:w-[55%] p-8 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4 gap-2 font-sans">
                        <div className="flex items-center gap-1 text-[#775a19]">
                          <Star size={12} fill="currentColor" />
                          <span className="text-xs font-bold font-sans">{item.rating}</span>
                          <span className="text-gray-400 font-normal text-[10px]">
                            ({item.reviewsCount} reviews)
                          </span>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                          {item.neighborhood}
                        </span>
                      </div>

                      <h2 className="font-serif text-2xl font-semibold mb-3 text-black group-hover:text-[#775a19] transition-colors leading-tight">
                        {item.name}
                      </h2>
                      <p className="font-sans text-xs text-gray-500 line-clamp-2 leading-relaxed mb-6">
                        {item.description}
                      </p>

                      {item.id === 'bastide-gordes' && resultsPrestigeSurface?.eligible && (
                        <div className="mb-6 p-4 bg-[#775a19]/5 border border-[#775a19]/30 rounded-none relative overflow-hidden text-left animate-fade-in shadow-sm">
                          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-[#775a19]/10 rounded-full blur-xl pointer-events-none" />

                          <div className="flex items-center justify-between mb-2.5 border-b border-[#775a19]/15 pb-1.5">
                            <div className="flex items-center gap-1.5 text-[#775a19]">
                              <Award size={13} className="animate-bounce shrink-0" />
                              <span className="text-[9px] font-bold tracking-widest uppercase font-sans">
                                {resultsPrestigeHeadline}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 bg-[#775a19] text-white px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold font-mono">
                              <Clock size={10} className="mr-0.5" />
                              <span>{formatTime(timeLeft)}</span>
                            </div>
                          </div>

                          <p className="text-[11px] text-gray-900 font-sans leading-relaxed font-semibold">
                            You're only{' '}
                            <span className="text-[#775a19] font-bold">
                              {pointsAway.toLocaleString()}
                            </span>{' '}
                            points away from the next level. Book{' '}
                            <span className="border-b border-black">4 nights</span> in the next{' '}
                            <span className="border-b border-black">3 hours</span> to get{' '}
                            <span className="text-[#775a19] font-bold text-xs">double points</span>{' '}
                            and reach{' '}
                            <span className="text-[#775a19] font-bold">{nextTierName}</span> tier.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 mb-6">
                        {item.amenities.map((amenity) => (
                          <span
                            key={amenity}
                            className="flex items-center gap-1.5 text-gray-600 font-sans text-[11px] font-medium bg-gray-50 px-2 py-0.5 border border-gray-100 rounded"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#775a19]" />
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-4 gap-2">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-gray-400 block font-sans">
                          Starting from
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="font-serif text-2xl font-semibold text-black">
                            ${item.price}
                          </span>
                          <span className="text-xs text-gray-400 font-sans">/ night</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/property/${item.id}`)}
                        className="bg-black hover:bg-[#775a19] text-white px-8 py-4 text-xs font-sans font-semibold uppercase tracking-widest transition-all cursor-pointer group-hover:shadow-md"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="bg-white p-12 text-center border border-gray-200/50 rounded shadow-sm font-sans flex flex-col items-center">
                <Compass className="text-gray-300 w-16 h-16 mb-4 animate-spin duration-1000" />
                <h3 className="font-serif text-xl font-semibold mb-2">
                  No Sanctuaries Match Filters
                </h3>
                <p className="text-xs text-gray-500 max-w-md leading-relaxed mb-6">
                  We could not locate any properties under ${maxPrice} with the selected checkbox
                  constraints. Adjust the slider or filter checkboxes to expand the curation.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMaxPrice(2500);
                    setSelectedNeighborhoods({
                      'Luberon Valley': true,
                      'Aix-en-Provence': true,
                      'Saint-Rémy': true,
                      'Kumar-Sharma Estate': true,
                    });
                    setSelectedAmenities({ Pool: false, Spa: false, Dining: false, Cellar: false });
                  }}
                  className="bg-black text-white px-6 py-3.5 text-xs font-semibold uppercase tracking-widest cursor-pointer hover:bg-[#775a19] transition-colors"
                >
                  Reset Active Filters
                </button>
              </div>
            )}

            {filteredDestinations.length > 0 && (
              <nav className="flex justify-center items-center gap-3 py-10 font-sans font-semibold text-xs">
                <button
                  type="button"
                  disabled
                  className="w-11 h-11 flex items-center justify-center border border-gray-200 text-gray-300 transition-colors cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="w-11 h-11 flex items-center justify-center bg-black text-white"
                >
                  1
                </button>
                <button
                  type="button"
                  className="w-11 h-11 flex items-center justify-center border border-gray-250 text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  2
                </button>
                <button
                  type="button"
                  className="w-11 h-11 flex items-center justify-center border border-gray-250 text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  3
                </button>
                <span className="text-gray-400">...</span>
                <button
                  type="button"
                  className="w-11 h-11 flex items-center justify-center border border-gray-250 text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ResultsScreen() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fbf9f8]" />}>
      <ResultsInner />
    </Suspense>
  );
}
