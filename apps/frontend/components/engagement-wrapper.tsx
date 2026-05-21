'use client';

import type { EngagementConfig } from '@signal-force/engagement-sdk';
import { EngagementProvider } from '@signal-force/engagement-sdk/react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET ?? '';

function buildBasicAuth(): string {
  return `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
}

export default function EngagementWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeListenersRef = useRef<Set<(path: string) => void>>(new Set());
  const { session } = useCustomer();

  // Notify all route listeners when the pathname changes.
  useEffect(() => {
    for (const listener of routeListenersRef.current) {
      listener(pathname);
    }
  }, [pathname]);

  // Rebuild the SDK config whenever the session token changes so the
  // EngagementProvider instance picks up the new auth header immediately.
  const config = useMemo<EngagementConfig>(
    () => ({
      baseUrl: BASE_URL,
      getAuthHeader: () => (session?.token ? `Bearer ${session.token}` : buildBasicAuth()),
      onRouteChange: (callback) => {
        routeListenersRef.current.add(callback);
        return () => {
          routeListenersRef.current.delete(callback);
        };
      },
    }),
    // Rebuild when the token changes (token is the identity key for the session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.token]
  );

  return <EngagementProvider config={config}>{children}</EngagementProvider>;
}
