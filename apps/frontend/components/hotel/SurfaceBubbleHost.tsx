'use client';

/**
 * SurfaceBubbleHost.tsx
 *
 * Floating bubble provider rendered at the bottom of the customer layout.
 * Picks the highest-priority SHOWN surface and renders a fixed SurfaceBubble
 * at bottom-left (avoiding the DemoPanel at bottom-right).
 */

import { useCallback, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import SurfaceBubble from '@/components/hotel/SurfaceBubble';
import { mutateDemoUser } from '@/lib/hotel/customer-api';
import { dismiss, isDismissed } from '@/lib/hotel/surface-dismissal';
import type { SurfaceEvaluation } from '@/lib/hotel/surface-types';
import { useSurfaceEligibility } from '@/lib/hotel/use-surface-eligibility';

// Hard-coded priority order when aiPriority is absent (lower index = higher priority).
const PRIORITY_ORDER = [
  'BOOKING_CONFIRMATION_OFFER',
  'TRANSFER_ABANDON_OFFER',
  'MFA_ENROLLMENT_NUDGE',
  'PROFILE_CATALYST_ELEVATE',
  'PROPERTY_PRESTIGE_ADVANCE',
  'RESULTS_PRESTIGE_ADVANCE',
];

function pickTopSurface(surfaces: Record<string, SurfaceEvaluation>): SurfaceEvaluation | null {
  const candidates = Object.values(surfaces).filter(
    (s) => s.state === 'SHOWN' && !isDismissed(s.surfaceId)
  );

  if (candidates.length === 0) return null;

  // If AI priorities are present, prefer the lowest numeric priority value (1 = highest).
  const withAi = candidates.filter((s) => s.aiPriority !== undefined);
  if (withAi.length > 0) {
    return withAi.reduce((best, s) =>
      (s.aiPriority as number) < (best.aiPriority as number) ? s : best
    );
  }

  // Fall back to static ordering.
  return candidates.sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a.surfaceId);
    const bi = PRIORITY_ORDER.indexOf(b.surfaceId);
    const aRank = ai === -1 ? PRIORITY_ORDER.length : ai;
    const bRank = bi === -1 ? PRIORITY_ORDER.length : bi;
    return aRank - bRank;
  })[0];
}

export default function SurfaceBubbleHost() {
  const { isLoggedIn, session } = useCustomer();
  const { surfaces, refetch } = useSurfaceEligibility();
  // Counter used to trigger re-render after dismiss without re-fetching.
  const [dismissCount, setDismissCount] = useState(0);

  const handleDismiss = useCallback((surfaceId: string) => {
    dismiss(surfaceId);
    setDismissCount((c) => c + 1);
  }, []);

  if (!isLoggedIn || !session) return null;

  // Prevent lint warning about unused dismissCount — reading it ensures re-render.
  void dismissCount;

  const surface = pickTopSurface(surfaces);
  if (!surface) return null;

  const handleAction = async () => {
    if (!surface.nextAction?.delta) return;
    await mutateDemoUser(session.userId, surface.nextAction.delta);
    refetch();
  };

  return (
    <SurfaceBubble
      surface={surface}
      placement="bottom-left"
      onDismiss={() => handleDismiss(surface.surfaceId)}
      onAction={handleAction}
    />
  );
}
