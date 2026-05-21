'use client';

import {
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronDown,
  ChevronUp,
  EyeOff,
  LogOut,
  MapPin,
  Radio,
  RefreshCw,
  Shuffle,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import { type DemoEventPayload, type DemoEventType, writeDemoEvent } from '@/lib/admin-api';
import {
  type EngagementEventResponse,
  fireEngagementSignal,
  login as loginRequest,
  mutateDemoUser,
  type UserMutation,
  verifyMfa,
} from '@/lib/hotel/customer-api';
import {
  getDemoLoginContext,
  setDemoLoginContext,
  setForceHighRiskTransfer,
} from '@/lib/hotel/demo-context';
import { useSurfaceEligibility } from '@/lib/hotel/use-surface-eligibility';

function publishDemoEvent(type: DemoEventType, payload?: DemoEventPayload): void {
  writeDemoEvent({ type, payload }).catch(() => {
    // fire-and-forget: demo panel events are best-effort
  });
}

const LOCATIONS = ['New York', 'Lagos', 'Tokyo', 'Sydney', 'Berlin', 'Moscow'];
const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'unknown'];
const QUICK_USERS = ['user001', 'user002', 'user003'];

async function resolveTokenAfterMfa(
  sessionId: string,
  completeLogin: (token: string) => Promise<boolean>,
  setPendingSessionId: (id: string | null) => void
): Promise<string | null> {
  setPendingSessionId(sessionId);
  const mfaRes = await verifyMfa(sessionId, '123456');
  if (mfaRes.error) return mfaRes.error.message || 'MFA verification failed.';
  const ok = await completeLogin(mfaRes.data.token);
  return ok ? null : 'Session could not be established after MFA.';
}

interface SignalStatus {
  loading: boolean;
  result: EngagementEventResponse | null;
  error: string | null;
}

