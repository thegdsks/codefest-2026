'use client';

import { Lock, ShieldAlert, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';

export default function SecurityReviewScreen() {
  const router = useRouter();
  const { transferDetails, deductPoints } = useCustomer();
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!transferDetails) router.replace('/transfer');
  }, [transferDetails, router]);

  const pointsAmount = transferDetails?.amount || 15000;

  const handleVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setShowVerifyModal(false);
      deductPoints(pointsAmount);
      router.push('/transfer/success');
    }, 1500);
  };

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black relative flex flex-col justify-center">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-[#efeded]/60 -z-10 opacity-50 translate-x-1/4 skew-x-12" />

      <main className="max-w-[1000px] w-full mx-auto px-8 py-16 grid grid-cols-1 md:grid-cols-12 gap-12 items-center text-left">
        <div className="md:col-span-5 relative">
          <div className="aspect-[4/5] overflow-hidden silk-shadow relative bg-black">
            <Image
              fill
              className="object-cover opacity-90 transition-transform duration-1000 transform hover:scale-105"
              alt="Security Lobby twilight"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuACyZdUvTFHCsE0dhhtmTPhXSHyM2VlD5lzjyZOEdZ2zCvFGRalzfWgwOgNWtzrc11ODBnY6hDnDwt8LEke74cplHTVuJ6I-IlZoYYsEdJGoztIkpmnJgNMujI0hFZYITK2JEE9YepFKMkwARyFHi7c7YSNJy8Q8pguzqRF_wYePPP2YM3SFpjMS33WzvA4o4PcPqcung_xuxV3LW7-BjS0cOn0LUx6Myl_pWz1qqPSZyjKH43p0HQZXCfJXg6Nxspjbym6uZKchhE"
              sizes="(max-width: 768px) 100vw, 42vw"
            />
          </div>
          <div className="absolute -bottom-6 -right-6 bg-white p-6 md:p-8 border border-gray-150/20 silk-shadow">
            <div className="flex flex-col items-center">
              <ShieldAlert size={28} className="text-[#775a19]" />
              <div className="w-8 h-[1.5px] bg-[#ffdea5] mt-3" />
            </div>
          </div>
        </div>

        <div className="md:col-span-7 md:pl-8 flex flex-col gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#fed488]/20 text-[#775a19] font-sans text-[10px] font-bold tracking-widest uppercase rounded">
              <span className="w-2 h-2 rounded-full bg-[#775a19] animate-ping" />
              <span>Security Audits</span>
            </div>
            <h1 className="font-serif text-3xl md:text-5xl font-semibold text-black leading-tight">
              Review Required
            </h1>
          </div>

          <div className="space-y-6">
            <p className="font-sans text-xs sm:text-sm text-gray-500 leading-relaxed">
              We have detected unusual activity or an exceptionally large points deduction (
              {pointsAmount.toLocaleString()} SFC) representing a significant status change. For
              your capital protection, this transfer request has been temporarily paused.
            </p>
            <div className="p-5 bg-white border-l-2 border-[#775a19] shadow-sm">
              <p className="font-sans text-xs text-gray-700 leading-relaxed">
                Please verify your personal gold account identity passcode to unlock and authorize
                this points conversion instantly, or contact our private concierge desk.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="button"
              onClick={() => setShowVerifyModal(true)}
              className="bg-black hover:bg-[#775a19] text-white px-10 py-4.5 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-md hover:shadow-lg active:scale-95 font-sans"
            >
              Verify Identity
            </button>
            <button
              type="button"
              className="border border-black text-black px-10 py-4.5 text-xs font-bold uppercase tracking-widest hover:bg-gray-100 transition-colors cursor-pointer font-sans"
            >
              Contact Desk
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 text-gray-400 font-sans text-[11px] font-semibold uppercase tracking-wider">
            <Lock size={12} className="text-[#775a19]" />
            <span>Referral ID: SF-9928-SEC</span>
          </div>
        </div>
      </main>

      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white p-8 max-w-md w-full border border-gray-250/20 silk-shadow relative font-sans text-black">
            <button
              type="button"
              onClick={() => setShowVerifyModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-black cursor-pointer border-none bg-transparent p-1"
            >
              <X size={18} />
            </button>

            <h3 className="font-serif text-2xl font-semibold mb-4 text-left leading-tight">
              Sovereign Verification
            </h3>
            <p className="text-xs text-gray-500 text-left leading-relaxed mb-6">
              Enter secure transaction security passcode{' '}
              <span className="font-mono bg-amber-50 px-1 py-0.5 rounded font-semibold text-[#775a19]">
                7755
              </span>{' '}
              sent to your gold registration device to authenticate and dispatch{' '}
              {pointsAmount.toLocaleString()} SFC points.
            </p>

            <form onSubmit={handleVerifySubmit} className="space-y-6 text-left">
              <div className="space-y-1.5 focus-within:text-black">
                <label
                  htmlFor="verifyCode"
                  className="text-[9px] uppercase font-bold tracking-widest text-[#775a19]"
                >
                  Authentication Code
                </label>
                <input
                  id="verifyCode"
                  type="text"
                  required
                  placeholder="e.g. 7755"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] py-2 text-base font-bold font-mono tracking-widest focus:ring-0 outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-8 py-3 bg-black hover:bg-[#775a19] text-white text-xs font-semibold uppercase tracking-wider cursor-pointer font-serif disabled:bg-gray-400"
                >
                  {isVerifying ? 'PROVING...' : 'Authorize release'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
