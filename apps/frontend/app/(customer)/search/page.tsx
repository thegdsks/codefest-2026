'use client';

import { createRepeatedQueryTracker } from '@signal-force/engagement-sdk';
import { BadgePercent, Calendar, Gift, MapPin, Search, ShieldCheck, Users } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useRef, useState } from 'react';
import { useTrackedEngagement } from '@/lib/hotel/use-tracked-engagement';

export default function SearchScreen() {
  const router = useRouter();
  const { trackEvent } = useTrackedEngagement();

  // Wire a repeated query tracker that injects userId via useTrackedEngagement.
  // createRepeatedQueryTracker is stateful (counts queries internally), so we
  // keep a single instance in a ref tied to the trackEvent identity.
  const trackerRef = useRef<((query: string) => void) | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = createRepeatedQueryTracker((signal) => trackEvent(signal));
  }
  const trackSearch = useCallback((query: string) => trackerRef.current?.(query), []);
  const [destinationInput, setDestinationInput] = useState('');
  const [dates, setDates] = useState('Oct 14 — Oct 21');
  const [isFocused, setIsFocused] = useState<string | null>(null);

  const runSearch = (query: string) => {
    trackSearch(query);
    router.push(`/results?q=${encodeURIComponent(query)}`);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(destinationInput || 'Provence');
  };

  const handleSuggestedClick = (term: string) => {
    setDestinationInput(term);
    runSearch(term);
  };

  return (
    <div className="relative min-h-[90vh] bg-[#fbf9f8] flex flex-col justify-between overflow-hidden font-sans">
      {/* Absolute Atmospheric Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          fill
          className="object-cover opacity-15 grayscale-[20%]"
          alt="Atmospheric Wide Lobby"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBErniFNdmr_4fg_lkf0PjbbOoGazfMaAoJXGnBRZS4i0IJ4WVTFsfn2Rqbyk_68DpmFeOGJz6TLgC_MYZ5269WOFmPv_XPfiw_Tj4A3-lnblhzyaeoJjIyIIxoB1eXpfiO7sXLM2mFdW85aqGdf0trLgONP4o85spLmGgICVlBZN1Q2uzB2Or6Z-zBU-yLSc5yOHZavCDHC3xPAB56O3xvjThO_L2KLWF0KqbWy7DMidfb4fxSyF31oSv_4HNynjiyMqA1dViDHdU"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#fbf9f8]/40 via-[#fbf9f8]/90 to-[#fbf9f8]" />
      </div>

      {/* Central Content Column */}
      <div className="relative z-10 w-full max-w-[1440px] px-8 py-16 mx-auto flex-grow flex flex-col justify-center items-center">
        <div className="text-center mb-16 space-y-4">
          <span className="font-sans text-xs font-semibold uppercase tracking-[0.3em] text-[#775a19] block">
            Plan Your Escape
          </span>
          <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl text-black font-semibold max-w-3xl mx-auto leading-tight">
            Where should Signal Force take you next?
          </h1>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="w-full max-w-5xl bg-white p-3 md:p-4 rounded-xl silk-shadow flex flex-col md:flex-row items-stretch gap-2 transition-all duration-300 hover:shadow-2xl border border-gray-100"
        >
          <div
            className={`flex-1 p-4 rounded-lg transition-all duration-300 relative ${
              isFocused === 'destination' ? 'bg-[#efeded]/60' : 'hover:bg-gray-100/50'
            }`}
          >
            <label
              htmlFor="destination"
              className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 font-sans"
            >
              Destination
            </label>
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-[#775a19]" />
              <input
                id="destination"
                type="text"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                onFocus={() => setIsFocused('destination')}
                onBlur={() => setIsFocused(null)}
                placeholder="Find a property or city"
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-serif text-lg md:text-xl placeholder:text-gray-300 italic text-black font-semibold placeholder:font-light outline-none"
              />
            </div>
          </div>

          <div className="w-px bg-gray-200 hidden md:block my-4 shrink-0" />

          <button
            type="button"
            onClick={() => {
              const newD = prompt('Change Sanctuary Dates:', dates);
              if (newD) setDates(newD);
            }}
            className="flex-1 p-4 rounded-lg hover:bg-gray-100/50 transition-all duration-300 cursor-pointer text-left bg-transparent border-none"
          >
            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 font-sans">
              Check-In / Out
            </span>
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-[#775a19]" />
              <div className="flex flex-col text-left">
                <span className="font-serif text-lg md:text-xl font-medium text-black">
                  {dates}
                </span>
              </div>
            </div>
          </button>

          <div className="w-px bg-gray-200 hidden md:block my-4 shrink-0" />

          <div className="flex-1 p-4 rounded-lg hover:bg-gray-100/50 transition-all duration-300 cursor-pointer">
            <label
              htmlFor="guests"
              className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 font-sans"
            >
              Guests Number
            </label>
            <div className="flex items-center gap-3">
              <Users size={18} className="text-[#775a19]" />
              <div className="flex flex-col text-left w-full">
                <select
                  id="guests"
                  className="bg-transparent border-none p-0 text-sm font-sans focus:ring-0 outline-none w-full text-black font-semibold appearance-none"
                >
                  <option value="2">2 Adults, 0 Children</option>
                  <option value="1">1 Adult, 0 Children</option>
                  <option value="3">3 Adults, 0 Children</option>
                  <option value="4">4 Adults, 2 Children</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="bg-black hover:bg-[#775a19] text-white px-10 py-5 text-xs font-semibold uppercase tracking-widest transition-all cursor-pointer font-sans duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <Search size={14} />
            <span>Search</span>
          </button>
        </form>

        <div className="mt-12 flex flex-wrap justify-center items-center gap-6 sm:gap-8 bg-white/40 backdrop-blur-sm py-4 px-8 rounded-full border border-gray-100/60 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest font-sans">
            Suggested retreats:
          </span>
          <button
            type="button"
            onClick={() => handleSuggestedClick('Provence')}
            className="text-xs font-sans text-gray-700 hover:text-[#775a19] tracking-wider transition-colors underline decoration-gray-200 hover:decoration-black underline-offset-8 cursor-pointer border-none bg-transparent"
          >
            Estates in Provence
          </button>
          <button
            type="button"
            onClick={() => handleSuggestedClick('Loire Valley')}
            className="text-xs font-sans text-gray-700 hover:text-[#775a19] tracking-wider transition-colors underline decoration-gray-200 hover:decoration-black underline-offset-8 cursor-pointer border-none bg-transparent"
          >
            Loire Valley Manor
          </button>
          <button
            type="button"
            onClick={() => handleSuggestedClick('Kyoto')}
            className="text-xs font-sans text-gray-700 hover:text-[#775a19] tracking-wider transition-colors underline decoration-gray-200 hover:decoration-black underline-offset-8 cursor-pointer border-none bg-transparent"
          >
            Kyoto Serenity Garden
          </button>
        </div>
      </div>

      {/* Secondary Loyalty Feature Ribbon */}
      <div className="relative z-10 w-full bg-white/60 border-t border-gray-100 py-10">
        <div className="max-w-[1440px] mx-auto px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#efeded]/60 rounded-full flex items-center justify-center text-[#775a19] shrink-0">
              <ShieldCheck size={20} className="stroke-1" />
            </div>
            <div>
              <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                Safe Travels
              </h4>
              <p className="text-xs text-gray-500 font-sans mt-0.5">
                Rigorous global sanitation &amp; clean-spaces certification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#efeded]/60 rounded-full flex items-center justify-center text-[#775a19] shrink-0">
              <BadgePercent size={20} className="stroke-1" />
            </div>
            <div>
              <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                Best Rate Guarantee
              </h4>
              <p className="text-xs text-gray-500 font-sans mt-0.5">
                Guaranteed lowest pricing when logging into the Circle.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#efeded]/60 rounded-full flex items-center justify-center text-[#775a19] shrink-0">
              <Gift size={20} className="stroke-1" />
            </div>
            <div>
              <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                Member Rewards
              </h4>
              <p className="text-xs text-gray-500 font-sans mt-0.5">
                Points on every reservation with premium global partners.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
