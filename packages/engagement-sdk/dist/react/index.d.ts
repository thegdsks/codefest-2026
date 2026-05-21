import React from 'react';
import { e as SignalEvent, b as FlowState, I as Intervention, a as EngagementConfig, g as SurfaceType } from '../types-Br8hovGi.js';

interface UseEngagementReturn {
    trackEvent: (event: SignalEvent) => void;
    trackSearch: (query: string) => void;
    trackHealthyEvent: (eventKey: string) => void;
    getTrustScore: () => number;
    setFlowState: (state: FlowState | null) => void;
    currentIntervention: Intervention | null;
    dismiss: () => void;
}
declare function useEngagement(): UseEngagementReturn;

type SurfaceComponent = React.ComponentType<{
    intervention: Intervention;
    onDismiss: () => void;
}>;
interface EngagementProviderProps {
    config: EngagementConfig;
    children: React.ReactNode;
    surfaces?: Partial<Record<SurfaceType, SurfaceComponent>>;
}
declare function EngagementProvider({ config, children, surfaces, }: EngagementProviderProps): React.ReactElement;

export { EngagementProvider, type EngagementProviderProps, type SurfaceComponent, type UseEngagementReturn, useEngagement };
