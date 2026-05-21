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
import type { PastStay, TransferDetails, UserProfile } from '@/lib/hotel/types';

export interface Session {
  token: string;
  userId: string;
}

interface CustomerContextValue {
  isLoggedIn: boolean;
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

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sf.session', JSON.stringify({ token, userId }));
    }

    const dash = await fetchDashboard(token, userId);
    const dashUser = dash.data?.user;
    if (dashUser) {
      setUser((prev) => ({
        ...prev,
        points: dashUser.pointsBalance,
        name: dashUser.name || prev.name,
        email: dashUser.email || prev.email,
      }));
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
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('sf.session');
    }
    setIsLoggedIn(false);
    setSession(null);
    setPendingSessionId(null);
    setTransferDetails(null);
    setUser(MOCK_USER);
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('sf.session');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { token: string; userId: string };
      if (parsed.token) {
        completeLogin(parsed.token);
      }
    } catch {
      sessionStorage.removeItem('sf.session');
    }
  }, [completeLogin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleExpired = () => {
      // TODO: consider routing to /login after state is cleared
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('sf.session');
      }
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
      points: Math.max(prev.points || 0 - amount, 0),
    }));
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  const value = useMemo<CustomerContextValue>(
    () => ({
      isLoggedIn,
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
