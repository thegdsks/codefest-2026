import { useContext } from 'react';
import { EngagementContext } from './EngagementProvider.js';
import type { FlowState, Intervention, SignalEvent } from '../types.js';

export interface UseEngagementReturn {
  trackEvent: (event: SignalEvent) => void;
  trackSearch: (query: string) => void;
  trackHealthyEvent: (eventKey: string) => void;
  getTrustScore: () => number;
  setFlowState: (state: FlowState | null) => void;
  currentIntervention: Intervention | null;
  dismiss: () => void;
}

export function useEngagement(): UseEngagementReturn {
  const ctx = useContext(EngagementContext);
  if (ctx === null) {
    throw new Error('useEngagement must be used within an EngagementProvider');
  }
  return ctx;
}
