'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { fetchSurfaceEligibility } from '@/lib/hotel/customer-api';
import type { SurfaceMap } from '@/lib/hotel/surface-types';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  surfaces: SurfaceMap;
  aiUnavailable: boolean;
  expiresAt: number;
}

// Module-level in-memory cache so all hook instances share results within a page session.
const cache = new Map<string, CacheEntry>();

export interface SurfaceEligibilityState {
  surfaces: SurfaceMap;
  isLoading: boolean;
  error: string | null;
  aiMode: boolean;
  setAiMode: (on: boolean) => void;
  aiUnavailable: boolean;
  refetch: () => void;
}

export function useSurfaceEligibility(): SurfaceEligibilityState {
  const { session, isLoggedIn } = useCustomer();
  const [surfaces, setSurfaces] = useState<SurfaceMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMode, setAiModeState] = useState(true);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  // Track which (userId, token, aiMode) combination was last fetched.
  const lastFetchKey = useRef<string | null>(null);

  const doFetch = useCallback(
    async (force = false, currentAiMode = aiMode) => {
      if (!isLoggedIn || !session?.token || !session?.userId) {
        setSurfaces({});
        return;
      }

      const cacheKey = `${session.userId}:${currentAiMode ? 'on' : 'off'}`;
      if (!force) {
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          setSurfaces(cached.surfaces);
          setAiUnavailable(cached.aiUnavailable);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchSurfaceEligibility(session.token, session.userId, currentAiMode);
        if (result.error || !result.data) {
          setError(result.error?.message ?? 'Failed to load surface eligibility');
          setIsLoading(false);
          return;
        }

        const map: SurfaceMap = {};
        for (const evaluation of result.data.surfaces) {
          map[evaluation.surfaceId] = evaluation;
        }
        const unavailable = result.data.aiUnavailable === true;

        cache.set(cacheKey, {
          surfaces: map,
          aiUnavailable: unavailable,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        setSurfaces(map);
        setAiUnavailable(unavailable);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error loading surfaces');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoggedIn, session, aiMode]
  );

  useEffect(() => {
    const fetchKey = session ? `${session.userId}:${session.token}:${aiMode}` : null;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;
    doFetch(false, aiMode);
  }, [session, doFetch, aiMode]);

  const setAiMode = useCallback(
    (on: boolean) => {
      setAiModeState(on);
      if (session?.userId) {
        cache.delete(`${session.userId}:${on ? 'on' : 'off'}`);
      }
    },
    [session]
  );

  const refetch = useCallback(() => {
    if (session?.userId) {
      cache.delete(`${session.userId}:on`);
      cache.delete(`${session.userId}:off`);
    }
    doFetch(true, aiMode);
  }, [session, doFetch, aiMode]);

  return { surfaces, isLoading, error, aiMode, setAiMode, aiUnavailable, refetch };
}
