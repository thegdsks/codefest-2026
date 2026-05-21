'use client';

import { type LucideIcon, ServerCrash, ShieldAlert, ShieldOff, WifiOff } from 'lucide-react';
import type { ApiErrorDetail } from '@/lib/types';

interface AuthGateProps {
  error: ApiErrorDetail;
  onRetry?: () => void;
}

type Kind = 'unauthenticated' | 'forbidden' | 'network' | 'server';

interface KindDef {
  kind: Kind;
  title: string;
  body: string;
  cta?: string;
  icon: LucideIcon;
}

function classify(error: ApiErrorDetail): KindDef {
  const code = (error.code || '').toUpperCase();
  if (code === 'NETWORK_ERROR') {
    return {
      kind: 'network',
      title: 'Cannot reach the API',
      body: 'Check the demo connectivity. The browser could not contact the gateway.',
      cta: 'Retry',
      icon: WifiOff,
    };
  }
  if (code === '401' || code === 'UNAUTHORIZED' || code === 'INVALID_CREDENTIALS') {
    return {
      kind: 'unauthenticated',
      title: 'Sign in required',
      body: 'Your session is missing or expired. Sign in with an admin account to continue.',
      cta: 'Go to login',
      icon: ShieldAlert,
    };
  }
  if (code === '403' || code === 'FORBIDDEN') {
    return {
      kind: 'forbidden',
      title: 'Admin access required',
      body: 'This account is signed in but not in ADMIN_USERNAMES. Switch to an admin user to access this panel.',
      cta: 'Switch user',
      icon: ShieldOff,
    };
  }
  return {
    kind: 'server',
    title: 'Server error',
    body: error.message || 'The API returned an unexpected response.',
    cta: 'Retry',
    icon: ServerCrash,
  };
}

export default function AuthGate({ error, onRetry }: AuthGateProps) {
  const def = classify(error);
  const Icon = def.icon;
  const isLoginCta = def.kind === 'unauthenticated' || def.kind === 'forbidden';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950">
          <Icon size={22} className="text-zinc-300" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">{def.title}</h2>
        <p className="mt-2 text-sm text-zinc-400">{def.body}</p>
        <div className="mt-2 font-mono text-xs text-zinc-600">code: {error.code}</div>
        {def.cta ? (
          <div className="mt-6">
            {isLoginCta ? (
              <a
                href="/login"
                className="inline-flex items-center rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                {def.cta}
              </a>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              >
                {def.cta}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
