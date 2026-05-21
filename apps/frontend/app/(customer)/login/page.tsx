'use client';

import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { login as loginRequest } from '@/lib/hotel/customer-api';
import { getDemoLoginContext } from '@/lib/hotel/demo-context';

export default function LoginScreen() {
  const router = useRouter();
  const { completeLogin, setPendingSessionId } = useCustomer();
  const [username, setUsername] = useState('user001');
  const [password, setPassword] = useState('Password1');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);

    const res = await loginRequest(username, password, getDemoLoginContext());

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
      router.push('/mfa');
      return;
    }

    const ok = await completeLogin(res.data.token);
    if (ok) {
      router.push('/profile');
    } else {
      setError('Sign-in succeeded but the session could not be established.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center p-8 overflow-hidden font-sans text-black">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#ffdea5]/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#d6e3ff]/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-[520px] bg-white silk-shadow p-10 md:p-16 border border-gray-250/30">
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

        <form onSubmit={handleSubmit} className="space-y-8">
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
  );
}
