'use client';

import { Info, LogOut, MapPin, Menu, Sparkles, Tag, User, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import LoyaltyStatusCard from '@/components/hotel/LoyaltyStatusCard';
import Logo from '@/components/Logo';
import { useLoyaltySummary } from '@/lib/hotel/use-loyalty-summary';
import { useClickOutside } from '@/lib/use-click-outside';
import { useCustomer } from './CustomerProvider';

const PROPERTY_HOME = '/property/paris';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, logout, user } = useCustomer();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const loyaltyRef = useRef<HTMLDivElement>(null);
  useClickOutside(loyaltyRef, () => setLoyaltyOpen(false), loyaltyOpen);
  const { data: loyaltyData } = useLoyaltySummary();

  const go = (path: string) => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    router.push(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    go('/');
  };

  const destinationsActive = pathname === '/search' || pathname === '/results';
  const propertyActive = pathname.startsWith('/property');
  const profileActive = pathname === '/profile' || pathname.startsWith('/transfer');

  return (
    <header className="bg-[#fbf9f8]/90 backdrop-blur-xl border-b border-gray-250/30 sticky top-0 z-50 transition-all duration-300">
      {/* Desktop Navigation */}
      <nav className="hidden md:flex justify-between items-center w-full px-8 py-4 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-12">
          <button
            type="button"
            onClick={() => go('/')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity focus:outline-none cursor-pointer bg-transparent border-none"
          >
            <Logo size={28} tone="light" />
            <span className="font-serif text-2xl font-semibold tracking-tight text-black">
              Signal Force
            </span>
          </button>

          <div className="flex items-center space-x-10">
            <button
              type="button"
              onClick={() => go('/search')}
              className={`font-sans font-medium text-xs uppercase tracking-widest transition-colors duration-300 cursor-pointer bg-transparent border-none ${
                destinationsActive
                  ? 'text-[#775a19] font-bold border-b-2 border-[#775a19] pb-0.5'
                  : 'text-gray-600 hover:text-[#775a19]'
              }`}
            >
              Destinations
            </button>
            <button
              type="button"
              onClick={() => go('/')}
              className="font-sans font-medium text-xs uppercase tracking-widest text-gray-600 hover:text-[#775a19] transition-colors duration-300 cursor-pointer bg-transparent border-none"
            >
              Offers
            </button>
            <button
              type="button"
              onClick={() => go(PROPERTY_HOME)}
              className={`font-sans font-medium text-xs uppercase tracking-widest transition-colors duration-300 cursor-pointer bg-transparent border-none ${
                propertyActive
                  ? 'text-[#775a19] font-bold border-b-2 border-[#775a19] pb-0.5'
                  : 'text-gray-600 hover:text-[#775a19]'
              }`}
            >
              Curation Suite
            </button>
            <button
              type="button"
              onClick={() => go('/')}
              className="font-sans font-medium text-xs uppercase tracking-widest text-gray-600 hover:text-[#775a19] transition-colors duration-300 cursor-pointer bg-transparent border-none"
            >
              About
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <div className="flex items-center gap-4">
              {/* Loyalty pill + dropdown */}
              {loyaltyData && (
                <div ref={loyaltyRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setLoyaltyOpen((v) => !v)}
                    className="flex items-center gap-1.5 bg-[#ffdea5] text-[#261900] px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider hover:bg-[#f5c96a] transition-colors cursor-pointer border-none rounded-sm"
                    aria-expanded={loyaltyOpen}
                    aria-haspopup="true"
                  >
                    {loyaltyData.currentTier}
                    <span className="text-[#775a19]">|</span>
                    {loyaltyData.currentPoints.toLocaleString()} pts
                  </button>
                  {loyaltyOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50">
                      <LoyaltyStatusCard compact />
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => go('/profile')}
                className={`flex items-center gap-2 font-sans font-bold text-xs uppercase tracking-widest transition-colors duration-300 cursor-pointer bg-transparent border-none ${
                  profileActive
                    ? 'text-black border-b-2 border-[#775a19] pb-1 font-bold'
                    : 'text-gray-700 hover:text-black'
                }`}
              >
                <User size={15} className="text-[#775a19]" />
                <span className="hidden lg:inline text-[10px]">{user.name?.split(' ')[0]}</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                title="Log Out"
                className="text-gray-400 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-all duration-200 cursor-pointer bg-transparent border-none"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => go('/login')}
              className="font-sans font-bold text-xs uppercase tracking-widest text-black border-b-2 border-[#775a19] hover:text-[#775a19] pb-1 transition-all duration-300 cursor-pointer bg-transparent"
            >
              LOG IN
            </button>
          )}

          <button
            type="button"
            onClick={() => go(isLoggedIn ? '/profile' : '/search')}
            className="bg-black hover:bg-[#775a19] text-white text-xs font-sans font-semibold tracking-widest px-6 py-3 uppercase transition-all duration-300 hover:shadow-md cursor-pointer active:scale-95 border-none"
          >
            {isLoggedIn ? 'My Stays' : 'Book Now'}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Header */}
      <nav className="flex md:hidden justify-between items-center w-full h-20 px-6">
        <div className="flex items-center justify-start w-12">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open Menu"
            className="text-black hover:opacity-75 transition-opacity duration-300 flex items-center justify-center cursor-pointer border-none bg-transparent"
          >
            <Menu size={28} />
          </button>
        </div>

        <div className="flex-grow flex justify-center">
          <button
            type="button"
            onClick={() => go('/')}
            className="flex items-center gap-2 select-none cursor-pointer border-none bg-transparent"
          >
            <Logo size={24} tone="light" />
            <span className="font-serif text-2xl font-semibold tracking-tight text-black">
              Signal Force
            </span>
          </button>
        </div>

        <div className="flex items-center justify-end w-12">
          <button
            type="button"
            onClick={() => go(isLoggedIn ? '/profile' : '/login')}
            aria-label="User Profile"
            className="text-black hover:opacity-75 transition-opacity duration-300 flex items-center justify-center cursor-pointer border-none bg-transparent"
          >
            <User size={28} fill={isLoggedIn ? 'currentColor' : 'none'} />
          </button>
        </div>
      </nav>

      {/* Full-Screen Drawer Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-[#fbf9f8] flex flex-col w-full h-full min-h-screen px-6 pb-6 pt-0 overflow-y-auto duration-300 animate-fade-in transition-all">
          <header className="flex justify-between items-center w-full h-20">
            <div className="flex items-center justify-start w-12">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close menu"
                className="text-black hover:opacity-75 transition-opacity duration-300 flex items-center justify-center cursor-pointer border-none bg-transparent focus:outline-none"
              >
                <X size={28} />
              </button>
            </div>

            <div className="flex-grow flex justify-center">
              <button
                type="button"
                onClick={() => go('/')}
                className="flex items-center gap-2 select-none cursor-pointer border-none bg-transparent focus:outline-none"
              >
                <Logo size={24} tone="light" />
                <span className="font-serif text-2xl font-semibold tracking-tight text-black">
                  Signal Force
                </span>
              </button>
            </div>

            <div className="flex items-center justify-end w-12" />
          </header>

          <div className="flex flex-col mt-4 space-y-4">
            <button
              type="button"
              onClick={() => go('/search')}
              className="group flex items-center justify-between py-3 font-serif text-2xl text-black hover:text-[#775a19] transition-colors duration-200 border-none bg-transparent w-full text-left cursor-pointer"
            >
              <span>Destinations</span>
              <MapPin
                size={24}
                className="text-[#775a19] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
            </button>

            <button
              type="button"
              onClick={() => go('/')}
              className="group flex items-center justify-between py-3 font-serif text-2xl text-black hover:text-[#775a19] transition-colors duration-200 border-none bg-transparent w-full text-left cursor-pointer"
            >
              <span>Offers</span>
              <Tag
                size={24}
                className="text-[#775a19] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
            </button>

            <button
              type="button"
              onClick={() => go(PROPERTY_HOME)}
              className="group flex items-center justify-between py-3 font-serif text-2xl text-black hover:text-[#775a19] transition-colors duration-200 border-none bg-transparent w-full text-left cursor-pointer"
            >
              <span>Wellness</span>
              <Sparkles
                size={24}
                className="text-[#775a19] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
            </button>

            <button
              type="button"
              onClick={() => go('/')}
              className="group flex items-center justify-between py-3 font-serif text-2xl text-black hover:text-[#775a19] transition-colors duration-200 border-none bg-transparent w-full text-left cursor-pointer"
            >
              <span>About</span>
              <Info
                size={24}
                className="text-[#775a19] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
            </button>
          </div>

          <div className="mt-auto pb-12 border-t border-gray-200/50 pt-6">
            {isLoggedIn ? (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => go('/profile')}
                  className="flex items-center gap-4 text-black hover:text-[#775a19] transition-all duration-300 active:scale-[0.99] text-left border-none bg-transparent cursor-pointer"
                >
                  <User size={24} className="text-[#775a19]" />
                  <div className="flex flex-col">
                    <span className="font-sans text-xs uppercase tracking-widest font-bold">
                      Profile Summary
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono font-bold mt-0.5">
                      {user.points?.toLocaleString()} SFC Points
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-4 text-red-700 hover:text-red-950 transition-all duration-300 active:scale-[0.99] text-left border-none bg-transparent cursor-pointer pt-2"
                >
                  <LogOut size={20} />
                  <span className="font-sans text-xs uppercase tracking-widest font-bold">
                    Log Out
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => go('/login')}
                className="flex items-center gap-4 text-black hover:text-[#775a19] transition-all duration-300 active:scale-[0.99] text-left border-none bg-transparent cursor-pointer"
              >
                <User className="text-[#775a19]" size={24} />
                <span className="font-sans text-xs uppercase tracking-widest font-bold">
                  Log In
                </span>
              </button>
            )}

            <div className="flex flex-col gap-3 mt-6 text-left">
              <p className="font-sans text-[10px] leading-relaxed text-gray-400 uppercase tracking-wider">
                © 2026 Signal Force Hotel Collection. Exemplary hospitality since 1922.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
