import type { EngagementConfig, SignalEvent } from '../types.js';
import { attachRageClickDetector } from './rageClick.js';
import { attachDwellNoActionDetector } from './dwellNoAction.js';
import { attachAbandonedFlowStepDetector } from './abandonedFlowStep.js';
import { createRepeatedQueryTracker } from './repeatedQuery.js';
import { attachPointsBalanceStareDetector } from './pointsBalanceStare.js';

export interface CaptureOrchestrator {
  trackSearch: (query: string) => void;
  destroy: () => void;
}

export function mountCapture(
  onSignal: (event: SignalEvent) => void,
  config: EngagementConfig,
): CaptureOrchestrator {
  const teardowns: Array<() => void> = [];

  // Rage click
  teardowns.push(attachRageClickDetector(onSignal));

  // Dwell without action
  teardowns.push(
    attachDwellNoActionDetector(onSignal, config.dwellThresholdMs),
  );

  // Abandoned flow step (only if onRouteChange supplied)
  if (config.onRouteChange) {
    teardowns.push(attachAbandonedFlowStepDetector(onSignal, config));
  }

  // Points balance stare
  teardowns.push(attachPointsBalanceStareDetector(onSignal));

  // Repeated query tracker
  const trackSearch = createRepeatedQueryTracker(onSignal);

  function destroy(): void {
    for (const teardown of teardowns) {
      teardown();
    }
  }

  return { trackSearch, destroy };
}
