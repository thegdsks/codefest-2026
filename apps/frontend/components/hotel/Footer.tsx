'use client';

import { ArrowRight, Globe, Share2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 5000);
      setEmail('');
    }
  };

  return (
    <footer className="bg-white border-t border-gray-100 py-20 mt-auto">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-12 mb-16">
          <div className="lg:col-span-2">
            <div className="font-serif text-2xl font-bold tracking-tight text-black mb-6">
              Signal Force
            </div>
            <p className="text-gray-500 font-sans text-sm leading-relaxed max-w-xs">
              Crafting unforgettable memories through timeless architecture and unparalleled service
              across the globe's most iconic destinations.
            </p>
            <div className="flex gap-4 mt-8">
              <button
                type="button"
                className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-black hover:bg-black hover:text-white transition-all cursor-pointer"
                title="Share Collection"
              >
                <Share2 size={16} />
              </button>
              <button
                type="button"
                className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-black hover:bg-black hover:text-white transition-all cursor-pointer"
                title="Global Portal"
              >
                <Globe size={16} />
              </button>
            </div>
          </div>

          <div>
            <h4 className="font-sans text-[11px] text-black font-semibold uppercase tracking-[0.2em] mb-6">
              Discover
            </h4>
            <ul className="space-y-4 text-xs font-sans text-gray-500">
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Destinations
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Our Story
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Sustainability
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  The Journal
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-sans text-[11px] text-black font-semibold uppercase tracking-[0.2em] mb-6">
              Support
            </h4>
            <ul className="space-y-4 text-xs font-sans text-gray-500">
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Contact Us
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  FAQs
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Accessibility
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-black transition-colors cursor-pointer">
                  Gift Cards
                </button>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-sans text-[11px] text-black font-semibold uppercase tracking-[0.2em] mb-6">
              Newsletter
            </h4>
            <p className="text-gray-400 font-sans text-[11px] uppercase tracking-widest mb-6">
              RESERVE YOUR PLACE IN OUR WORLD.
            </p>

            {subscribed ? (
              <div className="bg-[#fbf9f8] p-4 border-l-2 border-[#775a19] text-[#775a19] text-xs font-sans animate-fade-in">
                Thank you. Your place is reserved in our exclusive circle. Expect our upcoming
                season journal.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex border-b border-gray-200 pb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="YOUR EMAIL ADDRESS"
                  required
                  className="bg-transparent border-none w-full text-xs tracking-widest focus:ring-0 placeholder:text-gray-300 outline-none p-0 text-gray-800"
                />
                <button
                  type="submit"
                  className="text-black hover:text-[#775a19] transition-colors cursor-pointer p-1"
                >
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[11px] text-gray-400 uppercase tracking-widest font-sans">
            © 2026 Signal Force Hotel Collection. Exemplary hospitality since 1922.
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 font-sans">
            <button
              type="button"
              className="text-[11px] text-gray-400 hover:text-black transition-colors uppercase tracking-widest cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              className="text-[11px] text-gray-400 hover:text-black transition-colors uppercase tracking-widest cursor-pointer"
            >
              Terms of Service
            </button>
            <button
              type="button"
              className="text-[11px] text-gray-400 hover:text-black transition-colors uppercase tracking-widest cursor-pointer"
            >
              Careers
            </button>
            <button
              type="button"
              className="text-[11px] text-gray-400 hover:text-black transition-colors uppercase tracking-widest cursor-pointer"
            >
              Press Room
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
