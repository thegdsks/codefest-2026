'use client';

import {
  attachAbandonedFlowStepDetector,
  attachRageClickDetector,
} from '@signal-force/engagement-sdk';
import Image from 'next/image';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import DynamicOfferCard from '@/components/hotel/DynamicOfferCard';
import PropertyBookingCard from '@/components/hotel/property/PropertyBookingCard';
import PropertyReviews from '@/components/hotel/property/PropertyReviews';
import { getPropertyConfig } from '@/lib/hotel/property-data';
import { useTrackedEngagement } from '@/lib/hotel/use-tracked-engagement';

export default function PropertyScreen() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id ?? 'paris';
  const config = getPropertyConfig(propertyId);
  const { trackEvent } = useTrackedEngagement();
  const pathname = usePathname();
  const routeListenersRef = useRef<Set<(path: string) => void>>(new Set());

  // Notify abandoned-flow listeners when the pathname changes.
  useEffect(() => {
    for (const listener of routeListenersRef.current) {
      listener(pathname);
    }
  }, [pathname]);

  // Rage click: user clicking the booking widget repeatedly in frustration
  useEffect(() => {
    const detach = attachRageClickDetector((signal) => trackEvent(signal));
    return detach;
  }, [trackEvent]);

  // Abandoned flow step: user leaves the property page without booking/transferring
  useEffect(() => {
    const detach = attachAbandonedFlowStepDetector((signal) => trackEvent(signal), {
      onRouteChange: (callback) => {
        routeListenersRef.current.add(callback);
        return () => {
          routeListenersRef.current.delete(callback);
        };
      },
    });
    return detach;
  }, [trackEvent]);

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <main className="max-w-[1440px] mx-auto pt-10 px-8">
        {/* Hero Gallery Section */}
        <section className="mb-16 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 h-[650px] overflow-hidden">
            <div className="col-span-12 md:col-span-8 h-full relative group overflow-hidden bg-black">
              <Image
                fill
                alt={`${config.name} Grand Facade sun-drenched`}
                className="object-cover transition-transform duration-1000 group-hover:scale-105"
                src={config.image}
                sizes="(max-width: 768px) 100vw, 67vw"
              />
              <div className="absolute bottom-10 left-10 text-white z-10 font-sans">
                <span className="bg-[#775a19] px-3.5 py-1.5 font-sans font-semibold text-[10px] text-white tracking-widest uppercase mb-4 inline-block">
                  {config.location}
                </span>
                <h1 className="font-serif text-3xl md:text-5xl drop-shadow-lg font-light tracking-wide text-white">
                  {config.name}
                </h1>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            </div>

            <div className="col-span-12 md:col-span-4 flex flex-col gap-2 h-full">
              <div className="relative h-1/2 overflow-hidden bg-black">
                <Image
                  fill
                  alt="Luxury Suite Bed Interior"
                  className="object-cover grayscale-[10%] hover:grayscale-0 transition-all duration-700"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDR8lxMDibeOs2qZexwFK9h-h3UFPDPzE0QoR6FB_XG5APY6TdLLhFznhjBWig1HyCoTyX4cd8KByY9d0g2r9sYfAERdsK_RUl41r7lKmlTZYCWXgRaExUKSsUvbh5IM4HioHYjWD3aFz32e7leBMnkTKYM4spStqJPB1iLBtnnGDFWZr4zpKAhAV5KbxoBYeGvhXrFsPW1KNz_2gcpxBaLOKnYepErRlhuZou1I9r3UmkG_ctsyJ9JEZyNDs4rh1HQ6Mrdvkdt9Qc"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
              <div className="h-1/2 grid grid-cols-2 gap-2">
                <div className="relative overflow-hidden bg-black">
                  <Image
                    fill
                    alt="Basil rock heated wellness spa pool"
                    className="object-cover hover:scale-105 transition-transform duration-700"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuD-uVjCVmSyci4ewtyNqURD3tGOWykAyylg4YFdUu_iJBQ-Si95MnhvBKEIggQjhwjeMCATcp67SpHAbZnOzX-u2zKre5syz72r3XH-WYw77AWZmN-qyzzFVwSCgh7hOTHGC3cQGgSa4VA1O7jnqDlCRXsyq5hPygoQRFaIUsv268OIZRaGYEumIy_zNRXgIVqdOq002-DhVuA1HScZ7YXuVzvCF9RFj9peHeObqwOIrw0Q8XrTiF0cbvXlXIMALQe1RsJtAPOGSeI"
                    sizes="(max-width: 768px) 50vw, 16vw"
                  />
                </div>
                <div className="relative overflow-hidden bg-black">
                  <Image
                    fill
                    alt="Epicurean Michelin close-up plate"
                    className="object-cover brightness-95"
                    src="/hotel/epicurean-journeys.png"
                    sizes="(max-width: 768px) 50vw, 16vw"
                  />
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/45 hover:bg-black/25 flex flex-col items-center justify-center cursor-pointer transition-all border-none outline-none text-white font-sans"
                  >
                    <span className="text-white text-xs font-semibold tracking-widest underline underline-offset-8">
                      +24 ARCHIVAL VIEWS
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brand Information and Reservation Widget */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start mb-24">
          <div className="lg:col-span-8 lg:pr-10">
            <div className="mb-16 text-left">
              <span className="text-[#775a19] text-xs font-semibold uppercase tracking-[0.2em] mb-3 block">
                Historical Landmark
              </span>
              <h2 className="font-serif text-3xl md:text-5xl mb-8 text-black font-semibold leading-tight">
                An Architectural Masterpiece in {config.location.split(',')[0]}
              </h2>
              <p className="font-sans text-gray-600 text-base leading-relaxed mb-6">
                {config.description}
              </p>
              <p className="font-sans text-gray-600 text-base leading-relaxed">
                {config.secondary_description}
              </p>
            </div>

            <div className="border-t border-gray-200/50 pt-16 text-left">
              <h3 className="font-serif text-2xl font-semibold mb-10 text-black">
                Curated Amenities
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-12 gap-x-8">
                {config.amenities.map((amenity) => (
                  <div key={amenity.title} className="flex gap-6">
                    <div className="w-12 h-12 shrink-0 bg-[#efeded]/60 flex items-center justify-center rounded">
                      <span className="font-serif text-xs font-bold text-[#775a19]">
                        {amenity.key}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-sans font-semibold text-sm text-black mb-1">
                        {amenity.title}
                      </h4>
                      <p className="font-sans text-xs text-gray-500 leading-relaxed">
                        {amenity.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <PropertyBookingCard propertyId={propertyId} config={config} />
        </section>

        <section className="mb-12">
          <DynamicOfferCard />
        </section>

        <PropertyReviews config={config} />
      </main>
    </div>
  );
}
