'use client';

/**
 * Animate a numeric counter from one value to another using requestAnimationFrame.
 *
 * Uses an ease-out cubic easing: progress = 1 - (1 - t)^3.
 *
 * Safe for React Strict Mode (double-mount) because the returned cancel function
 * stops the animation immediately. Callers should invoke it in a useEffect
 * cleanup.
 *
 * @param from      Starting value (integer)
 * @param to        Target value (integer)
 * @param durationMs Total animation duration in milliseconds
 * @param onTick    Called each frame with the current rounded value
 * @param onDone    Optional callback fired once the animation completes
 * @returns A cancel function that stops the animation mid-flight
 */
export function animateCounter(
  from: number,
  to: number,
  durationMs: number,
  onTick: (value: number) => void,
  onDone?: () => void
): () => void {
  let rafId = 0;
  let startTime: number | null = null;
  let cancelled = false;

  function tick(now: number) {
    if (cancelled) return;

    if (startTime === null) startTime = now;
    const elapsed = now - startTime;
    const t = Math.min(elapsed / durationMs, 1);

    // Ease-out cubic
    const eased = 1 - (1 - t) ** 3;
    const current = Math.round(from + (to - from) * eased);

    onTick(current);

    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      onTick(to);
      onDone?.();
    }
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
