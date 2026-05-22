'use client';

/**
 * Per-route error boundary for /login. If anything below this file throws
 * during render (a corrupted persona import, a third-party widget that
 * blew up, anything React's getDerivedStateFromError catches), this
 * renders a recovery surface instead of a blank page. The "Reset session"
 * action wipes the only stateful storage the login flow owns (sessionStorage)
 * and reloads, which is the same manual remediation the team has been
 * doing in the browser dev tools.
 */
import { useEffect } from 'react';

export default function LoginRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[LoginRouteError] login route render failure', error);
  }, [error]);

  const handleResetSession = () => {
    try {
      window.sessionStorage.removeItem('sf.session');
    } catch {
      // Storage access blocked: nothing we can do client-side. Reload anyway.
    }
    // Clear the legacy sf.token cookie defensively in case any older build
    // wrote one before this fix shipped.
    document.cookie = 'sf.token=; path=/; max-age=0; SameSite=Lax';
    window.location.assign('/login');
  };

  return (
    <div className="relative min-h-[85vh] bg-[#fbf9f8] flex items-center justify-center p-8 font-sans text-black">
      <div className="w-full max-w-[520px] bg-white silk-shadow p-10 border border-gray-250/30 text-center">
        <h1 className="font-serif text-2xl font-semibold tracking-wide text-black mb-2">
          Sign-in is having a moment
        </h1>
        <div className="w-8 h-[1px] bg-[#775a19] mx-auto mt-2 mb-6" />
        <p className="font-sans text-xs text-gray-600 leading-relaxed mb-6">
          We hit an unexpected error while preparing the login page. Reset your local session state
          to try again. If the problem persists, please contact support.
        </p>
        {error?.message && (
          <p className="font-mono text-[10px] text-gray-400 break-words mb-6">{error.message}</p>
        )}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleResetSession}
            className="w-full bg-black hover:bg-[#775a19] text-white py-3 px-6 font-sans font-bold text-[11px] uppercase tracking-[0.2em] transition-all duration-300 cursor-pointer border-none"
          >
            Reset session and retry
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="font-sans text-[10px] font-bold text-gray-500 hover:text-[#775a19] uppercase tracking-widest cursor-pointer bg-transparent border-none py-2"
          >
            Try again without resetting
          </button>
        </div>
      </div>
    </div>
  );
}
