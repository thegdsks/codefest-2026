'use client';

import { Star } from 'lucide-react';
import type { PropertyConfig } from '@/lib/hotel/property-data';

interface PropertyReviewsProps {
  config: PropertyConfig;
}

function Stars({ size }: { size: number }) {
  return (
    <div className="flex gap-0.5 text-[#775a19]">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill="currentColor" />
      ))}
    </div>
  );
}

export default function PropertyReviews({ config }: PropertyReviewsProps) {
  return (
    <section className="bg-[#efeded]/40 border-t border-gray-200/50 py-20 px-8 -mx-8">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-4 text-left">
          <div>
            <span className="text-[#775a19] text-xs font-semibold uppercase tracking-widest mb-3 block">
              Curation Feedback
            </span>
            <h2 className="font-serif text-3xl font-semibold text-black mb-4">
              Guest Perspectives
            </h2>
            <div className="flex items-center gap-3">
              <Stars size={13} />
              <span className="text-xs font-bold font-sans text-gray-900">
                {config.rating} / 5.0 based on {config.reviewsCount} records
              </span>
            </div>
          </div>

          <button
            type="button"
            className="border border-black hover:bg-black hover:text-white px-8 py-3.5 text-xs font-semibold uppercase tracking-widest transition-colors cursor-pointer font-sans"
          >
            Journal a Review
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-8 border border-gray-250/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <Stars size={11} />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-sans">
                  AUG 2025
                </span>
              </div>
              <h4 className="font-serif text-lg font-semibold text-black mb-3 italic">
                "A Provencal Dream"
              </h4>
              <p className="font-sans text-xs text-gray-500 leading-relaxed mb-8">
                From the precise moments we arrived at the custom-scented olive and stone vestibule,
                the concierges treated us like royalty. Our balcony views transcended typical
                vacations.
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
              <div className="w-8 h-8 rounded-full bg-[#ffdea5] text-[#261900] flex items-center justify-center font-bold text-xs">
                EW
              </div>
              <span className="text-[10px] font-bold text-gray-900 uppercase tracking-widest font-sans">
                Eleanor W. - London
              </span>
            </div>
          </div>

          <div className="bg-white p-8 border border-gray-250/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <Stars size={11} />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-sans">
                  JUL 2025
                </span>
              </div>
              <h4 className="font-serif text-lg font-semibold text-black mb-3 italic">
                "Absolute Sanctum"
              </h4>
              <p className="font-sans text-xs text-gray-500 leading-relaxed mb-8">
                {config.name} maintains a sovereign standard of high boutique luxury. The deep
                heated pools and spa treatments was an ethereal highlight after a busy day of town
                exploration.
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
              <div className="w-8 h-8 rounded-full bg-[#d6e3ff] text-[#0d1c32] flex items-center justify-center font-bold text-xs">
                MK
              </div>
              <span className="text-[10px] font-bold text-gray-900 uppercase tracking-widest font-sans">
                Marcus K. - New York
              </span>
            </div>
          </div>

          <div className="bg-white p-8 border border-gray-250/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <Stars size={11} />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-sans">
                  JUN 2025
                </span>
              </div>
              <h4 className="font-serif text-lg font-semibold text-black mb-3 italic">
                "Sovereign Excellence"
              </h4>
              <p className="font-sans text-xs text-gray-500 leading-relaxed mb-8">
                Beautifully curated 18th-century chateau coupled with deep physical wellness paths.
                The gastronomical evening dinner felt like a transcendental performance.
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
              <div className="w-8 h-8 rounded-full bg-[#fed488] text-[#261900] flex items-center justify-center font-bold text-xs">
                SA
              </div>
              <span className="text-[10px] font-bold text-gray-900 uppercase tracking-widest font-sans">
                Sophie A. - Tokyo
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
