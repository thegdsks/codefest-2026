import { E as EngagementClient, a as EngagementConfig, e as SignalEvent, I as Intervention, c as InterventionTheme } from './types-Br8hovGi.cjs';
export { D as DeviceContext, F as FlowPage, b as FlowState, S as Signal, d as SignalContext, f as Surface, g as SurfaceType } from './types-Br8hovGi.cjs';
import React from 'react';

interface ExtendedEngagementClient extends EngagementClient {
    trackHealthyEvent: (eventKey: string) => void;
}
declare function createClient(config: EngagementConfig): ExtendedEngagementClient;

interface CaptureOrchestrator {
    trackSearch: (query: string) => void;
    destroy: () => void;
}
declare function mountCapture(onSignal: (event: SignalEvent) => void, config: EngagementConfig): CaptureOrchestrator;

declare function attachRageClickDetector(onSignal: (event: SignalEvent) => void): () => void;

declare function attachDwellNoActionDetector(onSignal: (event: SignalEvent) => void, thresholdMs?: number): () => void;

declare function attachAbandonedFlowStepDetector(onSignal: (event: SignalEvent) => void, config: Pick<EngagementConfig, 'onRouteChange'>): () => void;

declare function createRepeatedQueryTracker(onSignal: (event: SignalEvent) => void): (query: string) => void;

declare function attachPointsBalanceStareDetector(onSignal: (event: SignalEvent) => void, stareThresholdMs?: number): () => void;

interface NudgeBannerProps {
    intervention: Intervention;
    onDismiss: () => void;
    theme?: InterventionTheme;
}
declare function NudgeBanner({ intervention, onDismiss, theme }: NudgeBannerProps): React.ReactElement;

interface OfferModalProps {
    intervention: Intervention;
    onDismiss: () => void;
    theme?: InterventionTheme;
}
declare function OfferModal({ intervention, onDismiss, theme }: OfferModalProps): React.ReactElement;

interface HelpTooltipProps {
    intervention: Intervention;
    onDismiss: () => void;
    theme?: InterventionTheme;
}
declare function HelpTooltip({ intervention, onDismiss, theme }: HelpTooltipProps): React.ReactElement | null;

/**
 * trust.ts
 *
 * Trust score delta table. Applied by the client on each signal emission.
 *
 * Each entry is the delta to apply to the rolling trust score when the
 * associated signal fires. Positive = recovery; negative = degradation.
 * Deltas are clamped to keep score in [0, 100].
 */
declare const TRUST_DELTAS: Record<string, number>;

export { EngagementClient, EngagementConfig, type ExtendedEngagementClient, HelpTooltip, type HelpTooltipProps, Intervention, InterventionTheme, NudgeBanner, type NudgeBannerProps, OfferModal, type OfferModalProps, SignalEvent, TRUST_DELTAS, attachAbandonedFlowStepDetector, attachDwellNoActionDetector, attachPointsBalanceStareDetector, attachRageClickDetector, createClient, createRepeatedQueryTracker, mountCapture };
