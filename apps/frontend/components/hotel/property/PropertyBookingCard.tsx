'use client';

import { Award, Check, ChevronDown, Clock, Sparkles, Star } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import type { PropertyConfig } from '@/lib/hotel/property-data';

interface PropertyBookingCardProps {
  propertyId: string;
  config: PropertyConfig;
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')}`;
}

export default function PropertyBookingCard({ propertyId, config }: PropertyBookingCardProps) {
  const { user } = useCustomer();
  const [checkIn, setCheckIn] = useState('2026-10-14');
  const [checkOut, setCheckOut] = useState('2026-10-21');
  const [adults, setAdults] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'checking' | 'confirmed'>('idle');
  const [timeLeft, setTimeLeft] = useState(3 * 3600);
  const [suiteType, setSuiteType] = useState(config.suites[0].name);

  useEffect(() => {
    setSuiteType(config.suites[0].name);
  }, [config]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const suiteRates = useMemo(
    () =>
      config.suites.reduce<Record<string, number>>((acc, s) => {
        acc[s.name] = s.price;
        return acc;
      }, {}),
    [config]
  );

  const handleBook = (e: FormEvent) => {
    e.preventDefault();
    setBookingStatus('checking');
    setTimeout(() => {
      setBookingStatus('confirmed');
    }, 1800);
  };

  const nextTierName =
    user.status === 'Gold' ? 'Platinum' : user.status === 'Platinum' ? 'Diamond' : 'Prestige Elite';
  const pointsAway = user.nextTierPoints || 8000;

  return (
    <aside className="lg:col-span-4 sticky top-28">
      {propertyId === 'bastide-gordes' && (
        <div className="mb-6 p-5 bg-[#775a19]/5 border border-[#775a19]/30 rounded-none relative overflow-hidden text-left animate-fade-in shadow-sm">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#775a19]/10 rounded-full blur-xl pointer-events-none" />

          <div className="flex items-center justify-between mb-3 border-b border-[#775a19]/15 pb-2">
            <div className="flex items-center gap-1.5 text-[#775a19]">
              <Award size={15} className="animate-bounce shrink-0" />
              <span className="text-[10px] font-bold tracking-widest uppercase font-sans">
                Prestige Advance Benefit
              </span>
            </div>
            <div className="flex items-center gap-1 bg-[#775a19] text-white px-2 py-0.5 rounded-[3px] text-[10px] font-bold font-mono">
              <Clock size={11} className="mr-0.5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>

          <p className="text-xs text-gray-900 font-sans leading-relaxed font-semibold">
            You're only{' '}
            <span className="text-[#775a19] font-bold">{pointsAway.toLocaleString()}</span> points
            away from the next level. Book <span className="border-b border-black">4 nights</span>{' '}
            in the next <span className="border-b border-black">3 hours</span> to get{' '}
            <span className="text-[#775a19] font-bold text-sm">double points</span> and reach{' '}
            <span className="text-[#775a19] font-bold">{nextTierName}</span> tier.
          </p>

          <div className="mt-3 flex items-center gap-1 text-[#775a19]/80">
            <Sparkles size={11} />
            <span className="text-[9px] uppercase font-bold tracking-wider font-sans">
              Multiplier Catalyst Active
            </span>
          </div>
        </div>
      )}

      <div className="bg-white p-8 md:p-10 silk-shadow border border-gray-200/40 text-left">
        <div className="flex justify-between items-end mb-8">
          <div>
            <span className="text-[9px] uppercase tracking-widest text-gray-400 block mb-1">
              FROM
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-3xl font-semibold text-black">
                ${(suiteRates[suiteType] || config.price).toLocaleString()}
              </span>
              <span className="text-xs text-gray-500 font-sans">/night</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[#775a19]">
            <Star size={15} fill="currentColor" />
            <span className="text-xs font-bold font-sans">{config.rating}</span>
          </div>
        </div>

        {bookingStatus === 'confirmed' ? (
          <div className="text-center py-8 px-4 bg-emerald-50 border border-emerald-100 rounded text-emerald-800 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-4">
              <Check size={24} />
            </div>
            <h4 className="font-sans font-bold text-base mb-2">Pre-Reservation Secured</h4>
            <p className="text-xs leading-relaxed text-emerald-700/90 mb-6 font-medium">
              We have successfully held your requested suite. A personal concierge has sent
              invitation details to your profile.
            </p>
            <button
              type="button"
              onClick={() => setBookingStatus('idle')}
              className="text-xs uppercase font-semibold text-[#775a19] tracking-widest hover:underline cursor-pointer border-none bg-transparent font-sans"
            >
              Adjust Booking parameters
            </button>
          </div>
        ) : (
          <form onSubmit={handleBook} className="space-y-6">
            <div className="space-y-1.5">
              <label
                htmlFor="suiteType"
                className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block font-sans"
              >
                Accommodation Choice
              </label>
              <div className="relative">
                <select
                  id="suiteType"
                  value={suiteType}
                  onChange={(e) => setSuiteType(e.target.value)}
                  className="w-full bg-transparent border border-gray-200 px-4 py-3 text-xs font-medium font-sans rounded-none focus:outline-none focus:border-black appearance-none text-gray-900"
                >
                  {config.suites.map((suite) => (
                    <option key={suite.name} value={suite.name}>
                      {suite.name} (${suite.price.toLocaleString()}/n)
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-4 text-gray-400 pointer-events-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block font-sans">
                Sanctuary Dates
              </span>
              <div className="grid grid-cols-2 border border-gray-200">
                <div className="p-3">
                  <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-sans">
                    Check-In
                  </span>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-xs font-semibold font-sans focus:ring-0 outline-none text-gray-800"
                  />
                </div>
                <div className="p-3 border-l border-gray-200">
                  <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-sans">
                    Check-Out
                  </span>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full bg-transparent border-none p-0 text-xs font-semibold font-sans focus:ring-0 outline-none text-gray-800"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block font-sans">
                Number of Guests (Max 8 total)
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-sans">
                    Adults
                  </span>
                  <div className="relative">
                    <select
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                      className="w-full bg-transparent border border-gray-200 px-3 py-2.5 text-xs font-semibold font-sans rounded-none focus:outline-none focus:border-black appearance-none text-gray-800"
                    >
                      {Array.from({ length: 8 - childrenCount }, (_, i) => i + 1).map((val) => (
                        <option key={val} value={val}>
                          {val} {val === 1 ? 'Adult' : 'Adults'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2.5 top-3.5 text-gray-400 pointer-events-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-sans">
                    Children
                  </span>
                  <div className="relative">
                    <select
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(Number(e.target.value))}
                      className="w-full bg-transparent border border-gray-200 px-3 py-2.5 text-xs font-semibold font-sans rounded-none focus:outline-none focus:border-black appearance-none text-gray-800"
                    >
                      {Array.from({ length: 9 - adults }, (_, i) => i).map((val) => (
                        <option key={val} value={val}>
                          {val} {val === 1 ? 'Child' : 'Children'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2.5 top-3.5 text-gray-400 pointer-events-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {childrenCount > 0 && (
              <div className="p-4 bg-[#775a19]/5 border border-[#775a19]/30 rounded-none relative overflow-hidden text-left animate-fade-in shadow-sm">
                <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#775a19]/10 rounded-full blur-xl pointer-events-none" />

                <div className="flex items-center gap-1.5 text-[#775a19] mb-1.5">
                  <Sparkles size={13} className="shrink-0 animate-pulse" />
                  <span className="text-[9px] font-bold tracking-widest uppercase font-sans">
                    Family Sanctuary Exclusive
                  </span>
                </div>

                <p className="text-[11px] text-gray-900 font-sans leading-relaxed">
                  Traveling with family? Add a{' '}
                  <span className="font-bold text-[#775a19]">second adjoining chamber</span> to your
                  reservation to obtain{' '}
                  <span className="font-bold text-black">complimentary organic kids' meals</span>{' '}
                  throughout your stay plus{' '}
                  <span className="font-bold text-[#775a19]">5,000 bonus SFC points</span>.
                </p>

                <div className="mt-2.5 flex items-center justify-between border-t border-[#775a19]/15 pt-2">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400">
                    CO-CHAMBER OFFER
                  </span>
                  <button
                    type="button"
                    className="text-[9px] text-[#775a19] font-bold uppercase tracking-wider hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                  >
                    <span>Add Adjoining Room</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={bookingStatus === 'checking'}
              className="w-full bg-black hover:bg-[#775a19] text-white py-4.5 text-xs font-bold uppercase tracking-[0.2em] transition-colors focus:ring-0 cursor-pointer active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed font-sans"
            >
              {bookingStatus === 'checking' ? 'ALIGNING PORTFOLIOS...' : 'CHECK AVAILABILITY'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest font-sans">
            Exclusive prestige booking rates.
          </p>
        </div>
      </div>

      <div className="mt-8 p-6 bg-[#fed488]/10 border-l-4 border-[#775a19] text-left">
        <p className="text-gray-700 text-xs italic font-sans leading-relaxed">
          "The absolute pinnacle of boutique chateau living. The personal butler orchestration and
          valley views are entirely unmatched."
        </p>
        <span className="block mt-2 text-[10px] uppercase font-bold text-[#775a19] tracking-widest font-sans">
          — Condé Nast Traveler
        </span>
      </div>
    </aside>
  );
}
