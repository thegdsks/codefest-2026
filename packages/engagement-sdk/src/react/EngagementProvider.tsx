import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '../client.js';
import { mountCapture } from '../capture/index.js';
import { NudgeBanner } from '../surfaces/NudgeBanner.js';
import { OfferModal } from '../surfaces/OfferModal.js';
import { HelpTooltip } from '../surfaces/HelpTooltip.js';
import type {
  EngagementConfig,
  FlowState,
  Intervention,
  SignalEvent,
  SurfaceType,
} from '../types.js';
import type { UseEngagementReturn } from './useEngagement.js';

export type SurfaceComponent = React.ComponentType<{
  intervention: Intervention;
  onDismiss: () => void;
}>;

export interface EngagementProviderProps {
  config: EngagementConfig;
  children: React.ReactNode;
  surfaces?: Partial<Record<SurfaceType, SurfaceComponent>>;
}

export const EngagementContext = createContext<UseEngagementReturn | null>(null);

const DEFAULT_POLL_MS = 2000;

export function EngagementProvider({
  config,
  children,
  surfaces,
}: EngagementProviderProps): React.ReactElement {
  const [currentIntervention, setCurrentIntervention] = useState<Intervention | null>(null);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const captureRef = useRef<ReturnType<typeof mountCapture> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const client = createClient(config);
    clientRef.current = client;

    const capture = mountCapture((event: SignalEvent) => {
      client.trackEvent(event);
    }, config);
    captureRef.current = capture;

    const pollMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;

    async function poll(): Promise<void> {
      const intervention = await client.getPending();
      if (intervention !== null) {
        setCurrentIntervention(intervention);
      }
    }

    void poll();
    pollRef.current = setInterval(() => {
      void poll();
    }, pollMs);

    return () => {
      client.destroy();
      capture.destroy();
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, [config]);

  const trackEvent = useCallback((event: SignalEvent) => {
    clientRef.current?.trackEvent(event);
  }, []);

  const trackSearch = useCallback((query: string) => {
    captureRef.current?.trackSearch(query);
  }, []);

  const trackHealthyEvent = useCallback((eventKey: string) => {
    clientRef.current?.trackHealthyEvent(eventKey);
  }, []);

  const getTrustScore = useCallback((): number => {
    return clientRef.current?.getTrustScore() ?? 70;
  }, []);

  const setFlowState = useCallback((state: FlowState | null) => {
    clientRef.current?.setFlowState(state);
  }, []);

  const dismiss = useCallback(() => {
    setCurrentIntervention(null);
  }, []);

  function renderSurface(): React.ReactElement | null {
    if (currentIntervention === null) return null;

    const surfaceType = currentIntervention.surface;
    const CustomComponent = surfaces?.[surfaceType];

    if (CustomComponent) {
      return <CustomComponent intervention={currentIntervention} onDismiss={dismiss} />;
    }

    if (surfaceType === 'nudge_banner') {
      return <NudgeBanner intervention={currentIntervention} onDismiss={dismiss} />;
    }

    if (surfaceType === 'offer_modal') {
      return <OfferModal intervention={currentIntervention} onDismiss={dismiss} />;
    }

    if (surfaceType === 'help_tooltip') {
      return <HelpTooltip intervention={currentIntervention} onDismiss={dismiss} />;
    }

    return null;
  }

  return (
    <EngagementContext.Provider
      value={{
        trackEvent,
        trackSearch,
        trackHealthyEvent,
        getTrustScore,
        setFlowState,
        currentIntervention,
        dismiss,
      }}
    >
      {renderSurface()}
      {children}
    </EngagementContext.Provider>
  );
}
