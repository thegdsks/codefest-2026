import { Signal } from '../types.js';
import type { SignalEvent } from '../types.js';

const CLICK_WINDOW_MS = 1000;
const CLICK_THRESHOLD = 3;

interface ClickRecord {
  target: EventTarget | null;
  time: number;
}

export function attachRageClickDetector(
  onSignal: (event: SignalEvent) => void,
): () => void {
  let recent: ClickRecord[] = [];

  function handleClick(e: MouseEvent): void {
    const now = Date.now();
    recent.push({ target: e.target, time: now });
    recent = recent.filter((r) => now - r.time <= CLICK_WINDOW_MS);

    const sameCurrent = recent.filter((r) => r.target === e.target);
    if (sameCurrent.length >= CLICK_THRESHOLD) {
      onSignal({
        signal: Signal.RageClick,
        path: window.location.pathname,
        timestamp: now,
        metadata: {
          clickCount: sameCurrent.length,
          element: (e.target as HTMLElement | null)?.tagName ?? 'unknown',
        },
      });
      // Reset to avoid firing repeatedly for the same burst
      recent = recent.filter((r) => r.target !== e.target);
    }
  }

  document.addEventListener('click', handleClick, true);
  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}
