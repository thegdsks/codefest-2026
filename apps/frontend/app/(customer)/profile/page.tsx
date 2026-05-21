'use client';

import {
  ArrowRight,
  Award,
  Download,
  Mail,
  RefreshCw,
  Sliders,
  Sparkles,
  UserCheck,
  Utensils,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { PARTNERS } from '@/lib/hotel/data';

function formatPhone(code?: string, number?: string) {
  if (!number || number.trim() === '') return '—';
  const cleaned = number.replace(/\D/g, '');
  if (cleaned.length === 10) {
    const formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    return code ? `${code} ${formatted}` : formatted;
  }
  return code && number ? `${code} ${number}` : number;
}

const COMM_CHANNELS = ['Email', 'SMS/Text Message', 'Postal Mail'];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, pastStays, isLoggedIn } = useCustomer();

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  const coreFields = [
    user.country,
    user.zipCode,
    user.addressLine1,
    user.city,
    user.stateProv,
    user.email,
    user.mobilePhone,
    user.homePhone,
    user.businessPhone,
    user.dobMonth && user.dobDay ? `${user.dobMonth}/${user.dobDay}` : '',
    user.gender,
  ];

  const accommodationFields = [
    user.preferences?.floor,
    user.preferences?.pillow,
    user.preferences?.turndown,
    user.roomType,
    user.bedType,
    user.importantOption,
  ];

  const diningFields = [
    user.preferences?.breakfast,
    user.preferences?.allergies && user.preferences.allergies.length > 0 ? 'yes' : '',
    user.foodPreferences && user.foodPreferences.length > 0 ? 'yes' : '',
    user.beveragePreferences && user.beveragePreferences.length > 0 ? 'yes' : '',
    user.alcoholPreferences && user.alcoholPreferences.length > 0 ? 'yes' : '',
  ];

  const allCompletenessFields = [
    ...coreFields,
    ...accommodationFields,
    ...diningFields,
    user.roomAmenities,
    user.communicationPreferences,
  ];
  const filledCount = allCompletenessFields.filter((f) => {
    if (!f) return false;
    if (Array.isArray(f)) return f.length > 0;
    if (typeof f === 'string') return f.trim() !== '';
    return true;
  }).length;
  const completenessPercentage = Math.round((filledCount / allCompletenessFields.length) * 100);

  const nextTierName =
    user.status === 'Gold' ? 'Platinum' : user.status === 'Platinum' ? 'Diamond' : 'Prestige Elite';
  const pointsAway = user.nextTierPoints || 8000;
  const isMobileMissing = !user.mobilePhone || user.mobilePhone.trim() === '';
  const isBusinessPhoneMissing = !user.businessPhone || user.businessPhone.trim() === '';

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <main className="max-w-[1440px] mx-auto px-8 py-16">
        <header className="mb-16 border-l-4 border-[#775a19] pl-8 text-left animate-fade-in">
          <p className="font-sans text-xs font-bold text-[#775a19] mb-2 uppercase tracking-[0.25em]">
            Welcome Back
          </p>
          <h1 className="font-serif text-3xl md:text-5xl font-semibold text-black mb-1">
            {user.name}
          </h1>
          <p className="text-gray-500 font-sans text-sm font-medium tracking-wide block">
            Signal Force {user.status} Status Member since 2018
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <aside className="lg:col-span-4 space-y-8">
            <div className="bg-white p-8 border border-gray-250/20 silk-shadow">
              <div className="flex justify-between items-start mb-8">
                <span className="bg-[#ffdea5] text-[#261900] px-3.5 py-1 text-[10px] font-sans font-bold uppercase tracking-wider">
                  {user.status} Status
                </span>
                <Award className="text-[#775a19] w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-6 text-left">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-sans">
                    Available Balance
                  </span>
                  <p
                    data-signal="points_balance"
                    className="font-serif text-3xl font-semibold text-black mt-1"
                  >
                    {user.points.toLocaleString()} SFC
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] font-sans block mb-2">
                    Next Tier: {nextTierName} Status ({pointsAway.toLocaleString()} pts to go)
                  </span>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#775a19] rounded-full transition-all duration-1000"
                      style={{ width: '80%' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#efeded]/40 p-8 border border-gray-200/50">
              <h3 className="text-xs text-black font-sans font-semibold uppercase tracking-widest mb-6 border-b border-gray-300 pb-2 flex items-center gap-2">
                <UserCheck size={14} className="text-[#775a19]" />
                Profile Details
              </h3>

              <div className="mb-6 border-b border-gray-300/40 pb-4 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-[#775a19] uppercase tracking-wider font-sans">
                    Registry Completeness
                  </span>
                  <span className="text-xs font-bold text-black font-mono">
                    {completenessPercentage}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all duration-1000"
                    style={{ width: `${completenessPercentage}%` }}
                  />
                </div>
                {completenessPercentage < 100 ? (
                  <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                    Provide all sanctuary registry details to maximize your exclusive preferences.
                  </p>
                ) : (
                  <p className="text-[10px] text-emerald-700 font-bold mt-2 leading-relaxed uppercase tracking-wider flex items-center gap-1">
                    Profile Fully Documented
                  </p>
                )}
              </div>

              {completenessPercentage < 100 && (
                <div className="mb-6 p-4 bg-[#775a19]/5 border-l-4 border-[#775a19] text-left relative overflow-hidden animate-fade-in shadow-sm">
                  <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#775a19]/10 rounded-full blur-xl pointer-events-none" />

                  <div className="flex items-center gap-1.5 text-[#775a19] mb-2">
                    <Sparkles size={13} className="shrink-0 animate-pulse" />
                    <span className="text-[9px] font-bold tracking-widest uppercase font-sans">
                      Catalyst Elevate Benefit
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-900 font-sans leading-relaxed">
                    As a valued{' '}
                    <span className="font-bold text-[#775a19]">{user.status} Status</span> member,
                    you are only{' '}
                    <span className="font-bold text-[#775a19]">
                      {pointsAway.toLocaleString()} SFC
                    </span>{' '}
                    points away from{' '}
                    <span className="font-bold text-[#775a19]">{nextTierName}</span>. To help
                    fast-track progress, update your details to increase your{' '}
                    <span className="font-bold text-black">{completenessPercentage}%</span> Registry
                    Completeness.
                    {isMobileMissing || isBusinessPhoneMissing ? (
                      <>
                        {' '}
                        Suggest adding your{' '}
                        <span className="font-bold text-[#775a19] underline underline-offset-2">
                          {isMobileMissing ? 'Mobile Phone' : 'Business Phone'} Number
                        </span>{' '}
                        to unlock exclusive priority access rewards and secure communication
                        channels.
                      </>
                    ) : (
                      <>
                        {' '}
                        Populate your remaining preferences to claim your profile completion bonus.
                      </>
                    )}
                  </p>

                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => router.push('/profile/edit')}
                      className="text-[9px] text-[#775a19] font-bold uppercase tracking-wider hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                    >
                      <span>Update Registry Now</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4 text-left font-sans text-xs">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-gray-400">
                    Email Sanctuary
                  </span>
                  <span className="text-gray-900 font-medium text-sm mt-0.5">{user.email}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-gray-400">Home Phone</span>
                  <span className="text-gray-900 font-medium text-sm mt-0.5">
                    {formatPhone(user.homeCode, user.homePhone)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase text-gray-400">Mobile Phone</span>
                  <span className="text-gray-900 font-medium text-sm mt-0.5">
                    {formatPhone(user.mobileCode, user.mobilePhone)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/profile/edit')}
                  className="text-[#775a19] text-xs font-bold font-sans uppercase hover:underline tracking-wider pt-4 select-none cursor-pointer border-none bg-transparent flex items-center gap-1"
                >
                  <span>Edit Registry Profile</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </aside>

          {/* Right Column */}
          <section className="lg:col-span-8 space-y-12">
            <section>
              <div className="flex justify-between items-end mb-6">
                <h2 className="font-serif text-2xl font-semibold text-black">
                  Upcoming Sanctuaries
                </h2>
                <button
                  type="button"
                  className="text-xs font-sans text-gray-500 hover:text-black tracking-widest font-bold uppercase"
                >
                  View All Stays
                </button>
              </div>

              <div className="group relative overflow-hidden bg-white border border-gray-250/25 silk-shadow">
                <div className="grid grid-cols-1 md:grid-cols-5 md:h-64">
                  <div className="md:col-span-2 overflow-hidden h-48 md:h-auto bg-black relative">
                    <img
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 group-hover:opacity-90"
                      alt="Upcoming Hotel Palais"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuC8VScKEhVD-iNfuJs0WFbkigqDbN21akJRhr2NizOyocMNALG9NVuXOR0lRu8d1IhOCcR4pc2wBDKHABt33yTPJTqfXOqgEU3GvMmPS-Y1IQCEHz4U__DTW5Tv3KtOHWNPNfvd2zMZkoRrMSSszed28WYedUmC4D4QfPPE0EHD1nrNt9wrlE2fDzu_KfTui4fRF8Pot7ProByJhLLdwg2iD_Alv7S5tUBqdF6E2GX9bGUkjjmZPWLyFfiPisDOwI1tpVrISUO-N9Y"
                    />
                  </div>
                  <div className="md:col-span-3 p-8 flex flex-col justify-between text-left">
                    <div>
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <span className="bg-black text-white px-2 py-0.5 text-[9px] font-sans uppercase tracking-widest font-semibold">
                          Paris, France
                        </span>
                        <span className="text-[10px] text-[#775a19] font-semibold font-sans">
                          Confirmation: #VH-9921
                        </span>
                      </div>
                      <h3 className="font-serif text-xl font-semibold text-black mb-2">
                        Hôtel Thomas de Paris
                      </h3>
                      <div className="flex gap-8 mb-4 font-sans text-xs">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-gray-400">
                            Check-in
                          </span>
                          <p className="text-gray-900 font-semibold mt-0.5">Dec 14, 2026</p>
                        </div>
                        <div className="border-l border-gray-200 pl-8">
                          <span className="text-[9px] uppercase font-bold text-gray-400">
                            Check-out
                          </span>
                          <p className="text-gray-900 font-semibold mt-0.5">Dec 19, 2026</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => router.push('/property/paris')}
                        className="bg-black hover:bg-[#775a19] text-white px-6 py-3 text-xs font-sans font-semibold uppercase tracking-widest flex-1 cursor-pointer transition-colors"
                      >
                        Manage Booking
                      </button>
                      <button
                        type="button"
                        className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 text-xs font-sans font-semibold uppercase tracking-widest cursor-pointer transition-colors"
                      >
                        Suite details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="pt-4 text-left">
              <header className="mb-8">
                <p className="font-sans text-[#775a19] text-xs font-semibold uppercase tracking-[0.2em] mb-2">
                  Exchange Signal Force points at robust conversion ratios
                </p>
                <h2 className="font-serif text-2xl font-semibold text-black mb-1">
                  Elevate Your Rewards
                </h2>
                <p className="text-gray-500 font-sans text-sm leading-relaxed max-w-2xl">
                  Seamlessly transfer SFC points to pre-verified premium partner catalogs. Explore
                  AeroGlobal flight networks, luxury cruiser voyages, and international sanctuary
                  packages.
                </p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-sans">
                {PARTNERS.map((partner) => (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => router.push('/transfer')}
                    className="bg-white border border-gray-200/50 p-6 shadow-sm hover:border-[#775a19] transition-all duration-300 group text-left cursor-pointer focus:outline-none focus:border-[#775a19]"
                  >
                    <div className="w-12 h-12 bg-gray-50 rounded group-hover:bg-[#ffdea5] flex items-center justify-center text-[#775a19] mb-5 transition-all duration-300">
                      <RefreshCw size={18} className="group-hover:rotate-45 transition-transform" />
                    </div>
                    <h4 className="font-serif text-lg font-semibold text-black mb-1">
                      {partner.name}
                    </h4>
                    <p className="font-sans text-[11px] font-bold text-[#775a19] uppercase tracking-wider block">
                      {partner.ratio} conversion
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section className="text-left font-sans text-xs">
              <h2 className="font-serif text-2xl font-semibold text-black mb-8">
                Travel Preferences
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 border border-gray-250/20 silk-shadow">
                  <div className="flex items-center gap-3 mb-6 border-b border-gray-150/15 pb-3">
                    <Sliders size={16} className="text-[#775a19]" />
                    <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                      Accommodation choices
                    </h4>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Estate Floor</span>
                      <span className="font-bold text-black">
                        {user.preferences?.floor || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Pillow selections</span>
                      <span className="font-bold text-black">
                        {user.preferences?.pillow || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Turndown timing</span>
                      <span className="font-bold text-black">
                        {user.preferences?.turndown || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Room Type</span>
                      <span className="font-bold text-black capitalize">
                        {user.roomType || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Bed Type</span>
                      <span className="font-bold text-black capitalize">
                        {user.bedType || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5 border-b border-gray-100">
                      <span className="text-gray-400 font-medium">Priority element</span>
                      <span className="font-bold text-[#775a19] capitalize">
                        {user.importantOption || 'Not specified'}
                      </span>
                    </li>
                    <li className="flex justify-between items-center py-1.5">
                      <span className="text-gray-400 font-medium">Room Amenities</span>
                      <span className="font-bold text-black font-sans text-right">
                        {user.roomAmenities && user.roomAmenities.length > 0
                          ? user.roomAmenities.join(', ')
                          : 'None specified'}
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="bg-white p-6 border border-gray-250/20 silk-shadow">
                  <div className="flex items-center gap-3 mb-6 border-b border-gray-150/15 pb-3">
                    <Utensils size={16} className="text-[#775a19]" />
                    <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                      Dining &amp; Dietary preferences
                    </h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1 font-sans">
                        Dietary Preferences
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {user.preferences?.allergies && user.preferences.allergies.length > 0 ? (
                          user.preferences.allergies.map((item) => (
                            <span
                              key={item}
                              className="bg-red-50 text-red-800 border border-red-100 px-2.5 py-1 font-bold text-[10px] rounded font-sans leading-none uppercase"
                            >
                              {item}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 italic">None declared</span>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-gray-150/10 pt-2 text-left">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block font-sans">
                        Breakfast scheduling
                      </span>
                      <p className="text-gray-900 font-semibold mt-0.5">
                        {user.preferences?.breakfast || 'Not scheduled'}
                      </p>
                    </div>

                    {user.foodPreferences && user.foodPreferences.length > 0 && (
                      <div className="border-t border-gray-150/10 pt-3 text-left">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 font-sans">
                          Savoring Favorites
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {user.foodPreferences.map((food) => (
                            <span
                              key={food}
                              className="bg-gray-100 text-gray-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded"
                            >
                              {food}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {user.beveragePreferences && user.beveragePreferences.length > 0 && (
                      <div className="border-t border-gray-150/10 pt-3 text-left">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 font-sans">
                          Preferred Beverages
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {user.beveragePreferences.map((bev) => (
                            <span
                              key={bev}
                              className="bg-gray-100 text-gray-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded"
                            >
                              {bev}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {user.alcoholPreferences && user.alcoholPreferences.length > 0 && (
                      <div className="border-t border-gray-150/10 pt-3 text-left">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 font-sans">
                          Beer, Wine &amp; Spirits
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {user.alcoholPreferences.map((alc) => (
                            <span
                              key={alc}
                              className="bg-[#ffdea5]/40 text-[#543b0c] border border-[#ffdea5]/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded"
                            >
                              {alc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 bg-white p-6 border border-gray-250/20 silk-shadow">
                <div className="flex items-center gap-3 mb-4 border-b border-gray-150/15 pb-3">
                  <Mail size={16} className="text-[#775a19]" />
                  <h4 className="text-xs uppercase font-bold tracking-widest text-[#775a19] font-sans">
                    Communications
                  </h4>
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 max-w-4xl font-sans leading-relaxed">
                    Personalized promotional offers on Signal Force and Advertising Partners'
                    Platforms, based on activity and information from third parties.
                  </p>
                  <div className="flex flex-wrap gap-6 pt-1">
                    {COMM_CHANNELS.map((channel) => {
                      const isSubscribed = user.communicationPreferences?.includes(channel);
                      return (
                        <div key={channel} className="flex items-center gap-2.5">
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSubscribed
                                ? 'border-black bg-black text-white'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            {isSubscribed && (
                              <svg
                                className="w-2.5 h-2.5 text-white fill-current"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                              </svg>
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isSubscribed ? 'text-gray-950' : 'text-gray-400 italic font-medium'
                            }`}
                          >
                            {channel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <section className="text-left font-sans">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif text-2xl font-semibold text-black">Stay History</h3>
                <span className="text-xs text-gray-400 font-sans tracking-wide">
                  {pastStays.length} Total Registered Journeys
                </span>
              </div>

              <div className="bg-white border border-gray-250/20 silk-shadow overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100 font-sans font-bold">
                      <th className="py-4 px-6 font-bold">Sanctuary Location</th>
                      <th className="py-4 px-6 font-bold">Date Period</th>
                      <th className="py-4 px-6 font-bold">Total Amount</th>
                      <th className="py-4 px-6 font-bold text-center">Invoices</th>
                    </tr>
                  </thead>
                  <tbody className="font-sans text-xs">
                    {pastStays.map((stay) => (
                      <tr
                        key={stay.receiptId}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="py-4 px-6 text-black font-semibold">{stay.destination}</td>
                        <td className="py-4 px-6 text-gray-500">{stay.date}</td>
                        <td className="py-4 px-6 text-black font-mono font-bold">{stay.amount}</td>
                        <td className="py-4 px-6 text-center">
                          <button
                            type="button"
                            className="bg-transparent border-none p-2 text-gray-400 hover:text-[#775a19] cursor-pointer transition-colors focus:outline-none"
                            title="Download invoice statement"
                          >
                            <Download size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
