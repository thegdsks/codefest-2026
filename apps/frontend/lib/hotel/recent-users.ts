const STORAGE_KEY = 'sf.recentUsers';
const MAX_RECENT = 5;

export interface RecentUser {
  username: string;
  name: string;
  tier: string;
  lastLoginAt: number;
}

function readList(): RecentUser[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentUser[];
  } catch {
    return [];
  }
}

function writeList(list: RecentUser[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage quota exceeded or private browsing: silently no-op.
  }
}

/**
 * Record a successful login in the recent-users list.
 * The entry moves to the front; the list is capped at MAX_RECENT.
 */
export function recordRecentUser(user: Omit<RecentUser, 'lastLoginAt'>): void {
  const existing = readList().filter((u) => u.username !== user.username);
  const updated: RecentUser[] = [{ ...user, lastLoginAt: Date.now() }, ...existing].slice(
    0,
    MAX_RECENT
  );
  writeList(updated);
}

/**
 * Return the list ordered most-recent-first.
 */
export function getRecentUsers(): RecentUser[] {
  return readList();
}

/**
 * Remove a single entry from the list (e.g. after an account is blocked).
 */
export function removeRecentUser(username: string): void {
  writeList(readList().filter((u) => u.username !== username));
}
