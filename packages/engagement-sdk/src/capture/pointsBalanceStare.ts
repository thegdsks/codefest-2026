import { Signal } from '../types.js';
import type { SignalEvent } from '../types.js';

const DATA_ATTR = 'data-signal';
const SIGNAL_VALUE = 'points_balance';
const DEFAULT_STARE_MS = 10_000;

export function attachPointsBalanceStareDetector(
  onSignal: (event: SignalEvent) => void,
  stareThresholdMs: number = DEFAULT_STARE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  let observer: IntersectionObserver | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer(el: Element): void {
    fired = false;
    clearTimer();
    timer = setTimeout(() => {
      if (!fired) {
        fired = true;
        onSignal({
          signal: Signal.PointsBalanceStare,
          path: window.location.pathname,
          timestamp: Date.now(),
          metadata: {
            stareThresholdMs,
            element: el.tagName.toLowerCase(),
          },
        });
      }
    }, stareThresholdMs);
  }

  function observe(): void {
    const targetList = document.querySelectorAll(`[${DATA_ATTR}="${SIGNAL_VALUE}"]`);
    const targets = Array.from(targetList);
    if (targets.length === 0) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            startTimer(entry.target);
          } else {
            clearTimer();
            fired = false;
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const target of targets) {
      observer.observe(target);
    }
  }

  // Observe when DOM is ready, then re-check on mutations
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  } else {
    observe();
  }

  // MutationObserver to handle dynamically added elements
  const mutationObserver = new MutationObserver(() => {
    if (observer !== null) {
      observer.disconnect();
      observer = null;
    }
    clearTimer();
    observe();
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    clearTimer();
    observer?.disconnect();
    mutationObserver.disconnect();
  };
}
