import { Signal } from '../types.js';
import type { SignalEvent } from '../types.js';

const DEFAULT_DWELL_MS = 30_000;
const INTERACTION_EVENTS = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'] as const;

export function attachDwellNoActionDetector(
  onSignal: (event: SignalEvent) => void,
  thresholdMs: number = DEFAULT_DWELL_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  function reset(): void {
    fired = false;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      if (!fired) {
        fired = true;
        onSignal({
          signal: Signal.DwellNoAction,
          path: window.location.pathname,
          timestamp: Date.now(),
          metadata: { thresholdMs },
        });
      }
    }, thresholdMs);
  }

  function handleInteraction(): void {
    reset();
  }

  for (const evt of INTERACTION_EVENTS) {
    document.addEventListener(evt, handleInteraction, { passive: true });
  }

  // Start the timer immediately
  reset();

  return () => {
    if (timer !== null) clearTimeout(timer);
    for (const evt of INTERACTION_EVENTS) {
      document.removeEventListener(evt, handleInteraction);
    }
  };
}
