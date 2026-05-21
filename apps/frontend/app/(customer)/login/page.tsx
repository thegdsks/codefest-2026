'use client';

import { Clock, Eye, EyeOff, Lock, Mail, Shield, ShieldCheck, Star, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { getDevConfig } from '@/lib/admin-api';
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
      className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest border rounded-sm font-sans ${cls}`}
    >
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PersonaCard - single card in the quick-fill grid
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
      className="group text-left w-full bg-[#fdfaf6] hover:bg-[#fff8ec] border border-[#e8dfd0] hover:border-[#d4b87a] transition-all duration-150 p-3 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-[#775a19]/30"
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="font-sans font-bold text-[12px] text-gray-800 leading-none group-hover:text-[#775a19] transition-colors">
          {persona.name}
        </span>
        <TierBadge tier={persona.tier} />
      </div>
      <p className="font-sans text-[10px] text-gray-500 leading-tight mb-2 line-clamp-2">
        {persona.tagline}
      </p>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="flex items-center gap-0.5 text-[9px] text-gray-400 font-sans">
          <Star size={9} className="text-amber-400 shrink-0" />
          {persona.points.toLocaleString()}
        </span>
        <span className="flex items-center gap-0.5 text-[9px] text-gray-400 font-sans">
          <User size={9} className="shrink-0" />
          {persona.profilePct}%
        </span>
        {persona.mfaEnrolled ? (
          <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-sans">
            <ShieldCheck size={9} className="shrink-0" />
            MFA
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-[9px] text-gray-300 font-sans">
            <Shield size={9} className="shrink-0" />
            No MFA
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recent users bar
// Shows up to 5 recently signed-in accounts stored in localStorage.
// ---------------------------------------------------------------------------
interface RecentUsersBarProps {
  onSelect: (username: string) => void;
}

function RecentUsersBar({ onSelect }: RecentUsersBarProps) {
  const [recents, setRecents] = useState<RecentUser[]>([]);

  useEffect(() => {
    setRecents(getRecentUsers());
  }, []);

  if (recents.length === 0) return null;

  return (
    <div className="w-full max-w-[900px] mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Clock size={11} className="text-[#775a19] shrink-0" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
          Recent accounts
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {recents.map((u) => (
          <button
            key={u.username}
            type="button"
            onClick={() => onSelect(u.username)}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:border-[#775a19] px-3 py-2 text-xs font-sans font-semibold text-gray-700 hover:text-[#775a19] transition-all duration-150 cursor-pointer rounded-sm focus:outline-none"
          >
            <User size={11} className="shrink-0 text-gray-400" />
            <span>{u.name || u.username}</span>
            {u.tier && (
              <span className="text-[9px] font-bold text-gray-400 uppercase">{u.tier}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo personas bar
// Rendered only when NEXT_PUBLIC_ENABLE_DEMO_PERSONAS !== 'false'.
// ---------------------------------------------------------------------------
interface PersonasBarProps {
  onSelect: (p: TestPersona) => void;
}

function PersonasBar({ onSelect }: PersonasBarProps) {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_PERSONAS !== 'false';
  if (!enabled) return null;

  return (
    /* === DEMO PERSONAS SECTION - relocate as a block if login/page.tsx is rebased === */
    <div className="w-full max-w-[900px] mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={11} className="text-[#775a19] shrink-0" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
          Demo personas
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TEST_PERSONAS.map((p) => (
          <PersonaCard key={p.userId} persona={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
    /* === END DEMO PERSONAS SECTION === */
  );
}

// ---------------------------------------------------------------------------
// Main login screen
// ---------------------------------------------------------------------------
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
      setError(
        res.error.code === 'ACCOUNT_BLOCKED'
          ? 'This account is temporarily blocked by a prior security decision.'
          : res.error.code === 'INVALID_CREDENTIALS'
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

  const handlePersonaSelect = (persona: TestPersona) => {
    setUsername(persona.username);
    setPassword(persona.password);
    setError(null);
    // Submit on next tick so state has settled.
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  };

  // Auto-fill username from the recent-users bar and submit with the default password.
  const handleRecentUserSelect = (recentUsername: string) => {
    setUsername(recentUsername);
    setPassword('Password1');
    setError(null);
    setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  };

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex flex-col items-center justify-center p-8 overflow-hidden font-sans text-black">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#ffdea5]/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#d6e3ff]/15 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Recent accounts - sits above the persona grid */}
        <RecentUsersBar onSelect={handleRecentUserSelect} />

        {/* Demo personas quick-fill - sits above the login card */}
        <PersonasBar onSelect={handlePersonaSelect} />

        <div className="w-full max-w-[520px] bg-white silk-shadow p-10 md:p-16 border border-gray-250/30">
          <div className="mb-12 text-center">
            <h1 className="font-serif text-3xl font-semibold tracking-wide text-black">
              Signal Force
            </h1>
            <div className="w-8 h-[1px] bg-[#775a19] mx-auto mt-4" />
          </div>

          <div className="text-center mb-10">
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

          <div className="mt-12 text-center text-xs">
            <p className="font-sans text-gray-500 mb-3">New to our luxury collection?</p>
            <button
              type="button"
              className="font-sans text-xs font-bold text-black border-b border-gray-300 hover:text-[#775a19] hover:border-[#775a19] pb-1 uppercase tracking-widest cursor-pointer bg-transparent"
            >
              Apply for Membership
            </button>
          </div>

          <div className="mt-12 flex justify-center items-center gap-4 text-gray-300 select-none">
            <div className="h-[1px] w-8 bg-gray-200" />
            <span className="text-[10px] font-sans uppercase tracking-[0.2em] italic font-light">
              Since 1922
            </span>
            <div className="h-[1px] w-8 bg-gray-200" />
          </div>
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
