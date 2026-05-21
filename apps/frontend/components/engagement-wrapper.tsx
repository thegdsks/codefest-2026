'use client';

import type { EngagementConfig } from '@signal-force/engagement-sdk';
import { EngagementProvider } from '@signal-force/engagement-sdk/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const CLIENT_ID = process.env.NEXT_PUBLIC_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.NEXT_PUBLIC_CLIENT_SECRET ?? '';

function buildBasicAuth(): string {
  return `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
}

export default function EngagementWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeListenersRef = useRef<Set<(path: string) => void>>(new Set());

  // Notify all route listeners when the pathname changes
  useEffect(() => {
    for (const listener of routeListenersRef.current) {
      listener(pathname);
    }
  }, [pathname]);

  const config: EngagementConfig = {
    baseUrl: BASE_URL,
    getAuthHeader: buildBasicAuth,
    onRouteChange: (callback) => {
      routeListenersRef.current.add(callback);
      return () => {
        routeListenersRef.current.delete(callback);
      };
    },
  };

  return <EngagementProvider config={config}>{children}</EngagementProvider>;
}
