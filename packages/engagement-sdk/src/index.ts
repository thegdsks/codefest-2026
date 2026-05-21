export { createClient } from './client.js';
export type { ExtendedEngagementClient } from './client.js';
export { mountCapture } from './capture/index.js';
export { attachRageClickDetector } from './capture/rageClick.js';
export { attachDwellNoActionDetector } from './capture/dwellNoAction.js';
export { attachAbandonedFlowStepDetector } from './capture/abandonedFlowStep.js';
export { createRepeatedQueryTracker } from './capture/repeatedQuery.js';
export { attachPointsBalanceStareDetector } from './capture/pointsBalanceStare.js';
export { NudgeBanner } from './surfaces/NudgeBanner.js';
export { OfferModal } from './surfaces/OfferModal.js';
export { HelpTooltip } from './surfaces/HelpTooltip.js';
export type { NudgeBannerProps } from './surfaces/NudgeBanner.js';
export type { OfferModalProps } from './surfaces/OfferModal.js';
export type { HelpTooltipProps } from './surfaces/HelpTooltip.js';
export { TRUST_DELTAS } from './trust.js';
export { Signal } from './types.js';
export type {
  SignalEvent,
  SignalContext,
  DeviceContext,
  FlowState,
  FlowPage,
  Surface,
  SurfaceType,
  Intervention,
  InterventionTheme,
  EngagementConfig,
  EngagementClient,
} from './types.js';
