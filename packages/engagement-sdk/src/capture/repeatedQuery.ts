import { Signal } from '../types.js';
import type { SignalEvent } from '../types.js';

const REPEAT_THRESHOLD = 3;

export function createRepeatedQueryTracker(
  onSignal: (event: SignalEvent) => void,
): (query: string) => void {
  const counts = new Map<string, number>();

  return function trackSearch(query: string): void {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return;

    const count = (counts.get(normalized) ?? 0) + 1;
    counts.set(normalized, count);

    if (count === REPEAT_THRESHOLD) {
      onSignal({
        signal: Signal.RepeatedQuery,
        path: window.location.pathname,
        timestamp: Date.now(),
        metadata: {
          query: normalized,
          count,
        },
      });
    }
  };
}
