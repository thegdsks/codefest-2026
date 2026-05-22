'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchDashboard, fetchSession, logout as revokeToken } from '@/lib/hotel/customer-api';
import { MOCK_USER, PAST_STAYS } from '@/lib/hotel/data';
import { recordRecentUser } from '@/lib/hotel/recent-users';
import {
  clearSessionStorage,
  parseStoredSession,
  readSessionStorage,
  writeSessionStorage,
} from '@/lib/hotel/safe-storage';
import type { PastStay, TransferDetails, UserProfile } from '@/lib/hotel/types';

const SESSION_STORAGE_KEY = 'sf.session';

export interface Session {
  token: string;
  userId: string;
}

interface CustomerContextValue {
  isLoggedIn: boolean;
  /** True once the initial sessionStorage check has resolved (with or without a session). */
  isHydrated: boolean;
  user: UserProfile;
  pastStays: PastStay[];
  session: Session | null;
  pendingSessionId: string | null;
  transferDetails: TransferDetails | null;
  setPendingSessionId: (sessionId: string | null) => void;
  completeLogin: (token: string) => Promise<boolean>;
  logout: () => void;
  deductPoints: (amount: number) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setTransferDetails: (details: TransferDetails | null) => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<UserProfile>(MOCK_USER);
  const [pastStays] = useState<PastStay[]>(PAST_STAYS);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [transferDetails, setTransferDetails] = useState<TransferDetails | null>(null);

  // Resolve userId from the issued token, then reflect the real points balance.
  // The rich profile fields the backend does not expose stay sourced from MOCK_USER.
  const completeLogin = useCallback(async (token: string): Promise<boolean> => {
    const sess = await fetchSession(token);
    if (!sess.data) return false;

    const userId = sess.data.userId;
    setSession({ token, userId });
    setIsLoggedIn(true);
    setPendingSessionId(null);

    writeSessionStorage(SESSION_STORAGE_KEY, JSON.stringify({ token, userId }));

    const dash = await fetchDashboard(token, userId);
    const dashUser = dash.data?.user;
    if (dashUser) {
      setUser((prev) => {
        const updated = {
          ...prev,
          points: dashUser.pointsBalance,
          name: dashUser.name || prev.name,
          email: dashUser.email || prev.email,
        };
        // Persist for the quick-login picker. Uses the resolved name/tier from the dashboard.
        recordRecentUser({
          username: userId,
          name: updated.name,
          tier: updated.status || 'Silver',
        });
        return updated;
      });
    }
    return true;
  }, []);

  const logout = useCallback(() => {
    const currentToken = session?.token;
    if (currentToken) {
      revokeToken(currentToken).catch((err) => {
        console.error('[auth] logout revoke failed', err);
      });
    }
    clearSessionStorage(SESSION_STORAGE_KEY);
    setIsLoggedIn(false);
    setSession(null);
    setPendingSessionId(null);
    setTransferDetails(null);
    setUser(MOCK_USER);
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsHydrated(true);
      return;
    }
    // Defensive cleanup for users carrying the legacy sf.token cookie from
    // builds that wrote it. The cookie is no longer authoritative; flush it
    // so it cannot interfere with future routing decisions.
    if (typeof document !== 'undefined' && document.cookie.includes('sf.token=')) {
      document.cookie = 'sf.token=; path=/; max-age=0; SameSite=Lax';
    }
    const parsed = parseStoredSession(readSessionStorage(SESSION_STORAGE_KEY));
    if (!parsed) {
      // Corrupt or absent storage: ensure we do not keep a broken value
      // around that would re-poison the next hydration attempt, and resolve
      // hydration immediately so the UI can render a logged-out state.
      clearSessionStorage(SESSION_STORAGE_KEY);
      setIsHydrated(true);
      return;
    }
    // Always finish hydration, even when completeLogin throws or the network
    // is offline; otherwise the whole tree stays in the "checking" state and
    // pages that gate on isHydrated render nothing.
    completeLogin(parsed.token)
      .catch((err) => {
        console.error('[auth] hydration completeLogin failed', err);
        clearSessionStorage(SESSION_STORAGE_KEY);
      })
      .finally(() => {
        setIsHydrated(true);
      });
  }, [completeLogin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleExpired = () => {
      clearSessionStorage(SESSION_STORAGE_KEY);
      setIsLoggedIn(false);
      setSession(null);
      setUser(MOCK_USER);
    };
    window.addEventListener('sf:session-expired', handleExpired);
    return () => window.removeEventListener('sf:session-expired', handleExpired);
  }, []);

  const deductPoints = useCallback((amount: number) => {
    setUser((prev) => ({
      ...prev,
      points: Math.max((prev.points ?? 0) - amount, 0),
    }));
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  const value = useMemo<CustomerContextValue>(
    () => ({
      isLoggedIn,
      isHydrated,
      user,
      pastStays,
      session,
      pendingSessionId,
      transferDetails,
      setPendingSessionId,
      completeLogin,
      logout,
      deductPoints,
      updateProfile,
      setTransferDetails,
    }),
    [
      isLoggedIn,
      isHydrated,
      user,
      pastStays,
      session,
      pendingSessionId,
      transferDetails,
      completeLogin,
      logout,
      deductPoints,
      updateProfile,
    ]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return ctx;
}
