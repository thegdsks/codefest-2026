'use client';

import { attachAbandonedFlowStepDetector } from '@signal-force/engagement-sdk';
import { Award, Calculator, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import BlockBanner from '@/components/hotel/BlockBanner';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { animateCounter } from '@/lib/hotel/animate-counter';
import { DEMO_RECIPIENT_ID, saveTransferDraft, transferPoints } from '@/lib/hotel/customer-api';
import { PARTNERS } from '@/lib/hotel/data';
import { TEST_PERSONAS } from '@/lib/hotel/test-personas';
import { useLoyaltySummary } from '@/lib/hotel/use-loyalty-summary';
import { useRequireAuth } from '@/lib/hotel/use-require-auth';
import { useTrackedEngagement } from '@/lib/hotel/use-tracked-engagement';

interface BlockData {
  decisionId: string;
}

function newClientRef() {
  return `LH-${Math.floor(100000 + Math.random() * 900000)}-X`;
}

export default function TransferScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { trackEvent } = useTrackedEngagement();
  const routeListenersRef = useRef<Set<(path: string) => void>>(new Set());
  const { user, session, deductPoints, setTransferDetails } = useCustomer();
  const isAuthenticated = useRequireAuth();
  const { data: loyaltyData } = useLoyaltySummary();
  const [partnerKey, setPartnerKey] = useState('aeroglobal');
  const [displayBalance, setDisplayBalance] = useState<number | null>(null);
  const [escrowState, setEscrowState] = useState(false);
  const cancelAnimRef = useRef<(() => void) | null>(null);

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

  // Resolve partner account ID from the current persona (keyed by userId).
  // Falls back to blank so the user can type their own account number.
  const personaAccountId = session
    ? (TEST_PERSONAS.find((p) => p.userId === session.userId)?.partnerAccountId ?? '')
    : '';

  const [accountNumber, setAccountNumber] = useState('');
  const [pointsInput, setPointsInput] = useState('5000');
  const [triggerSecurityDemo, setTriggerSecurityDemo] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockData, setBlockData] = useState<BlockData | null>(null);

  // Pre-fill account number once persona resolves (runs once when session is available).
  useEffect(() => {
    if (personaAccountId && !accountNumber) {
      setAccountNumber(personaAccountId);
    }
  }, [personaAccountId, accountNumber]);

  // Debounced draft persistence so TRANSFER_ABANDON_OFFER surface fires when
  // the user fills the form and leaves without submitting.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistDraft = useCallback(
    (amount: string, recipientId: string) => {
      if (!session) return;
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        saveTransferDraft(
          session.token,
          session.userId,
          parsed,
          recipientId || DEMO_RECIPIENT_ID
        ).catch(() => {});
      }, 800);
    },
    [session]
  );

  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  // Sync display balance to loyalty data on load (no animation on initial set)
  useEffect(() => {
    if (loyaltyData && displayBalance === null) {
      setDisplayBalance(loyaltyData.currentPoints);
    }
  }, [loyaltyData, displayBalance]);

  // Source-of-truth balance: always read from the loyalty-summary response.
  // user.points is not reliable - the dashboard endpoint does not return pointsBalance.
  // When loyaltyData has not loaded yet, use undefined so overBalance stays false
  // and the form does not flash a spurious "insufficient balance" error on render.
  const currentPoints = loyaltyData?.currentPoints ?? user.points;

  const selectedPartner = PARTNERS.find((p) => p.id === partnerKey) ?? PARTNERS[0];
  const partnerReceived = Math.floor(Number(pointsInput) / selectedPartner.sfcPerPoint) || 0;

  const handleTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cost = Number(pointsInput);
    if (Number.isNaN(cost) || cost < 1000) {
      setError('Minimum transfer is 1,000 SFC.');
      return;
    }
    const confirmedBalance = currentPoints ?? 0;
    if (cost > confirmedBalance) {
      if (confirmedBalance === 0) {
        setError(
          `Your balance hasn't loaded yet or is 0 SFC. Try refreshing, or log in as a demo user with points (e.g. user001).`
        );
      } else {
        setError(
          `You have ${confirmedBalance.toLocaleString()} SFC. Reduce the amount or earn more by booking.`
        );
      }
      return;
    }
    if (!session) {
      router.replace('/login');
      return;
    }

    setError(null);
    const partnerName = selectedPartner.name;
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });

    setProcessing(true);
    const res = await transferPoints(session.token, session.userId, cost, triggerSecurityDemo);

    if (res.error) {
      if (res.error.code === 'TRANSFER_BLOCKED') {
        const decisionId =
          (res.error as { code: string; message: string; details?: { decisionId?: string } })
            .details?.decisionId ?? '';
        setBlockData({ decisionId });
        setProcessing(false);
        return;
      }
      setError(res.error.message || 'Transfer could not be processed. Please try again.');
      setProcessing(false);
      return;
    }

    const data = res.data;

    // Engine returned MFA_REQUIRED: store challenge id and navigate.
    if ('action' in data && data.action === 'MFA') {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'sf_transfer_challenge',
          JSON.stringify({
            challengeId: data.challengeId,
            partnerName,
            amount: cost,
            date,
          })
        );
      }
      router.push('/transfer/mfa');
      return;
    }

    setTransferDetails({
      id: 'transferId' in data ? data.transferId : newClientRef(),
      partner: partnerName,
      amount: cost,
      date,
    });

    // Clear the draft so TRANSFER_ABANDON_OFFER flips to COMPLETED.
    if (session) saveTransferDraft(session.token, session.userId, 0, '').catch(() => {});

    if ('status' in data && data.status === 'SUCCESS') {
      deductPoints(cost);
      // Animate the loyalty balance counter down before navigating
      if (displayBalance !== null) {
        cancelAnimRef.current?.();
        cancelAnimRef.current = animateCounter(
          displayBalance,
          Math.max(0, displayBalance - cost),
          600,
          setDisplayBalance,
          () => router.push('/transfer/success')
        );
      } else {
        router.push('/transfer/success');
      }
    } else {
      // UNDER_REVIEW or other non-SUCCESS: show escrow pill, do not decrement
      setEscrowState(true);
      router.push('/transfer/review');
    }
  };

  if (!isAuthenticated) return null;

  const amountNum = Number(pointsInput);
  // Only flag overBalance once we have a confirmed balance. While loyaltyData is
  // loading, currentPoints is undefined and this stays false so the form stays
  // usable and no spurious "0 SFC" error appears.
  const overBalance =
    currentPoints !== undefined && Number.isFinite(amountNum) && amountNum > currentPoints;
  const balanceLoading = !loyaltyData && isAuthenticated;

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black">
      <section className="pt-16 pb-8 px-8 max-w-[1440px] mx-auto text-center">
        <span className="text-xs font-semibold text-[#775a19] uppercase tracking-[0.25em] mb-3 block">
          Points transfer
        </span>
        <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl text-black font-light leading-tight mb-4">
          Transfer Your Points
        </h1>
        <p className="font-sans text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Convert SFC to airline miles, cruise points, or hotel partner balances. Live rates below.
        </p>
      </section>

      {/* Loyalty balance bar */}
      {loyaltyData && (
        <section className="px-8 max-w-[1000px] mx-auto mb-6">
          <div className="bg-white border border-gray-250/20 silk-shadow p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Award size={18} className="text-[#775a19] shrink-0" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-sans block">
                  {loyaltyData.currentTier} Balance
                </span>
                <span className="font-mono text-lg font-bold text-black leading-none">
                  {(displayBalance ?? loyaltyData.currentPoints).toLocaleString()} SFC
                </span>
              </div>
            </div>
            {escrowState && (
              <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm animate-fade-in">
                Held in Escrow
              </span>
            )}
          </div>
        </section>
      )}

      {blockData && (
        <section className="px-8 max-w-[1000px] mx-auto mb-6">
          <BlockBanner
            title="Transfer blocked by fraud protection"
            description="Our security system flagged this transfer as high risk. No points were moved. If you believe this is an error, contact our support team with the reference ID below."
            referenceId={blockData.decisionId || undefined}
            actions={[
              {
                label: 'Contact support',
                variant: 'primary',
                onClick: () => {
                  const subject = encodeURIComponent('Transfer blocked - reference inquiry');
                  const body = encodeURIComponent(
                    `Reference: ${blockData.decisionId || 'unknown'}`
                  );
                  window.location.href = `mailto:support@signal-force.demo?subject=${subject}&body=${body}`;
                },
              },
              {
                label: 'View activity history',
                variant: 'secondary',
                onClick: () => router.push('/profile?tab=activity'),
              },
              {
                label: 'Try a smaller amount',
                variant: 'secondary',
                onClick: () => {
                  setBlockData(null);
                  setPointsInput('1000');
                },
              },
            ]}
          />
        </section>
      )}

      <section className="px-8 max-w-[1000px] mx-auto">
        <div className="bg-white p-8 md:p-12 silk-shadow border border-gray-250/20 text-left">
          <form onSubmit={handleTransferSubmit} className="space-y-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 border-y border-gray-100 bg-[#fbf9f8] my-4 text-center sm:text-left">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans">
                Conversion rate
              </span>
              <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 font-sans font-medium">
                <span className="text-lg font-bold text-black font-mono">
                  {selectedPartner.sfcPerPoint.toLocaleString()}
                </span>
                <span className="text-gray-400">SFC</span>
                <RefreshCw size={14} className="text-[#775a19] shrink-0 inline duration-1000" />
                <span className="text-lg font-bold text-[#775a19] font-mono">1</span>
                <span className="text-[#775a19]">Partner Point ({selectedPartner.ratio})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1.5">
                <label
                  htmlFor="partnerKey"
                  className="text-[10px] uppercase font-bold tracking-widest text-[#775a19] block font-sans"
                >
                  Partner
                </label>
                <p className="text-[10px] text-gray-400 font-sans -mt-1">
                  Pick where you want to redeem
                </p>
                <div className="relative">
                  <select
                    id="partnerKey"
                    value={partnerKey}
                    onChange={(e) => setPartnerKey(e.target.value)}
                    className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] focus:outline-none transition-colors py-3 px-0 font-sans text-sm font-semibold focus:ring-0 outline-none appearance-none pr-10 text-gray-800"
                  >
                    {PARTNERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.ratio})
                      </option>
                    ))}
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
                  onChange={(e) => {
                    setAccountNumber(e.target.value);
                    persistDraft(pointsInput, e.target.value);
                  }}
                  className="w-full bg-transparent border-b-2 border-gray-200 focus:border-[#775a19] transition-colors py-3 px-0 font-sans text-sm focus:ring-0 outline-none text-gray-800 font-bold"
                  placeholder="e.g. AG-4403291"
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
                    {currentPoints !== undefined
                      ? `(Max: ${currentPoints.toLocaleString()} SFC)`
                      : '(Loading balance...)'}
                  </span>
                </label>
                <div className="relative flex items-center">
                  <input
                    id="pointsInput"
                    type="number"
                    min="1000"
                    step="500"
                    value={pointsInput}
                    onChange={(e) => {
                      setPointsInput(e.target.value);
                      persistDraft(e.target.value, accountNumber);
                    }}
                    className={`w-full bg-transparent border-b-2 transition-colors py-3 px-0 font-sans text-sm text-black focus:ring-0 outline-none font-bold ${overBalance ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#775a19]'}`}
                    placeholder="Min. 1,000"
                  />
                  <span className="absolute right-0 text-gray-400 font-sans font-bold text-[10px] tracking-wider uppercase">
                    SFC
                  </span>
                </div>
                {overBalance && currentPoints !== undefined && (
                  <p className="text-red-600 text-[11px] font-sans mt-1">
                    You have {currentPoints.toLocaleString()} SFC. Reduce the amount or earn more by
                    booking.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 block font-sans">
                  You will receive
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
                alt="Coastal balcony view at dusk"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCtURZLP8fxQmLC6BK1d4Nfp_7SX9XP95FW4DOT85uF4kykaG4Yg5Qhk4bCKp5R-rcRoqPvTgiE1ADhLk50mp6K0jfuW7lAwd5p9lxE5Pxk7_QJe6lQP7g5C4QNWT4Z-Qmirr_NWKx3jpY6cgplFkZfhGOU5V2Dn8bET0WA6shmXYYt3Ke_gu25GmNIGAx-Egd8WFrunO1-6Z1iWk6poakj1cvWVvkyZWEDTxFvnm1fJr_7diLgQXuVl2oEhJ2NfyUXUQ2K5c8sYeQ"
                sizes="(max-width: 1000px) 100vw, 1000px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-8 text-white text-left font-sans">
                <h3 className="font-serif text-xl md:text-2xl font-light mb-1.5">
                  Points on the move
                </h3>
                <p className="text-white/80 text-xs max-w-md leading-relaxed">
                  Conversions are validated and settled within 24 hours under bank-grade ledger
                  mechanics.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center pt-6">
              <button
                type="submit"
                disabled={processing || overBalance || balanceLoading}
                className="w-full md:w-auto bg-black hover:bg-[#775a19] text-white px-16 py-4.5 font-sans font-bold text-xs uppercase tracking-widest transition-all duration-300 silk-shadow focus:outline-none cursor-pointer disabled:bg-gray-400"
              >
                {processing
                  ? 'Processing...'
                  : balanceLoading
                    ? 'Loading balance...'
                    : 'Confirm Transfer'}
              </button>
              <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest font-sans">
                Transfer orders are final. Partner conversions cannot be reversed.
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
