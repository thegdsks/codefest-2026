/**
 * safe-storage.ts - defensive helpers for hydrating session-shaped values
 * out of sessionStorage / localStorage.
 *
 * Background: a returning user with a stale entry from a previous app
 * version (or a corrupted browser store) was landing on the login page,
 * the CustomerProvider tried JSON.parse without schema validation, the
 * downstream code crashed during hydration, and the page rendered blank
 * until cookies were cleared. parseStoredSession centralizes the
 * try/catch + shape check so every storage read is forgiving.
 *
 * Pure module: no React, no DOM access. Safe to unit-test under node:test.
 */
export interface StoredSession {
  token: string;
  userId: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a stored session blob defensively.
 *
 * Returns null whenever the input cannot be interpreted as a valid
 * StoredSession. Never throws. Unknown extra keys are ignored, which keeps
 * us forward-compatible with future field additions.
 */
export function parseStoredSession(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const { token, userId } = parsed;
  if (typeof token !== 'string' || token === '') return null;
  if (typeof userId !== 'string' || userId === '') return null;
  return { token, userId };
}

/**
 * Best-effort read from sessionStorage, swallowing storage-access errors
 * (private browsing, disabled cookies, etc.). Returns null when running on
 * the server.
 */
export function readSessionStorage(key: string): string | null {
  if (globalThis.window === undefined) return null;
  try {
    return globalThis.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Best-effort write to sessionStorage. Silent on quota / privacy errors.
 */
export function writeSessionStorage(key: string, value: string): void {
  if (globalThis.window === undefined) return;
  try {
    globalThis.sessionStorage.setItem(key, value);
  } catch {
    // Quota exceeded, private browsing: silently no-op.
  }
}

/**
 * Best-effort delete from sessionStorage. Silent on errors.
 */
export function clearSessionStorage(key: string): void {
  if (globalThis.window === undefined) return;
  try {
    globalThis.sessionStorage.removeItem(key);
  } catch {
    // Silent.
  }
}
