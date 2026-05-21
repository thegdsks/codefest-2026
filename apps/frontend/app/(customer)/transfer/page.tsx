'use client';

import { attachAbandonedFlowStepDetector } from '@signal-force/engagement-sdk';
import { Calculator, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { transferPoints } from '@/lib/hotel/customer-api';
import { PARTNERS } from '@/lib/hotel/data';
import { getForceHighRiskTransfer, setForceHighRiskTransfer } from '@/lib/hotel/demo-context';
import { useTrackedEngagement } from '@/lib/hotel/use-tracked-engagement';

function newClientRef() {
  return `LH-${Math.floor(100000 + Math.random() * 900000)}-X`;
}

export default function TransferScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { trackEvent } = useTrackedEngagement();
  const routeListenersRef = useRef<Set<(path: string) => void>>(new Set());
  const { user, session, isLoggedIn, deductPoints, setTransferDetails } = useCustomer();
  const [partnerKey, setPartnerKey] = useState('aeroglobal');

  // Notify abandoned-flow listeners when the pathname changes.
  useEffect(() => {
    for (const listener of routeListenersRef.current) {
      listener(pathname);
    }
  }, [pathname]);

  // Abandoned flow step: user fills in transfer form then leaves without submitting
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
  const [accountNumber, setAccountNumber] = useState('8832948210');
  const [pointsInput, setPointsInput] = useState('15000');
  const [triggerSecurityDemo, setTriggerSecurityDemo] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  const partnerReceived = Math.floor(Number(pointsInput) / 3) || 0;

  const handleTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cost = Number(pointsInput);
    if (Number.isNaN(cost) || cost < 1000) {
      setError('Points transfer minimum requirement is 1,000 SFC.');
      return;
    }
    if (cost > (user.points || 0) || !user.points) {
      setError(
        `Insufficient balance. Your account currently holds ${user.points?.toLocaleString() || 0} SFC points.`
      );
      return;
    }
    if (!session) {
      router.replace('/login');
      return;
    }

    setError(null);
    const partnerName = PARTNERS.find((p) => p.id === partnerKey)?.name || 'Global Voyager Rewards';
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });

    // Client-side simulation: force the step-up review screen without a real call.
    const shouldForceReview = triggerSecurityDemo || getForceHighRiskTransfer();
    setForceHighRiskTransfer(false);
    if (shouldForceReview) {
      setTransferDetails({
        id: newClientRef(),
        partner: partnerName,
        amount: cost,
        date,
      });
      router.push('/transfer/review');
      return;
    }

    setProcessing(true);
    const res = await transferPoints(session.token, session.userId, cost);

    if (res.error) {
      setError(
        res.error.code === 'TRANSFER_BLOCKED'
          ? 'This transfer was blocked by a high fraud-risk decision.'
          : res.error.message || 'The transfer could not be processed. Please try again.'
      );
      setProcessing(false);
      return;
    }

    setTransferDetails({
      id: res.data.transferId,
      partner: partnerName,
      amount: cost,
      date,
    });

    if (res.data.status === 'SUCCESS') {
      deductPoints(cost);
      router.push('/transfer/success');
    } else {
      router.push('/transfer/review');
    }
  };

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <section className="pt-16 pb-8 px-8 max-w-[1440px] mx-auto text-center">
        <span className="text-xs font-semibold text-[#775a19] uppercase tracking-[0.25em] mb-3 block">
          Curated conversions
        </span>
        <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl text-black font-light leading-tight mb-4">
          Transfer Your Points
        </h1>
        <p className="font-sans text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Convert your Signal Force holdings into premier partner rewards. Your luxury loyalty
          transcends borders, unlocking flights and marine voyages with global travel entities.
        </p>
      </section>

      <section className="px-8 max-w-[1000px] mx-auto">
        <div className="bg-white p-8 md:p-12 silk-shadow border border-gray-250/20 text-left">
          <form onSubmit={handleTransferSubmit} className="space-y-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 border-y border-gray-100 bg-[#fbf9f8] my-4 text-center sm:text-left">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans">
                Active Conversion Formula
              </span>
              <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 font-sans font-medium">
                <span className="text-lg font-bold text-black font-mono">1,000</span>
                <span className="text-gray-400">SFC</span>
                <RefreshCw size={14} className="text-[#775a19] shrink-0 inline duration-1000" />
                <span className="text-lg font-bold text-[#775a19] font-mono">333</span>
                <span className="text-[#775a19]">Partner Points</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1.5">
                <label
                  htmlFor="partnerKey"
                  className="text-[10px] uppercase font-bold tracking-widest text-[#775a19] block font-sans"
                >
                  Choose Loyalty Partner
                </label>
                <div className="relative">
                  <select
                    id="partnerKey"
                    value={partnerKey}
                    onChange={(e) => setPartnerKey(e.target.value)}
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] focus:outline-none transition-colors py-3 px-0 font-sans text-sm font-semibold focus:ring-0 outline-none appearance-none pr-10 text-gray-800"
                  >
                    <option value="aeroglobal">AeroGlobal Flight Plan</option>
                    <option value="skyhigh">SkyHigh Rewards Club</option>
                    <option value="elite">Elite Voyages Elite</option>
                  </select>
                  <Calculator
                    size={14}
                    className="absolute right-2 top-4 text-gray-400 pointer-events-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="accountNumber"
                  className="text-[10px] uppercase font-bold tracking-widest text-[#775a19] block font-sans"
                >
                  Partner Account ID
                </label>
                <input
                  id="accountNumber"
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] transition-colors py-3 px-0 font-sans text-sm focus:ring-0 outline-none text-gray-800 font-bold"
                  placeholder="e.g. 1042841920"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1.5">
                <label
                  htmlFor="pointsInput"
                  className="text-[10px] uppercase font-bold tracking-widest text-black block font-sans leading-none pb-1"
                >
                  SFC Points to Transfer{' '}
                  <span className="text-[#775a19] font-mono text-[10px] text-right font-semibold">
                    (Max: {user.points?.toLocaleString() || 0} SFC)
                  </span>
                </label>
                <div className="relative flex items-center">
                  <input
                    id="pointsInput"
                    type="number"
                    min="1000"
                    step="500"
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] transition-colors py-3 px-0 font-sans text-sm text-black focus:ring-0 outline-none font-bold"
                    placeholder="Min. 1,000"
                  />
                  <span className="absolute right-0 text-gray-400 font-sans font-bold text-[10px] tracking-wider uppercase">
                    SFC
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 block font-sans">
                  Partner Points Received
                </span>
                <div className="relative flex items-center bg-gray-50/40 p-1 select-none">
                  <input
                    type="text"
                    disabled
                    value={partnerReceived.toLocaleString()}
                    className="w-full bg-transparent border-none py-2 px-0 font-sans text-sm focus:ring-0 outline-none text-[#775a19] font-bold cursor-not-allowed"
                  />
                  <span className="absolute right-2 text-[#775a19] font-sans font-bold text-[10px] tracking-wider uppercase">
                    PTS
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#fed488]/10 border-l-4 border-[#775a19] p-5 font-sans">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={triggerSecurityDemo}
                  onChange={(e) => setTriggerSecurityDemo(e.target.checked)}
                  className="w-4.5 h-4.5 border-gray-300 rounded text-[#775a19] focus:ring-0 accent-[#775a19] cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold text-black block mb-0.5">
                    Simulate Point Transfer Audit for Security Review
                  </span>
                  <span className="text-gray-500 block">
                    The decision engine flags unusual transfer activity for a multi-factor safety
                    check. Check this to force the step-up review for the demo.
                  </span>
                </div>
              </label>
            </div>

            {error && (
              <div className="bg-[#fff4f4] border border-red-200 text-red-700 text-xs font-sans px-4 py-3 rounded-sm animate-fade-in">
                {error}
              </div>
            )}

            <div className="relative h-[240px] w-full overflow-hidden rounded-lg group">
              <Image
                fill
                className="object-cover grayscale-[20%] brightness-[75%] transition-transform duration-1000 group-hover:scale-105"
                alt="Luxury balcony mediterranean views"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCtURZLP8fxQmLC6BK1d4Nfp_7SX9XP95FW4DOT85uF4kykaG4Yg5Qhk4bCKp5R-rcRoqPvTgiE1ADhLk50mp6K0jfuW7lAwd5p9lxE5Pxk7_QJe6lQP7g5C4QNWT4Z-Qmirr_NWKx3jpY6cgplFkZfhGOU5V2Dn8bET0WA6shmXYYt3Ke_gu25GmNIGAx-Egd8WFrunO1-6Z1iWk6poakj1cvWVvkyZWEDTxFvnm1fJr_7diLgQXuVl2oEhJ2NfyUXUQ2K5c8sYeQ"
                sizes="(max-width: 1000px) 100vw, 1000px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-8 text-white text-left font-sans">
                <h3 className="font-serif text-xl md:text-2xl font-light mb-1.5">
                  Exclusivity Elevated
                </h3>
                <p className="text-white/80 text-xs max-w-md leading-relaxed">
                  Your conversion is validated and processed under bank-grade secure ledger
                  mechanics within 24 business hours.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center pt-6">
              <button
                type="submit"
                disabled={processing}
                className="w-full md:w-auto bg-black hover:bg-[#775a19] text-white px-16 py-4.5 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 silk-shadow focus:outline-none cursor-pointer disabled:bg-gray-400"
              >
                {processing ? 'ESTABLISHING SECURE SIGNALS...' : 'Confirm Points Conversion'}
              </button>
              <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest font-sans">
                Transfer orders are absolute. Partner conversions cannot be reversed.
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
