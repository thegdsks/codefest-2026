'use client';

import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCustomer } from '@/components/hotel/CustomerProvider';

export default function SuccessScreen() {
  const router = useRouter();
  const { transferDetails, user } = useCustomer();

  const txId = transferDetails?.id || 'SF-99284-X821';
  const partnerName = transferDetails?.partner || 'Global Voyager Rewards';
  const pointsAmount = transferDetails?.amount || 15000;
  const txDate = transferDetails?.date || 'Oct 24, 2026';

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center p-8 overflow-hidden font-sans text-black">
      <div className="absolute -top-[10%] -right-[5%] w-[40vw] h-[40vw] bg-[#ffdea5]/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-[10%] -left-[5%] w-[30vw] h-[30vw] bg-[#d6e3ff]/10 rounded-full blur-[100px]" />

      <div className="max-w-[720px] w-full text-center animate-fade-in z-10">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-50 mb-8 relative border border-emerald-100">
          <CheckCircle size={44} className="text-emerald-700 font-extralight" />
        </div>

        <h1 className="font-serif text-3xl md:text-5xl font-semibold mb-6 text-black leading-tight">
          Transfer Successful
        </h1>
        <p className="font-sans text-gray-500 text-sm max-w-[500px] mx-auto leading-relaxed mb-10">
          Your points have been successfully dispatched to{' '}
          <span className="text-black font-semibold">{partnerName}</span>. Please allow 24-48
          business hours for points to align in your partner account.
        </p>

        <div className="bg-white silk-shadow p-8 md:p-12 mb-10 border border-gray-200/50 relative overflow-hidden text-left">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#ffdea5] to-[#775a19]" />

          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans block mb-1">
                Transaction Voucher
              </span>
              <span className="font-mono text-base font-bold text-black tracking-wider">
                {txId}
              </span>
            </div>
            <div className="md:text-right">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans block mb-1">
                SFC Points Transferred
              </span>
              <span className="font-serif text-2xl font-semibold text-[#775a19]">
                {pointsAmount.toLocaleString()} SFC
              </span>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between gap-6 font-sans text-xs">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                Date &amp; Timestamp
              </span>
              <span className="text-gray-800 font-medium font-mono">{txDate} — 14:32 UTC</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
                Confirmation Mail
              </span>
              <span className="text-gray-800 font-medium">{user.email}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={() => router.push('/profile')}
            className="bg-black hover:bg-[#775a19] text-white text-xs font-sans font-bold uppercase tracking-widest px-12 py-4.5 transition-colors cursor-pointer shadow-md hover:shadow-lg active:scale-95 text-center"
          >
            Return to Profile
          </button>

          <button
            type="button"
            className="border border-black hover:bg-gray-50 text-black text-xs font-sans font-bold uppercase tracking-widest px-12 py-4.5 transition-colors cursor-pointer active:scale-95 text-center"
          >
            Request Invoice Folio
          </button>
        </div>
      </div>
    </div>
  );
}
