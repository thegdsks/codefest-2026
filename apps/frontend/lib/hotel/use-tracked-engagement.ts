'use client';

/**
 * useTrackedEngagement
 *
 * Wraps the SDK's useEngagement hook and auto-injects the active session's
 * userId into every trackEvent call. All other SDK methods are passed through
 * unchanged.
 *
 * Note: trackSearch from the SDK does not currently inject userId because the
 * SDK constructs the SignalEvent internally and EngagementConfig has no userId
 * field. Callers needing a userId-stamped search event should use
 * useTrackedEngagement.trackEvent directly with signal: Signal.RepeatedQuery.
 */

import type { SignalEvent } from '@signal-force/engagement-sdk';
import { useEngagement } from '@signal-force/engagement-sdk/react';
import { useCustomer } from '@/components/hotel/CustomerProvider';

export function useTrackedEngagement() {
  const { session } = useCustomer();
  const sdk = useEngagement();

  function trackEvent(event: SignalEvent): void {
    sdk.trackEvent({
      ...event,
      userId: session?.userId ?? event.userId,
    });
  }

  return {
    ...sdk,
    trackEvent,
  };
}
