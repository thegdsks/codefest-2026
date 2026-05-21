'use client';

import { ArrowLeft, ArrowRight, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { confirmTransferMfa } from '@/lib/hotel/customer-api';

// Backend static-mode fallback OTP (CFG.mfaOtp default). Prefilled so the
// judges-without-a-phone demo path works when MFA_MODE=static.
const DEMO_OTP = '123456';

interface StoredChallenge {
  challengeId: string;
  partnerName: string;
  amount: number;
  date: string;
}

export default function TransferMfaScreen() {
  const router = useRouter();
  const { session, setTransferDetails, deductPoints } = useCustomer();
  const [challenge, setChallenge] = useState<StoredChallenge | null>(null);
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setCode(DEMO_OTP.split(''));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('sf_transfer_challenge');
    if (!raw) {
      router.replace('/transfer');
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StoredChallenge;
      setChallenge(parsed);
    } catch {
      sessionStorage.removeItem('sf_transfer_challenge');
      router.replace('/transfer');
    }
  }, [router]);

  useEffect(() => {
    if (!session && !done) {
      router.replace('/login');
    }
  }, [session, done, router]);

  const handleChange = (index: number, value: string) => {
    if (Number.isNaN(Number(value))) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedText)) return;
    const newCode = Array(6).fill('');
    pastedText.split('').forEach((char, idx) => {
      newCode[idx] = char;
    });
    setCode(newCode);
    inputsRef.current[Math.min(pastedText.length, 5)]?.focus();
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge || !session) return;
    setVerifying(true);
    setError(null);

    const res = await confirmTransferMfa(session.token, challenge.challengeId, code.join(''));

    if (res.error) {
      setError(
        res.error.code === 'OTP_INVALID'
          ? 'That verification code was not accepted. Please try again.'
          : res.error.code === 'MFA_CHALLENGE_INVALID'
            ? 'This challenge has expired. Please start the transfer again.'
            : res.error.message || 'Verification failed. Please try again.'
      );
      setVerifying(false);
      return;
    }

    sessionStorage.removeItem('sf_transfer_challenge');
    setDone(true);

    setTransferDetails({
      id: res.data.transferId,
      partner: challenge.partnerName,
      amount: challenge.amount,
      date: challenge.date,
    });
    deductPoints(challenge.amount);
    router.push('/transfer/success');
  };

  if (!challenge) return null;

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center p-4 sm:p-8 overflow-hidden font-sans text-black">
      <div className="absolute -top-30 -right-30 w-96 h-96 rounded-full bg-[#ffdea5]/25 blur-3xl animate-pulse" />
      <div className="absolute -bottom-30 -left-30 w-96 h-96 rounded-full bg-[#d6e3ff]/20 blur-3xl animate-pulse" />

      <div className="relative z-10 w-full max-w-[520px] bg-white silk-shadow p-6 sm:p-12 md:p-16 border border-gray-250/30 text-center">
        <div className="mb-8 text-center select-none">
          <h1 className="font-serif text-3xl font-semibold tracking-wide text-black">
            Signal Force
          </h1>
          <div className="w-8 h-[1px] bg-[#775a19] mx-auto mt-4" />
        </div>

        <div className="mb-8 p-4 bg-[#fff9f3] border border-[#e5a03b]/30 text-left flex gap-3.5 items-start rounded-sm">
          <ShieldAlert size={20} className="text-[#a16c1a] shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <h3 className="font-sans font-bold text-[10px] uppercase tracking-[0.15em] text-[#775a19]">
              Transfer Risk Protocol Triggered
            </h3>
            <p className="font-sans text-xs text-[#261900]/95 leading-relaxed">
              Our fraud engine flagged a high-value transfer from an unrecognized device. To
              authorize a transfer of{' '}
              <span className="font-semibold">{challenge.amount.toLocaleString()} SFC</span> to{' '}
              {challenge.partnerName}, verify your identity.
            </p>
          </div>
        </div>

        <div className="mb-10 text-center">
          <h2 className="font-serif text-2xl font-medium text-black mb-3">Two-Step Verification</h2>
          <p className="font-sans text-[#775a19] text-xs max-w-[340px] mx-auto leading-relaxed">
            Enter the 6-digit confirmation code associated with your gold profile. (Demo code{' '}
            <span className="font-mono bg-amber-50 px-1 py-0.5 rounded text-xs font-semibold">
              {DEMO_OTP}
            </span>
            )
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="flex justify-center gap-1.5 sm:gap-3">
            {code.map((digit, idx) => (
              <input
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP inputs
                key={idx}
                ref={(el) => {
                  inputsRef.current[idx] = el;
                }}
                type="text"
                maxLength={1}
                value={digit}
                onPaste={handlePaste}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-10 h-10 sm:w-12 sm:h-12 text-center text-lg sm:text-xl font-mono font-semibold border-b-2 border-gray-200 focus:border-[#775a19] focus:ring-0 bg-transparent transition-all outline-none p-0 text-[#261900]"
                required
              />
            ))}
          </div>

          {error && (
            <div className="bg-[#fff4f4] border border-red-200 text-red-700 text-xs font-sans px-4 py-3 rounded-sm animate-fade-in">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-6 pt-6">
            <button
              type="submit"
              disabled={verifying}
              className="w-full bg-black hover:bg-[#775a19] text-white py-4.5 px-8 font-sans font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 hover:shadow-lg active:scale-[0.98] border-b-2 border-transparent hover:border-[#ffdea5] disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {verifying ? 'AUTHORIZING TRANSFER...' : 'Authorize Transfer'}
            </button>

            <button
              type="button"
              onClick={() => setCode(DEMO_OTP.split(''))}
              className="group flex items-center gap-1.5 font-sans font-bold text-xs uppercase tracking-widest text-gray-500 hover:text-black transition-colors border-none bg-transparent cursor-pointer"
            >
              <span>Resend Code</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => router.push('/transfer')}
              className="group flex items-center gap-1.5 font-sans text-xs text-gray-400 hover:text-black transition-colors border-none bg-transparent cursor-pointer"
            >
              <ArrowLeft size={13} className="group-hover:-translate-x-1 transition-transform" />
              <span>Cancel and go back</span>
            </button>
          </div>
        </form>

        <div className="mt-12 flex justify-center items-center gap-4 text-gray-300 select-none">
          <div className="h-[1px] w-8 bg-gray-200" />
          <span className="text-[10px] font-sans uppercase tracking-[0.2em] italic font-light">
            Since 1922
          </span>
          <div className="h-[1px] w-8 bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
