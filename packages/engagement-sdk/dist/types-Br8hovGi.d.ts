declare enum Signal {
    RageClick = "rage_click",
    DwellNoAction = "dwell_no_action",
    AbandonedFlowStep = "abandoned_flow_step",
    RepeatedQuery = "repeated_query",
    PointsBalanceStare = "points_balance_stare"
}
type FlowPage = 'transfer' | 'booking' | 'profile' | 'search' | 'results' | 'property';
interface FlowState {
    page: FlowPage;
    step?: string;
    amountSfc?: number;
    recipientId?: string;
}
interface DeviceContext {
    userAgent: string;
    viewportWidth: number;
    viewportHeight: number;
    language: string;
    timezone: string;
    pixelRatio: number;
}
interface SignalContext {
    pageUrl: string;
    pageTimeSinceMountMs: number;
    scrollDepthPct: number;
    clickCountInSession: number;
    routeChangesInSession: number;
    trustScore: number;
    recentEventTypes: string[];
    device: DeviceContext;
    flowState?: FlowState;
}
interface SignalEvent {
    signal: Signal;
    userId?: string;
    sessionId?: string;
    path: string;
    timestamp: number;
    metadata?: Record<string, string | number | boolean>;
    context?: SignalContext;
}
type SurfaceType = 'nudge_banner' | 'offer_modal' | 'help_tooltip' | 'inline_card';
interface Surface {
    type: SurfaceType;
    anchorSelector?: string;
}
interface Intervention {
    interventionId: string;
    surface: SurfaceType;
    message: string;
    ctaLabel?: string;
    ctaUrl?: string;
    theme?: InterventionTheme;
    anchorSelector?: string;
    metadata?: Record<string, string | number | boolean>;
}
interface InterventionTheme {
    background?: string;
    text?: string;
    border?: string;
    buttonBackground?: string;
    buttonText?: string;
}
interface EngagementConfig {
    baseUrl: string;
    getAuthHeader: () => string;
    dwellThresholdMs?: number;
    pollIntervalMs?: number;
    flushIntervalMs?: number;
    debug?: boolean;
    onRouteChange?: (callback: (path: string) => void) => () => void;
}
interface EngagementClient {
    trackEvent: (event: SignalEvent) => void;
    trackSearch: (query: string) => void;
    getPending: () => Promise<Intervention | null>;
    flush: () => Promise<void>;
    destroy: () => void;
    getTrustScore: () => number;
    setFlowState: (state: FlowState | null) => void;
}

export { type DeviceContext as D, type EngagementClient as E, type FlowPage as F, type Intervention as I, Signal as S, type EngagementConfig as a, type FlowState as b, type InterventionTheme as c, type SignalContext as d, type SignalEvent as e, type Surface as f, type SurfaceType as g };
