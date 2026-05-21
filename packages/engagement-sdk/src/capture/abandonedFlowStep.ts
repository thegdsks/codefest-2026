import { Signal } from '../types.js';
import type { EngagementConfig, SignalEvent } from '../types.js';

const STORAGE_KEY = 'sf_last_flow_step';

export function attachAbandonedFlowStepDetector(
  onSignal: (event: SignalEvent) => void,
  config: Pick<EngagementConfig, 'onRouteChange'>,
): () => void {
  if (!config.onRouteChange) return () => undefined;

  function handleRouteChange(newPath: string): void {
    const lastStep = sessionStorage.getItem(STORAGE_KEY);

    if (lastStep !== null && lastStep !== newPath) {
      onSignal({
        signal: Signal.AbandonedFlowStep,
        path: newPath,
        timestamp: Date.now(),
        metadata: {
          abandonedStep: lastStep,
          navigatedTo: newPath,
        },
      });
    }

    sessionStorage.setItem(STORAGE_KEY, newPath);
  }

  // Record the current path immediately
  sessionStorage.setItem(STORAGE_KEY, window.location.pathname);

  const unsubscribe = config.onRouteChange(handleRouteChange);
  return () => {
    unsubscribe();
  };
}