export default function DemoPanel() {
  const router = useRouter();
  const { isLoggedIn, user, session, logout, completeLogin, setPendingSessionId } = useCustomer();
  const {
    surfaces,
    isLoading: surfacesLoading,
    refetch: refetchSurfaces,
  } = useSurfaceEligibility();

  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [forcedHighRisk, setForcedHighRisk] = useState(false);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [mutating, setMutating] = useState<string | null>(null);
  const [signalStatus, setSignalStatus] = useState<SignalStatus>({
    loading: false,
    result: null,
    error: null,
  });

  async function handleFireSignal(signal: string, params: Record<string, number>) {
    if (!session?.token || !session?.userId) {
      setSignalStatus({ loading: false, result: null, error: 'Not logged in.' });
      return;
    }
    setSignalStatus({ loading: true, result: null, error: null });
    try {
      const res = await fireEngagementSignal(session.token, signal, session.userId, params);
      if (res.error || !res.data) {
        setSignalStatus({
          loading: false,
          result: null,
          error: res.error?.message ?? 'Signal failed.',
        });
        return;
      }
      setSignalStatus({ loading: false, result: res.data, error: null });
      publishDemoEvent('SIGNAL_TRIGGER', { signal });
    } catch (e) {
      setSignalStatus({
        loading: false,
        result: null,
        error: e instanceof Error ? e.message : 'Unexpected error.',
      });
    }
  }

  const initial = getDemoLoginContext();
  const [location, setLocation] = useState(initial.location ?? 'New York');
  const [deviceType, setDeviceType] = useState(initial.deviceType ?? 'desktop');
  const [deviceId, setDeviceId] = useState(initial.deviceId ?? 'device-web-demo');
  // Known device ids for the currently logged-in user. Populated by fetching the
  // UserProfile demo sub-object from the backend. Used for the device preview label.
  const [knownDevices, setKnownDevices] = useState<string[]>([]);

  useEffect(() => {
    if (!session?.token || !session?.userId) {
      setKnownDevices([]);
      return;
    }
    const apiBase =
      typeof window !== 'undefined'
        ? window.location.origin.replace(/:\d+$/, ':3000')
        : 'http://localhost:3000';
    fetch(`${apiBase}/user/profile?userId=${encodeURIComponent(session.userId)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const devices = body?.data?.demo?.knownDevicesLast30d;
        if (Array.isArray(devices)) setKnownDevices(devices);
      })
      .catch(() => {
        // Best-effort; the label falls back to showing the raw id.
      });
  }, [session?.token, session?.userId]);

  function applyContext() {
    setDemoLoginContext({ location, deviceId, deviceType });
    publishDemoEvent('LOCATION_OVERRIDE', { location, deviceId });
  }

  async function switchUser(username: string) {
    setSwitching(username);
    setSwitchError(null);
    try {
      const loginRes = await loginRequest(username, 'Password1', getDemoLoginContext());
      if (loginRes.error) {
        setSwitchError(loginRes.error.message || 'Login failed.');
        setSwitching(null);
        return;
      }
      let err: string | null = null;
      if (loginRes.data.status === 'MFA_REQUIRED') {
        err = await resolveTokenAfterMfa(
          loginRes.data.sessionId,
          completeLogin,
          setPendingSessionId
        );
      } else {
        const ok = await completeLogin(loginRes.data.token);
        err = ok ? null : 'Session could not be established.';
      }
      if (err) {
        setSwitchError(err);
        setSwitching(null);
        return;
      }
      setSwitching(null);
      publishDemoEvent('USER_SWITCH', { to: username });
      router.push('/profile');
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'Unexpected error.');
      setSwitching(null);
    }
  }

  function handleForceHighRisk() {
    setForceHighRiskTransfer(true);
    setForcedHighRisk(true);
    setTimeout(() => setForcedHighRisk(false), 3000);
    publishDemoEvent('FORCE_HIGH_RISK', { enabled: true });
  }

  function handleResetAll() {
    sessionStorage.clear();
    logout();
    window.location.href = '/';
  }

  async function mutateAndRefetch(key: string, mutation: UserMutation) {
    if (!session?.userId) return;
    setMutating(key);
    try {
      await mutateDemoUser(session.userId, mutation);
    } finally {
      setMutating(null);
      refetchSurfaces();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open demo debugger"
        className="fixed bottom-5 right-5 z-[9999] w-12 h-12 rounded-full bg-[#775a19] text-white flex items-center justify-center shadow-lg hover:bg-[#5c4312] transition-colors"
      >
        <Bug size={20} />
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[9998] w-[360px] max-h-[80vh] overflow-y-auto bg-[#fbf9f8] border border-[#ffdea5] shadow-2xl rounded-sm flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-[#775a19] text-white sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <Bug size={15} />
              <span className="font-sans font-bold text-sm tracking-wide">Demo Debugger</span>
              <span className="bg-[#ffdea5] text-[#261900] text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm">
                DEMO
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close demo debugger"
              className="text-white/80 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans flex items-center gap-1.5">
                <User size={11} />
                Current Session
              </p>
              <div className="bg-white border border-gray-100 p-3 text-xs font-sans space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">
                    Logged in
                  </span>
                  <span className="font-semibold">{isLoggedIn ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">
                    User ID
                  </span>
                  <span className="font-mono font-semibold">{session?.userId ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">Points</span>
                  <span className="font-semibold">{(user.points ?? 0).toLocaleString()} SFC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 uppercase tracking-wider text-[10px]">Token</span>
                  <span className="font-mono text-[11px]">
                    {session?.token ? `${session.token.slice(0, 8)}...` : '-'}
                  </span>
                </div>
                {isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      router.push('/');
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 bg-black text-white text-[10px] font-bold uppercase tracking-widest py-2 hover:bg-[#775a19] transition-colors"
                  >
                    <LogOut size={11} />
                    Logout
                  </button>
                )}
              </div>
            </section>

            {!isLoggedIn && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans flex items-center gap-1.5">
                  <User size={11} />
                  Quick User Switch
                </p>
                <div className="flex gap-2">
                  {QUICK_USERS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      disabled={switching !== null}
                      onClick={() => switchUser(u)}
                      className="flex-1 text-[10px] font-bold font-mono uppercase tracking-wider border border-[#775a19] text-[#775a19] py-2 hover:bg-[#775a19] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {switching === u ? '...' : u}
                    </button>
                  ))}
                </div>
                {switchError && (
                  <p className="mt-2 text-[10px] text-red-600 font-sans">{switchError}</p>
                )}
              </section>
            )}

            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans flex items-center gap-1.5">
                <MapPin size={11} />
                Login Context Overrides
              </p>
              <div className="bg-white border border-gray-100 p-3 space-y-3">
                <div>
                  <label
                    htmlFor="demo-location"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block mb-1 font-sans"
                  >
                    Location
                  </label>
                  <select
                    id="demo-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full text-xs font-sans border-b border-gray-200 focus:border-[#775a19] focus:outline-none bg-transparent py-1.5"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="demo-device-type"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block mb-1 font-sans flex items-center gap-1"
                  >
                    <Smartphone size={9} />
                    Device Type
                  </label>
                  <select
                    id="demo-device-type"
                    value={deviceType}
                    onChange={(e) => setDeviceType(e.target.value)}
                    className="w-full text-xs font-sans border-b border-gray-200 focus:border-[#775a19] focus:outline-none bg-transparent py-1.5"
                  >
                    {DEVICE_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="demo-device-id"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block mb-1 font-sans"
                  >
                    Device ID
                  </label>
                  <input
                    id="demo-device-id"
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="w-full text-xs font-sans border-b border-gray-200 focus:border-[#775a19] focus:outline-none bg-transparent py-1.5"
                  />
                  {isLoggedIn && deviceId && (
                    <p className="mt-1 text-[9px] font-sans">
                      {knownDevices.includes(deviceId) ? (
                        <span className="text-green-600">
                          Device: {deviceId} (known) - transfers will not trigger MFA
                        </span>
                      ) : (
                        <span className="text-amber-600">
                          Device: {deviceId} (unseen) - large transfer will trigger MFA
                        </span>
                      )}
                    </p>
                  )}
                  {isLoggedIn && !deviceId && (
                    <p className="mt-1 text-[9px] text-amber-600 font-sans">
                      To trigger MFA: pick any device id NOT in user001's known list.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={applyContext}
                  className="w-full text-[10px] font-bold uppercase tracking-widest border border-[#775a19] text-[#775a19] py-2 hover:bg-[#ffdea5]/30 transition-colors font-sans"
                >
                  Apply to Next Login
                </button>
              </div>
            </section>

            {isLoggedIn && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans">
                  Transfer Demo
                </p>
                <button
                  type="button"
                  onClick={handleForceHighRisk}
                  className="w-full text-[10px] font-bold uppercase tracking-widest border border-black text-black py-2.5 hover:bg-black hover:text-white transition-colors font-sans"
                >
                  {forcedHighRisk ? 'Flag set - submit transfer' : 'Force next transfer high-risk'}
                </button>
                <p className="mt-1.5 text-[9px] text-gray-500 font-sans">
                  Forces MFA on the next transfer regardless of amount.
                </p>
                {forcedHighRisk && (
                  <p className="mt-1 text-[9px] text-[#775a19] font-sans font-semibold text-center">
                    Go to Transfer page and submit any transfer to trigger MFA.
                  </p>
                )}
              </section>
            )}

            {isLoggedIn && (
              <section className="border-t border-gray-100 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans flex items-center gap-1.5">
                  <Radio size={11} />
                  Trigger Engagement Signal
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={signalStatus.loading}
                    onClick={() => handleFireSignal('rage_click', { count: 8 })}
                    className="w-full text-[10px] font-bold uppercase tracking-widest border border-fuchsia-400 text-fuchsia-700 py-2 hover:bg-fuchsia-50 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fire rage_click (count=8)
                  </button>
                  <button
                    type="button"
                    disabled={signalStatus.loading}
                    onClick={() => handleFireSignal('dwell_no_action', { dwellMs: 45000 })}
                    className="w-full text-[10px] font-bold uppercase tracking-widest border border-fuchsia-400 text-fuchsia-700 py-2 hover:bg-fuchsia-50 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fire dwell_no_action (45s)
                  </button>
                  <button
                    type="button"
                    disabled={signalStatus.loading}
                    onClick={() => handleFireSignal('points_balance_stare', { stareMs: 60000 })}
                    className="w-full text-[10px] font-bold uppercase tracking-widest border border-fuchsia-400 text-fuchsia-700 py-2 hover:bg-fuchsia-50 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fire points_balance_stare (60s)
                  </button>
                  <button
                    type="button"
                    disabled={signalStatus.loading}
                    onClick={() => handleFireSignal('abandoned_flow_step', {})}
                    className="w-full text-[10px] font-bold uppercase tracking-widest border border-fuchsia-400 text-fuchsia-700 py-2 hover:bg-fuchsia-50 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fire abandoned_flow_step
                  </button>
                </div>
                {signalStatus.loading && (
                  <p className="mt-2 text-[10px] text-gray-400 font-sans text-center">
                    Sending signal...
                  </p>
                )}
                {signalStatus.error && (
                  <p className="mt-2 text-[10px] text-red-600 font-sans">{signalStatus.error}</p>
                )}
                {signalStatus.result && (
                  <div className="mt-2 p-2 bg-fuchsia-50 border border-fuchsia-100 text-[10px] font-mono space-y-0.5">
                    <p className="font-bold text-fuchsia-700 font-sans">
                      Signal fired - check admin to see the decision
                    </p>
                    <p>action: {signalStatus.result.action}</p>
                    <p>surface: {signalStatus.result.surface ?? 'none'}</p>
                    <p>score: {signalStatus.result.score}</p>
                    <p>engine: {signalStatus.result.engineLayer}</p>
                    <p>reason: {signalStatus.result.reasonCode}</p>
                    {signalStatus.result.decisionId && <p>id: {signalStatus.result.decisionId}</p>}
                    {signalStatus.result.copy && (
                      <p className="italic text-gray-600 break-words">
                        copy: {signalStatus.result.copy}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {isLoggedIn && (
              <section className="border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setEligibilityOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans"
                >
                  <span>Surface Eligibility</span>
                  {eligibilityOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {eligibilityOpen && (
                  <div className="space-y-2">
                    {/* Quick Mutations */}
                    <div className="bg-[#ffdea5]/20 border border-[#ffdea5] p-2 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#775a19] font-sans">
                        Quick Mutations
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={mutating !== null}
                          onClick={() =>
                            mutateAndRefetch('platinum', { tier: 'Platinum', loyaltyScore: 1000 })
                          }
                          className="text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] px-2 py-1 hover:bg-[#775a19] hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {mutating === 'platinum' ? '...' : 'Make Platinum'}
                        </button>
                        <button
                          type="button"
                          disabled={mutating !== null}
                          onClick={() =>
                            mutateAndRefetch('complete-profile', { profileCompletion: 95 })
                          }
                          className="text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] px-2 py-1 hover:bg-[#775a19] hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {mutating === 'complete-profile' ? '...' : 'Complete Profile'}
                        </button>
                        <button
                          type="button"
                          disabled={mutating !== null}
                          onClick={() =>
                            mutateAndRefetch('reset-gold', {
                              tier: 'Gold',
                              profileCompletion: 50,
                              loyaltyScore: 500,
                            })
                          }
                          className="text-[9px] font-bold uppercase tracking-wider border border-black text-black px-2 py-1 hover:bg-black hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {mutating === 'reset-gold' ? '...' : 'Reset Gold + 50%'}
                        </button>
                      </div>
                    </div>

                    {Object.keys(surfaces).length === 0 && !surfacesLoading && (
                      <p className="text-[9px] text-gray-400 font-sans">
                        No data yet. Log in to evaluate surfaces.
                      </p>
                    )}
                    {surfacesLoading && (
                      <p className="text-[9px] text-gray-400 font-sans">Loading...</p>
                    )}
                    {Object.values(surfaces).map((s) => {
                      const statePillClass: Record<string, string> = {
                        SHOWN: 'bg-emerald-100 text-emerald-700',
                        HIDDEN: 'bg-gray-100 text-gray-500',
                        PENDING: 'bg-amber-100 text-amber-700',
                        COMPLETED: 'bg-blue-100 text-blue-700',
                      };
                      const pillClass = statePillClass[s.state] ?? 'bg-gray-100 text-gray-500';
                      return (
                        <div
                          key={s.surfaceId}
                          className="bg-white border border-gray-100 p-2.5 text-[10px] font-sans space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[9px] text-gray-600 break-all">
                              {s.surfaceId}
                            </span>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-wider ${pillClass}`}
                            >
                              {s.state}
                            </span>
                          </div>
                          <p className="text-gray-500 text-[9px]">
                            rule:{' '}
                            <span className="font-mono text-gray-700">
                              {s.ruleId ?? 'no rule matched'}
                            </span>
                          </p>
                          <p className="text-gray-400 text-[9px] leading-snug">{s.reason}</p>
                          {s.nextAction && (
                            <button
                              type="button"
                              disabled={mutating !== null}
                              onClick={() =>
                                mutateAndRefetch(
                                  `${s.surfaceId}-action`,
                                  (s.nextAction?.delta ?? {}) as UserMutation
                                )
                              }
                              className="w-full text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] py-1 hover:bg-[#ffdea5]/30 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {mutating === `${s.surfaceId}-action` ? '...' : s.nextAction.label}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      disabled={surfacesLoading}
                      onClick={() => {
                        publishDemoEvent('SURFACE_REEVALUATE');
                        refetchSurfaces();
                      }}
                      className="w-full text-[10px] font-bold uppercase tracking-widest border border-[#775a19] text-[#775a19] py-1.5 hover:bg-[#ffdea5]/30 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {surfacesLoading ? 'Evaluating...' : 'Re-evaluate'}
                    </button>
                  </div>
                )}
              </section>
            )}

            <section className="border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={handleResetAll}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-600 border border-red-200 py-2.5 hover:bg-red-50 transition-colors font-sans"
              >
                <RefreshCw size={11} />
                Reset All Local State
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
