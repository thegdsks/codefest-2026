/**
 * surface-dismissal.ts
 *
 * Tracks per-surface dismissals in localStorage with a 24-hour TTL.
 * Uses the key prefix "sf.dismissed-surfaces.<surfaceId>".
 */

const KEY_PREFIX = 'sf.dismissed-surfaces.';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function storageKey(surfaceId: string): string {
  return `${KEY_PREFIX}${surfaceId}`;
}

/**
 * Returns true when the surface was dismissed within the last 24 hours.
 * Safe to call during SSR (returns false when window is unavailable).
 */
export function isDismissed(surfaceId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(storageKey(surfaceId));
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Records the current epoch as the dismissal timestamp for the given surface.
 * Silently no-ops if localStorage is unavailable.
 */
export function dismiss(surfaceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(surfaceId), String(Date.now()));
  } catch {
    // storage quota exceeded or private browsing; ignore
  }
}

/**
 * Removes all surface dismissal entries from localStorage.
 * Useful for testing and demo resets.
 */
export function clearAll(): void {
  if (typeof window === 'undefined') return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
