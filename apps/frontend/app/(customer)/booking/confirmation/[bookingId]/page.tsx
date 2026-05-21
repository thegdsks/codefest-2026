'use client';

import { Check, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { useSurfaceEligibility } from '@/lib/hotel/use-surface-eligibility';

export default function BookingConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : '';
  const { isLoggedIn } = useCustomer();
  const { surfaces, refetch } = useSurfaceEligibility();
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  // Refresh surfaces so BOOKING_CONFIRMATION_OFFER can flip to SHOWN after the
  // backend writes recentBookingAt. Show the modal ~3s after landing.
  useEffect(() => {
    const refreshTimer = setTimeout(() => {
      refetch();
    }, 1500);
    const showTimer = setTimeout(() => {
      setOfferVisible(true);
    }, 3000);
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(showTimer);
    };
  }, [refetch]);

  const bookingOffer = surfaces['BOOKING_CONFIRMATION_OFFER'];
  const shouldShowOffer = offerVisible && !offerDismissed && bookingOffer?.state === 'SHOWN';

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <section className="pt-20 pb-12 px-8 max-w-[680px] mx-auto text-center animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-8">
          <Check size={36} className="text-emerald-700" />
        </div>

        <span className="text-xs font-semibold text-[#775a19] uppercase tracking-[0.25em] mb-3 block">
          Booking Confirmed
        </span>
        <h1 className="font-serif text-3xl md:text-5xl text-black font-light leading-tight mb-4">
          Your Stay is Reserved
        </h1>
        <p className="font-sans text-sm text-gray-500 max-w-xl mx-auto leading-relaxed">
          Confirmation details have been sent to your registered email. Your concierge will reach
          out within 24 hours to confirm arrival preferences.
        </p>

        <div className="mt-10 bg-white border border-gray-200 p-8 text-left silk-shadow">
          <div className="space-y-4 font-sans text-xs">
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-400 font-bold uppercase tracking-widest">
                Confirmation ID
              </span>
              <span className="font-mono font-bold text-black">{bookingId}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-3">
              <span className="text-gray-400 font-bold uppercase tracking-widest">Status</span>
              <span className="text-emerald-700 font-bold uppercase">Confirmed</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={() => router.push('/profile')}
            className="bg-black hover:bg-[#775a19] text-white px-10 py-4 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 silk-shadow cursor-pointer"
          >
            View My Profile
          </button>
          <button
            type="button"
            onClick={() => router.push('/search')}
            className="border border-gray-300 hover:border-black text-gray-700 hover:text-black px-10 py-4 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 cursor-pointer"
          >
            Browse Properties
          </button>
        </div>
      </section>

      {/* BOOKING_CONFIRMATION_OFFER modal */}
      {shouldShowOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white max-w-md w-full mx-4 p-8 silk-shadow relative">
            <button
              type="button"
              onClick={() => setOfferDismissed(true)}
              className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors cursor-pointer border-none bg-transparent p-1"
              aria-label="Dismiss offer"
            >
              <X size={18} />
            </button>

            <span className="text-[10px] font-bold text-[#775a19] uppercase tracking-[0.25em] block mb-3">
              {bookingOffer?.copy?.headline ?? 'Exclusive Offer'}
            </span>
            <h2 className="font-serif text-2xl text-black font-light mb-4">
              {bookingOffer?.copy?.body ?? 'A special reward for your booking.'}
            </h2>
            <p className="text-xs text-gray-500 font-sans leading-relaxed mb-6">
              This offer was selected based on your membership status and booking activity. Claim it
              now before your stay begins.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOfferDismissed(true)}
                className="flex-1 bg-black hover:bg-[#775a19] text-white py-3.5 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 cursor-pointer"
              >
                Claim Offer
              </button>
              <button
                type="button"
                onClick={() => setOfferDismissed(true)}
                className="text-xs text-gray-400 hover:text-black font-sans tracking-widest uppercase cursor-pointer border-none bg-transparent"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
