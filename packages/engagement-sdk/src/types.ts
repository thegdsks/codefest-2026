export enum Signal {
  RageClick = 'rage_click',
  DwellNoAction = 'dwell_no_action',
  AbandonedFlowStep = 'abandoned_flow_step',
  RepeatedQuery = 'repeated_query',
  PointsBalanceStare = 'points_balance_stare',
}

export interface SignalEvent {
  signal: Signal;
  userId?: string;
  sessionId?: string;
  path: string;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

export type SurfaceType = 'nudge_banner' | 'offer_modal' | 'help_tooltip';

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
  onRouteChange?: (callback: (path: string) => void) => () => void;
}

export interface EngagementClient {
  trackEvent: (event: SignalEvent) => void;
  trackSearch: (query: string) => void;
  getPending: () => Promise<Intervention | null>;
  flush: () => Promise<void>;
  destroy: () => void;
}
