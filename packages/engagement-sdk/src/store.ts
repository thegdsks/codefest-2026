/**
 * store.ts
 *
 * In-memory session store scoped to a single SDK instance.
 * Tracks scroll depth, click count, route changes, and recent events.
 * Also owns the trust score (0-100) and flow state.
 */

import type { FlowState, SignalContext, DeviceContext } from './types.js';

const TRUST_INITIAL = 70;
const TRUST_MIN = 0;
const TRUST_MAX = 100;
const RECENT_EVENTS_MAX = 5;
const ROUTE_CHURN_WINDOW_MS = 60_000;
const ROUTE_CHURN_THRESHOLD = 5;
const SCROLL_HEALTHY_INTERVAL_MS = 30_000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readDevice(): DeviceContext {
  if (typeof window === 'undefined') {
    return {
      userAgent: 'server',
      viewportWidth: 0,
      viewportHeight: 0,
      language: 'en',
      timezone: 'UTC',
      pixelRatio: 1,
    };
  }
  return {
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pixelRatio: window.devicePixelRatio ?? 1,
  };
}

export interface SessionStore {
  getTrustScore: () => number;
  applyTrustDelta: (delta: number) => void;

  getScrollDepthPct: () => number;
  recordScroll: (depthPct: number) => void;

  getClickCount: () => number;
  incrementClick: () => void;

  getRouteChanges: () => number;
  recordRouteChange: () => void;

  recordEventType: (type: string) => void;
  getRecentEventTypes: () => string[];

  getFlowState: () => FlowState | null;
  setFlowState: (state: FlowState | null) => void;

  getMountTimeMs: () => number;

  buildContext: () => SignalContext;

  startScrollRecoveryTimer: () => () => void;
}

export function createSessionStore(): SessionStore {
  let trustScore = TRUST_INITIAL;
  let scrollDepthPct = 0;
  let clickCount = 0;
  let routeChangesInSession = 0;
  const recentEventTypes: string[] = [];
  let flowState: FlowState | null = null;
  const mountTimeMs = Date.now();

  // Sliding window for route churn detection
  const routeChangeTimes: number[] = [];

  const device = readDevice();

  function getTrustScore(): number {
    return trustScore;
  }

  function applyTrustDelta(delta: number): void {
    trustScore = clamp(trustScore + delta, TRUST_MIN, TRUST_MAX);
  }

  function getScrollDepthPct(): number {
    return scrollDepthPct;
  }

  function recordScroll(depthPct: number): void {
    if (depthPct > scrollDepthPct) {
      scrollDepthPct = Math.min(100, depthPct);
    }
  }

  function getClickCount(): number {
    return clickCount;
  }

  function incrementClick(): void {
    clickCount += 1;
  }

  function getRouteChanges(): number {
    return routeChangesInSession;
  }

  function recordRouteChange(): void {
    routeChangesInSession += 1;
    const now = Date.now();
    routeChangeTimes.push(now);

    // Prune old entries outside the churn window
    const cutoff = now - ROUTE_CHURN_WINDOW_MS;
    while (routeChangeTimes.length > 0 && (routeChangeTimes[0] ?? 0) < cutoff) {
      routeChangeTimes.shift();
    }

    // Rapid navigation churn penalty applied when threshold exceeded
    if (routeChangeTimes.length >= ROUTE_CHURN_THRESHOLD) {
      applyTrustDelta(-5);
    }
  }

  function recordEventType(type: string): void {
    recentEventTypes.push(type);
    if (recentEventTypes.length > RECENT_EVENTS_MAX) {
      recentEventTypes.shift();
    }
  }

  function getRecentEventTypes(): string[] {
    return recentEventTypes.slice();
  }

  function getFlowState(): FlowState | null {
    return flowState;
  }

  function setFlowState(state: FlowState | null): void {
    flowState = state;
  }

  function getMountTimeMs(): number {
    return mountTimeMs;
  }

  function buildContext(): SignalContext {
    const ctx: SignalContext = {
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      pageTimeSinceMountMs: Date.now() - mountTimeMs,
      scrollDepthPct,
      clickCountInSession: clickCount,
      routeChangesInSession,
      trustScore,
      recentEventTypes: getRecentEventTypes(),
      device,
    };
    if (flowState !== null) {
      ctx.flowState = flowState;
    }
    return ctx;
  }

  function startScrollRecoveryTimer(): () => void {
    let lastScrollDepth = scrollDepthPct;
    let lastClickCount = clickCount;

    const timer = setInterval(() => {
      const scrollProgressed = scrollDepthPct > lastScrollDepth;
      const clickBurst = clickCount - lastClickCount > 5;

      if (scrollProgressed && !clickBurst) {
        applyTrustDelta(1);
      }

      lastScrollDepth = scrollDepthPct;
      lastClickCount = clickCount;
    }, SCROLL_HEALTHY_INTERVAL_MS);

    return () => clearInterval(timer);
  }

  return {
    getTrustScore,
    applyTrustDelta,
    getScrollDepthPct,
    recordScroll,
    getClickCount,
    incrementClick,
    getRouteChanges,
    recordRouteChange,
    recordEventType,
    getRecentEventTypes,
    getFlowState,
    setFlowState,
    getMountTimeMs,
    buildContext,
    startScrollRecoveryTimer,
  };
}
