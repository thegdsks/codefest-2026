export enum Signal {
  RageClick = 'rage_click',
  DwellNoAction = 'dwell_no_action',
  AbandonedFlowStep = 'abandoned_flow_step',
  RepeatedQuery = 'repeated_query',
  PointsBalanceStare = 'points_balance_stare',
}

// ---------------------------------------------------------------------------
// Flow state - page-level context set by form-level hooks
// ---------------------------------------------------------------------------

export type FlowPage =
  | 'transfer'
  | 'booking'
  | 'profile'
  | 'search'
  | 'results'
  | 'property';

export interface FlowState {
  page: FlowPage;
  step?: string;
  amountSfc?: number;
  recipientId?: string;
}

// ---------------------------------------------------------------------------
// Device fingerprint
// ---------------------------------------------------------------------------

export interface DeviceContext {
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  language: string;
  timezone: string;
  pixelRatio: number;
}

// ---------------------------------------------------------------------------
// Session context - attached to every emitted signal
// ---------------------------------------------------------------------------

export interface SignalContext {
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

// ---------------------------------------------------------------------------
// Signal event - the payload sent to /engagement/events
// ---------------------------------------------------------------------------

export interface SignalEvent {
  signal: Signal;
  userId?: string;
  sessionId?: string;
  path: string;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
  context?: SignalContext;
}

export type SurfaceType = 'nudge_banner' | 'offer_modal' | 'help_tooltip' | 'inline_card';

export interface Surface {
  type: SurfaceType;
  anchorSelector?: string;
}

export interface Intervention {
  interventionId: string;
  surface: SurfaceType;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  theme?: InterventionTheme;
  anchorSelector?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface InterventionTheme {
  background?: string;
  text?: string;
  border?: string;
  buttonBackground?: string;
  buttonText?: string;
}

export interface EngagementConfig {
  baseUrl: string;
  getAuthHeader: () => string;
  dwellThresholdMs?: number;
  pollIntervalMs?: number;
  flushIntervalMs?: number;
  debug?: boolean;
  onRouteChange?: (callback: (path: string) => void) => () => void;
}

export interface EngagementClient {
  trackEvent: (event: SignalEvent) => void;
  trackSearch: (query: string) => void;
  getPending: () => Promise<Intervention | null>;
  flush: () => Promise<void>;
  destroy: () => void;
  getTrustScore: () => number;
  setFlowState: (state: FlowState | null) => void;
}
