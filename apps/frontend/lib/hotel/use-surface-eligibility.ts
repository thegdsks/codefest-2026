'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { fetchSurfaceEligibility } from '@/lib/hotel/customer-api';
import type { SurfaceMap } from '@/lib/hotel/surface-types';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  surfaces: SurfaceMap;
  expiresAt: number;
}

// Module-level in-memory cache so all hook instances share results within a page session.
const cache = new Map<string, CacheEntry>();

export interface SurfaceEligibilityState {
  surfaces: SurfaceMap;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSurfaceEligibility(): SurfaceEligibilityState {
  const { session, isLoggedIn } = useCustomer();
  const [surfaces, setSurfaces] = useState<SurfaceMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which (userId, token) pair was last fetched to avoid redundant calls.
  const lastFetchKey = useRef<string | null>(null);

  const doFetch = useCallback(
    async (force = false) => {
      if (!isLoggedIn || !session?.token || !session?.userId) {
        setSurfaces({});
        return;
      }

      const cacheKey = session.userId;
      if (!force) {
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          setSurfaces(cached.surfaces);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchSurfaceEligibility(session.token, session.userId);
        if (result.error || !result.data) {
          setError(result.error?.message ?? 'Failed to load surface eligibility');
          setIsLoading(false);
          return;
        }

        const map: SurfaceMap = {};
        for (const evaluation of result.data.surfaces) {
          map[evaluation.surfaceId] = evaluation;
        }

        cache.set(cacheKey, { surfaces: map, expiresAt: Date.now() + CACHE_TTL_MS });
        setSurfaces(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error loading surfaces');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoggedIn, session]
  );

  useEffect(() => {
    const fetchKey = session ? `${session.userId}:${session.token}` : null;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;
    doFetch();
  }, [session, doFetch]);

  const refetch = useCallback(() => {
    if (session?.userId) {
      cache.delete(session.userId);
    }
    doFetch(true);
  }, [session, doFetch]);

  return { surfaces, isLoading, error, refetch };
}
