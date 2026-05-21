'use client';

import { useQuery } from '@tanstack/react-query';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import type { LoyaltySummary } from '@/lib/hotel/customer-api';
import { fetchLoyaltySummary } from '@/lib/hotel/customer-api';

interface UseLoyaltySummaryResult {
  data: LoyaltySummary | null;
  isLoading: boolean;
  error: string | null;
}

export function useLoyaltySummary(): UseLoyaltySummaryResult {
  const { isLoggedIn, session } = useCustomer();

  const query = useQuery({
    queryKey: ['loyalty-summary', session?.userId],
    queryFn: async () => {
      if (!session) throw new Error('No session');
      const result = await fetchLoyaltySummary(session.token, session.userId);
      if (result.error) throw new Error(result.error.message || 'Failed to load loyalty summary');
      return result.data;
    },
    enabled: isLoggedIn && !!session,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
