'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';

/**
 * Guards a client component to authenticated users only.
 * Waits for the provider to finish restoring any stored session before acting
 * (prevents a false redirect during the async hydration window).
 * When the session is absent after hydration, replaces the current history
 * entry with /login?next=<current-pathname> so the user returns here after
 * signing in.
 *
 * Returns true once isLoggedIn is confirmed so the caller can render content
 * only after the guard has passed, preventing a flash of restricted content.
 */
export function useRequireAuth(): boolean {
  const { isLoggedIn, isHydrated } = useCustomer();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoggedIn, isHydrated, pathname, router]);

  return isHydrated && isLoggedIn;
}
