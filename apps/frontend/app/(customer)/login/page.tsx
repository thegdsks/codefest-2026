'use client';

import {
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import BlockBanner from '@/components/hotel/BlockBanner';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { clearUserBlock, getDevConfig } from '@/lib/admin-api';
import { login as loginRequest } from '@/lib/hotel/customer-api';
import { getDemoLoginContext } from '@/lib/hotel/demo-context';
import { getRecentUsers, type RecentUser } from '@/lib/hotel/recent-users';
import { TEST_PERSONAS, type TestPersona } from '@/lib/hotel/test-personas';

// ---------------------------------------------------------------------------
// Tier badge helpers
// ---------------------------------------------------------------------------
const TIER_COLORS: Record<string, string> = {
  Silver: 'bg-gray-100 text-gray-600 border-gray-200',
  Gold: 'bg-amber-50 text-amber-700 border-amber-200',
  Platinum: 'bg-slate-100 text-slate-700 border-slate-300',
};

function TierBadge({ tier }: { tier: string }) {
  const cls = TIER_COLORS[tier] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest border rounded-sm font-sans ${cls}`}
    >
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PersonaCard - compact 2-row tile for the side panel
// ---------------------------------------------------------------------------
interface PersonaCardProps {
  persona: TestPersona;
  onSelect: (p: TestPersona) => void;
}

function PersonaCard({ persona, onSelect }: PersonaCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(persona)}
      className="group text-left w-full bg-[#fdfaf6] hover:bg-[#fff8ec] border border-[#e8dfd0] hover:border-[#d4b87a] transition-all duration-150 p-2 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-[#775a19]/30"
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="font-sans font-bold text-[11px] text-gray-800 leading-none group-hover:text-[#775a19] transition-colors truncate">
          {persona.name}
        </span>
        <TierBadge tier={persona.tier} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-0.5 text-[9px] text-gray-400 font-sans">
          <Star size={8} className="text-amber-400 shrink-0" />
          {persona.points.toLocaleString()}
        </span>
        <span className="flex items-center gap-0.5 text-[9px] text-gray-400 font-sans">
          <User size={8} className="shrink-0" />
          {persona.profilePct}%
        </span>
        {persona.mfaEnrolled ? (
          <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-sans">
            <ShieldCheck size={8} className="shrink-0" />
            MFA
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[9px] text-gray-300 font-sans">
            <Shield size={8} className="shrink-0" />
            No MFA
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Side panel: recent user chips + persona grid
// ---------------------------------------------------------------------------
interface SidePanelProps {
  onPersonaSelect: (p: TestPersona) => void;
  onRecentSelect: (username: string) => void;
}

function SidePanel({ onPersonaSelect, onRecentSelect }: SidePanelProps) {
  const [recents, setRecents] = useState<RecentUser[]>([]);
  const [personasOpen, setPersonasOpen] = useState(false);
  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_PERSONAS !== 'false';

  useEffect(() => {
    setRecents(getRecentUsers());
  }, []);

  return (
    <>
      {/* Desktop side panel */}
      <div className="hidden lg:flex flex-col w-full h-full border border-[#e8dfd0] bg-[#fdfaf6] p-5 gap-4 overflow-y-auto">
        {recents.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={10} className="text-[#775a19] shrink-0" />
              <span className="font-sans text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
                Recent
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => onRecentSelect(u.username)}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-[#775a19] px-2.5 py-1.5 text-[10px] font-sans font-semibold text-gray-700 hover:text-[#775a19] transition-all duration-150 cursor-pointer rounded-full focus:outline-none"
                >
                  <User size={9} className="shrink-0 text-gray-400" />
                  <span>{u.name || u.username}</span>
                  {u.tier && (
                    <span className="text-[8px] font-bold text-gray-400 uppercase">{u.tier}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {enabled && (
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={10} className="text-[#775a19] shrink-0" />
              <span className="font-sans text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
                Demo personas
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TEST_PERSONAS.map((p) => (
                <PersonaCard key={p.userId} persona={p} onSelect={onPersonaSelect} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile: collapsible personas section */}
      <div className="lg:hidden w-full mt-4">
        {recents.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={10} className="text-[#775a19] shrink-0" />
              <span className="font-sans text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
                Recent accounts
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => onRecentSelect(u.username)}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-[#775a19] px-2.5 py-1.5 text-[10px] font-sans font-semibold text-gray-700 hover:text-[#775a19] transition-all duration-150 cursor-pointer rounded-full focus:outline-none"
                >
                  <User size={9} className="shrink-0 text-gray-400" />
                  <span>{u.name || u.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {enabled && (
          <div>
            <button
              type="button"
              onClick={() => setPersonasOpen((v) => !v)}
              className="flex items-center justify-between w-full py-2 px-3 bg-[#fdfaf6] border border-[#e8dfd0] text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-gray-500 cursor-pointer focus:outline-none rounded-sm"
            >
              <span className="flex items-center gap-1.5">
                <Shield size={10} className="text-[#775a19]" />
                Show demo personas
              </span>
              {personasOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {personasOpen && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {TEST_PERSONAS.map((p) => (
                  <PersonaCard key={p.userId} persona={p} onSelect={onPersonaSelect} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main login screen
// ---------------------------------------------------------------------------

interface LoginBlockData {
  userId: string;
}

function LoginScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/profile';
  const { completeLogin, setPendingSessionId } = useCustomer();
  const [username, setUsername] = useState('user001');
  const [password, setPassword] = useState('Password1');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceMfa, setForceMfa] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [blockData, setBlockData] = useState<LoginBlockData | null>(null);
  const [clearingBlock, setClearingBlock] = useState(false);

  useEffect(() => {
    getDevConfig()
      .then((res) => {
        if (res.data?.demoMode) setDemoMode(true);
      })
      .catch(() => {
        // Config fetch failure is non-fatal; checkbox stays hidden.
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);

    const res = await loginRequest({
      username,
      password,
      ctx: getDemoLoginContext(),
      forceMfa: demoMode && forceMfa,
    });

    if (res.error) {
      if (res.error.code === 'ACCOUNT_BLOCKED') {
        setBlockData({ userId: username });
        setSubmitting(false);
        return;
      }
      setError(
        res.error.code === 'INVALID_CREDENTIALS'
          ? 'Invalid account ID or password.'
          : res.error.message || 'Unable to sign in. Please try again.'
      );
      setSubmitting(false);
      return;
    }

    if (res.data.status === 'MFA_REQUIRED') {
      setPendingSessionId(res.data.sessionId);
      const mfaTarget =
        nextPath !== '/profile' ? `/mfa?next=${encodeURIComponent(nextPath)}` : '/mfa';
      router.push(mfaTarget);
      return;
    }

    const ok = await completeLogin(res.data.token);
    if (ok) {
      router.push(nextPath);
    } else {
      setError('Sign-in succeeded but the session could not be established.');
      setSubmitting(false);
    }
  };

  const handlePersonaSelect = async (persona: TestPersona) => {
    setUsername(persona.username);
    setPassword(persona.password);
    setError(null);
    // Pre-emptively clear any stale BLOCK so every persona click starts clean.
    // Best-effort: clear-block is a no-op when the user is not blocked.
    try {
      await clearUserBlock(persona.userId);
    } catch {
      // Non-fatal; proceed to login regardless.
    }
    formRef.current?.requestSubmit();
  };

  const handleRecentUserSelect = (recentUsername: string) => {
    setUsername(recentUsername);
    setPassword('Password1');
    setError(null);
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  };

  const demoMode_ = demoMode;

  if (blockData) {
    const demoClearActions = demoMode_
      ? [
          {
            label: 'Demo: clear my block',
            variant: 'secondary' as const,
            onClick: async () => {
              setClearingBlock(true);
              const res = await clearUserBlock(blockData.userId);
              setClearingBlock(false);
              if (!res.error) {
                setBlockData(null);
              }
            },
          },
        ]
      : [];

    return (
      <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center p-8 font-sans text-black">
        <div className="w-full max-w-[600px]">
          <BlockBanner
            title="Your account is temporarily blocked."
            description="A prior security decision has suspended access to this account. Please contact support for assistance. If you are performing a demo, use the button below to clear the block and retry."
            referenceId={blockData.userId}
            actions={[
              {
                label: clearingBlock ? 'Clearing...' : 'Contact support',
                variant: 'primary',
                onClick: () => {
                  const subject = encodeURIComponent('Account blocked - access request');
                  const body = encodeURIComponent(`Account: ${blockData.userId}`);
                  window.location.href = `mailto:support@signal-force.demo?subject=${subject}&body=${body}`;
                },
              },
              ...demoClearActions,
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center px-4 py-10 overflow-hidden font-sans text-black">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#ffdea5]/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#d6e3ff]/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-0 min-h-[600px]">
        {/* Left column: login form */}
        <div className="flex flex-col items-center justify-center px-8 py-12 lg:py-16">
          <div className="w-full max-w-[520px] bg-white silk-shadow p-10 md:p-14 border border-gray-250/30">
            <div className="mb-10 text-center">
              <h1 className="font-serif text-3xl font-semibold tracking-wide text-black">
                Signal Force
              </h1>
              <div className="w-8 h-[1px] bg-[#775a19] mx-auto mt-4" />
            </div>

            <div className="text-center mb-8">
              <p className="font-sans text-[11px] font-bold text-gray-500 uppercase tracking-[0.3em] block">
                Sign in to your sanctuary
              </p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
              <div className="relative group text-left">
                <label
                  htmlFor="username"
                  className="text-[10px] uppercase font-bold tracking-widest text-gray-400 mb-2 block font-sans"
                >
                  Email Address / Account ID
                </label>
                <div className="flex items-center border-b border-gray-200 group-hover:border-black group-focus-within:border-black transition-colors py-1">
                  <Mail size={16} className="text-[#775a19] mr-3 shrink-0" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full bg-transparent border-none p-0 text-sm font-sans focus:ring-0 outline-none text-gray-800 font-medium py-2 placeholder:text-gray-300"
                    placeholder="user001"
                  />
                </div>
              </div>

              <div className="relative group text-left">
                <div className="flex justify-between items-end mb-2">
                  <label
                    htmlFor="password"
                    className="text-[10px] uppercase font-bold tracking-widest text-gray-400 block font-sans"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-[10px] font-bold text-[#775a19] hover:underline uppercase tracking-widest font-sans border-none bg-transparent cursor-pointer"
                  >
                    Forgot Password
                  </button>
                </div>
                <div className="flex items-center border-b border-gray-200 group-hover:border-black group-focus-within:border-black transition-colors py-1">
                  <Lock size={16} className="text-[#775a19] mr-3 shrink-0" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-none p-0 text-sm font-sans focus:ring-0 outline-none text-gray-800 font-medium py-2 placeholder:text-gray-300"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-black shrink-0 cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {demoMode && (
                <div className="flex items-start gap-3 pt-2">
                  <input
                    id="force-mfa"
                    type="checkbox"
                    checked={forceMfa}
                    onChange={(e) => setForceMfa(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#775a19]"
                  />
                  <div>
                    <label
                      htmlFor="force-mfa"
                      className="text-[10px] uppercase font-bold tracking-widest text-gray-400 cursor-pointer font-sans"
                    >
                      Force MFA challenge (demo)
                    </label>
                    <p className="mt-0.5 text-[10px] text-gray-400 font-sans">
                      Skips the fraud engine and triggers MFA. Only honored when DEMO_MODE is on.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-[#fff4f4] border border-red-200 text-red-700 text-xs font-sans px-4 py-3 rounded-sm animate-fade-in">
                  {error}
                </div>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-black hover:bg-[#775a19] text-white py-4.5 px-8 font-sans font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 cursor-pointer hover:shadow-lg active:scale-[0.98] border-b-2 border-transparent hover:border-[#ffdea5] disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Signing In...' : 'Sign In'}
                </button>
              </div>
            </form>

            <div className="mt-10 text-center text-xs">
              <p className="font-sans text-gray-500 mb-3">New to our luxury collection?</p>
              <button
                type="button"
                className="font-sans text-xs font-bold text-black border-b border-gray-300 hover:text-[#775a19] hover:border-[#775a19] pb-1 uppercase tracking-widest cursor-pointer bg-transparent"
              >
                Apply for Membership
              </button>
            </div>

            <div className="mt-10 flex justify-center items-center gap-4 text-gray-300 select-none">
              <div className="h-[1px] w-8 bg-gray-200" />
              <span className="text-[10px] font-sans uppercase tracking-[0.2em] italic font-light">
                Since 1922
              </span>
              <div className="h-[1px] w-8 bg-gray-200" />
            </div>
          </div>

          {/* Mobile personas/recents below the form (hidden on lg+ since
              the right column owns it there). SidePanel itself contains both
              variants, so we suppress on desktop via lg:hidden here. */}
          <div className="w-full max-w-[520px] lg:hidden">
            <SidePanel
              onPersonaSelect={handlePersonaSelect}
              onRecentSelect={handleRecentUserSelect}
            />
          </div>
        </div>

        {/* Right column: personas + recent users panel (desktop only) */}
        <div className="hidden lg:flex flex-col border-l border-[#e8dfd0]">
          <SidePanel
            onPersonaSelect={handlePersonaSelect}
            onRecentSelect={handleRecentUserSelect}
          />
        </div>
      </div>
    </div>
  );
}

export default function LoginScreen() {
  return (
    <Suspense>
      <LoginScreenInner />
    </Suspense>
  );
}
