'use strict';

var jsxRuntime = require('react/jsx-runtime');
var react = require('react');

// src/store.ts
var TRUST_INITIAL = 70;
var TRUST_MIN = 0;
var TRUST_MAX = 100;
var RECENT_EVENTS_MAX = 5;
var ROUTE_CHURN_WINDOW_MS = 6e4;
var ROUTE_CHURN_THRESHOLD = 5;
var SCROLL_HEALTHY_INTERVAL_MS = 3e4;
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function readDevice() {
  if (typeof window === "undefined") {
    return {
      userAgent: "server",
      viewportWidth: 0,
      viewportHeight: 0,
      language: "en",
      timezone: "UTC",
      pixelRatio: 1
    };
  }
  return {
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pixelRatio: window.devicePixelRatio ?? 1
  };
}
function createSessionStore() {
  let trustScore = TRUST_INITIAL;
  let scrollDepthPct = 0;
  let clickCount = 0;
  let routeChangesInSession = 0;
  const recentEventTypes = [];
  let flowState = null;
  const mountTimeMs = Date.now();
  const routeChangeTimes = [];
  const device = readDevice();
  function getTrustScore() {
    return trustScore;
  }
  function applyTrustDelta(delta) {
    trustScore = clamp(trustScore + delta, TRUST_MIN, TRUST_MAX);
  }
  function getScrollDepthPct() {
    return scrollDepthPct;
  }
  function recordScroll(depthPct) {
    if (depthPct > scrollDepthPct) {
      scrollDepthPct = Math.min(100, depthPct);
    }
  }
  function getClickCount() {
    return clickCount;
  }
  function incrementClick() {
    clickCount += 1;
  }
  function getRouteChanges() {
    return routeChangesInSession;
  }
  function recordRouteChange() {
    routeChangesInSession += 1;
    const now = Date.now();
    routeChangeTimes.push(now);
    const cutoff = now - ROUTE_CHURN_WINDOW_MS;
    while (routeChangeTimes.length > 0 && (routeChangeTimes[0] ?? 0) < cutoff) {
      routeChangeTimes.shift();
    }
    if (routeChangeTimes.length >= ROUTE_CHURN_THRESHOLD) {
      applyTrustDelta(-5);
    }
  }
  function recordEventType(type) {
    recentEventTypes.push(type);
    if (recentEventTypes.length > RECENT_EVENTS_MAX) {
      recentEventTypes.shift();
    }
  }
  function getRecentEventTypes() {
    return recentEventTypes.slice();
  }
  function getFlowState() {
    return flowState;
  }
  function setFlowState(state) {
    flowState = state;
  }
  function getMountTimeMs() {
    return mountTimeMs;
  }
  function buildContext() {
    const ctx = {
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      pageTimeSinceMountMs: Date.now() - mountTimeMs,
      scrollDepthPct,
      clickCountInSession: clickCount,
      routeChangesInSession,
      trustScore,
      recentEventTypes: getRecentEventTypes(),
      device
    };
    if (flowState !== null) {
      ctx.flowState = flowState;
    }
    return ctx;
  }
  function startScrollRecoveryTimer() {
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
    startScrollRecoveryTimer
  };
}

// src/types.ts
var Signal = /* @__PURE__ */ ((Signal2) => {
  Signal2["RageClick"] = "rage_click";
  Signal2["DwellNoAction"] = "dwell_no_action";
  Signal2["AbandonedFlowStep"] = "abandoned_flow_step";
  Signal2["RepeatedQuery"] = "repeated_query";
  Signal2["PointsBalanceStare"] = "points_balance_stare";
  return Signal2;
})(Signal || {});

// src/trust.ts
var TRUST_DELTAS = {
  // Degradation signals
  ["rage_click" /* RageClick */]: -8,
  ["dwell_no_action" /* DwellNoAction */]: -3,
  ["abandoned_flow_step" /* AbandonedFlowStep */]: -4,
  ["repeated_query" /* RepeatedQuery */]: -2,
  ["points_balance_stare" /* PointsBalanceStare */]: 0,
  // Healthy signals (fired via trackHealthyEvent)
  completed_booking: 10,
  completed_transfer: 5,
  search_result_click: 2
};

// src/client.ts
var DEFAULT_FLUSH_INTERVAL_MS = 5e3;
var BATCH_DEBOUNCE_MS = 500;
var SAMPLE_RATE_MAX = 5;
var SAMPLE_RATE_WINDOW_MS = 1e4;
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function createClient(config) {
  const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const debug = config.debug ?? false;
  const store = createSessionStore();
  let pendingBuffer = [];
  let offlineQueue = [];
  let debounceTimer = null;
  let flushTimer = null;
  const sampleCounts = /* @__PURE__ */ new Map();
  let scrollListenerTeardown = null;
  let scrollRecoveryTeardown = null;
  let routeChangeTeardown = null;
  function log(msg, payload) {
    if (!debug) return;
    console.log(`[engagement-sdk] ${msg}`, payload !== void 0 ? payload : "");
  }
  function isSamplingAllowed(signal) {
    const now = Date.now();
    const entry = sampleCounts.get(signal);
    if (!entry || now - entry.windowStart > SAMPLE_RATE_WINDOW_MS) {
      sampleCounts.set(signal, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= SAMPLE_RATE_MAX) {
      log(`sampling suppressed ${signal} (${entry.count} in last ${SAMPLE_RATE_WINDOW_MS}ms)`);
      return false;
    }
    entry.count += 1;
    return true;
  }
  async function sendBatch(events) {
    if (events.length === 0) return true;
    try {
      const res = await fetch(`${config.baseUrl}/engagement/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: config.getAuthHeader(),
          "X-Correlation-Id": generateCorrelationId()
        },
        body: JSON.stringify({ events })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log(`batch sent ${events.length} events`);
      return true;
    } catch (_err) {
      log("batch send failed, queuing for retry", _err);
      return false;
    }
  }
  async function drainOfflineQueue() {
    if (offlineQueue.length === 0) return;
    const toRetry = offlineQueue.slice();
    offlineQueue = [];
    const ok = await sendBatch(toRetry);
    if (!ok) {
      const combined = [...toRetry, ...offlineQueue];
      offlineQueue = combined.slice(-50);
    }
  }
  async function flushPending() {
    if (pendingBuffer.length === 0) return;
    const toSend = pendingBuffer.slice();
    pendingBuffer = [];
    await drainOfflineQueue();
    const ok = await sendBatch(toSend);
    if (!ok) {
      const combined = [...toSend, ...offlineQueue];
      offlineQueue = combined.slice(-50);
    }
  }
  function scheduleBatchFlush() {
    if (debounceTimer !== null) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPending().catch((_err) => {
        log("debounce flush error", _err);
      });
    }, BATCH_DEBOUNCE_MS);
  }
  function startFlushTimer() {
    if (flushTimer !== null) return;
    flushTimer = setInterval(() => {
      flushPending().catch((_err) => {
        log("periodic flush error", _err);
      });
    }, flushIntervalMs);
  }
  function stopFlushTimer() {
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }
  function attachBrowserListeners() {
    if (typeof window === "undefined") return;
    function handleClick() {
      store.incrementClick();
    }
    function handleScroll() {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) return;
      const pct = Math.round(scrolled / total * 100);
      store.recordScroll(pct);
    }
    function handleOnline() {
      drainOfflineQueue().catch((_err) => {
        log("online drain error", _err);
      });
    }
    document.addEventListener("click", handleClick, { capture: true, passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("online", handleOnline);
    scrollListenerTeardown = () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("scroll", handleScroll);
      window.removeEventListener("online", handleOnline);
    };
    scrollRecoveryTeardown = store.startScrollRecoveryTimer();
  }
  function attachRouteListener() {
    if (!config.onRouteChange) return;
    const unsub = config.onRouteChange(() => {
      store.recordRouteChange();
    });
    routeChangeTeardown = unsub;
  }
  function onBeforeUnload() {
    flushPending().catch(() => {
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
    startFlushTimer();
    attachBrowserListeners();
  }
  attachRouteListener();
  function trackEvent(event) {
    if (!isSamplingAllowed(event.signal)) return;
    const delta = TRUST_DELTAS[event.signal];
    if (delta !== void 0 && delta !== 0) {
      store.applyTrustDelta(delta);
    }
    store.recordEventType(event.signal);
    const enriched = {
      ...event,
      context: store.buildContext()
    };
    log("event queued", enriched);
    pendingBuffer.push(enriched);
    scheduleBatchFlush();
  }
  function trackHealthyEvent(eventKey) {
    const delta = TRUST_DELTAS[eventKey];
    if (delta !== void 0 && delta > 0) {
      store.applyTrustDelta(delta);
      log(`trust recovery applied: ${eventKey} +${delta}`, { score: store.getTrustScore() });
    }
  }
  const searchCounts = /* @__PURE__ */ new Map();
  function trackSearch(query) {
    const normalized = query.trim().toLowerCase();
    const count = (searchCounts.get(normalized) ?? 0) + 1;
    searchCounts.set(normalized, count);
  }
  function getTrustScore() {
    return store.getTrustScore();
  }
  function setFlowState(state) {
    store.setFlowState(state);
    log("flow state updated", state);
  }
  async function flush() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await flushPending();
  }
  async function getPending() {
    try {
      const res = await fetch(`${config.baseUrl}/interventions/pending`, {
        headers: {
          Authorization: config.getAuthHeader(),
          "X-Correlation-Id": generateCorrelationId()
        }
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? json.intervention ?? null;
    } catch (_err) {
      log("getPending error", _err);
      return null;
    }
  }
  function destroy() {
    stopFlushTimer();
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    scrollListenerTeardown?.();
    scrollRecoveryTeardown?.();
    routeChangeTeardown?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
    flushPending().catch(() => {
    });
  }
  return {
    trackEvent,
    trackSearch,
    trackHealthyEvent,
    getPending,
    flush,
    destroy,
    getTrustScore,
    setFlowState
  };
}

// src/capture/rageClick.ts
var CLICK_WINDOW_MS = 1e3;
var CLICK_THRESHOLD = 3;
function attachRageClickDetector(onSignal) {
  let recent = [];
  function handleClick(e) {
    const now = Date.now();
    recent.push({ target: e.target, time: now });
    recent = recent.filter((r) => now - r.time <= CLICK_WINDOW_MS);
    const sameCurrent = recent.filter((r) => r.target === e.target);
    if (sameCurrent.length >= CLICK_THRESHOLD) {
      onSignal({
        signal: "rage_click" /* RageClick */,
        path: window.location.pathname,
        timestamp: now,
        metadata: {
          clickCount: sameCurrent.length,
          element: e.target?.tagName ?? "unknown"
        }
      });
      recent = recent.filter((r) => r.target !== e.target);
    }
  }
  document.addEventListener("click", handleClick, true);
  return () => {
    document.removeEventListener("click", handleClick, true);
  };
}

// src/capture/dwellNoAction.ts
var DEFAULT_DWELL_MS = 3e4;
var INTERACTION_EVENTS = ["click", "keydown", "scroll", "mousemove", "touchstart"];
function attachDwellNoActionDetector(onSignal, thresholdMs = DEFAULT_DWELL_MS) {
  let timer = null;
  let fired = false;
  function reset() {
    fired = false;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      if (!fired) {
        fired = true;
        onSignal({
          signal: "dwell_no_action" /* DwellNoAction */,
          path: window.location.pathname,
          timestamp: Date.now(),
          metadata: { thresholdMs }
        });
      }
    }, thresholdMs);
  }
  function handleInteraction() {
    reset();
  }
  for (const evt of INTERACTION_EVENTS) {
    document.addEventListener(evt, handleInteraction, { passive: true });
  }
  reset();
  return () => {
    if (timer !== null) clearTimeout(timer);
    for (const evt of INTERACTION_EVENTS) {
      document.removeEventListener(evt, handleInteraction);
    }
  };
}

// src/capture/abandonedFlowStep.ts
var STORAGE_KEY = "sf_last_flow_step";
function attachAbandonedFlowStepDetector(onSignal, config) {
  if (!config.onRouteChange) return () => void 0;
  function handleRouteChange(newPath) {
    const lastStep = sessionStorage.getItem(STORAGE_KEY);
    if (lastStep !== null && lastStep !== newPath) {
      onSignal({
        signal: "abandoned_flow_step" /* AbandonedFlowStep */,
        path: newPath,
        timestamp: Date.now(),
        metadata: {
          abandonedStep: lastStep,
          navigatedTo: newPath
        }
      });
    }
    sessionStorage.setItem(STORAGE_KEY, newPath);
  }
  sessionStorage.setItem(STORAGE_KEY, window.location.pathname);
  const unsubscribe = config.onRouteChange(handleRouteChange);
  return () => {
    unsubscribe();
  };
}

// src/capture/repeatedQuery.ts
var REPEAT_THRESHOLD = 3;
function createRepeatedQueryTracker(onSignal) {
  const counts = /* @__PURE__ */ new Map();
  return function trackSearch(query) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return;
    const count = (counts.get(normalized) ?? 0) + 1;
    counts.set(normalized, count);
    if (count === REPEAT_THRESHOLD) {
      onSignal({
        signal: "repeated_query" /* RepeatedQuery */,
        path: window.location.pathname,
        timestamp: Date.now(),
        metadata: {
          query: normalized,
          count
        }
      });
    }
  };
}

// src/capture/pointsBalanceStare.ts
var DATA_ATTR = "data-signal";
var SIGNAL_VALUE = "points_balance";
var DEFAULT_STARE_MS = 1e4;
function attachPointsBalanceStareDetector(onSignal, stareThresholdMs = DEFAULT_STARE_MS) {
  let timer = null;
  let fired = false;
  let observer = null;
  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function startTimer(el) {
    fired = false;
    clearTimer();
    timer = setTimeout(() => {
      if (!fired) {
        fired = true;
        onSignal({
          signal: "points_balance_stare" /* PointsBalanceStare */,
          path: window.location.pathname,
          timestamp: Date.now(),
          metadata: {
            stareThresholdMs,
            element: el.tagName.toLowerCase()
          }
        });
      }
    }, stareThresholdMs);
  }
  function observe() {
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
      { threshold: 0.5 }
    );
    for (const target of targets) {
      observer.observe(target);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe, { once: true });
  } else {
    observe();
  }
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

// src/capture/index.ts
function mountCapture(onSignal, config) {
  const teardowns = [];
  teardowns.push(attachRageClickDetector(onSignal));
  teardowns.push(
    attachDwellNoActionDetector(onSignal, config.dwellThresholdMs)
  );
  if (config.onRouteChange) {
    teardowns.push(attachAbandonedFlowStepDetector(onSignal, config));
  }
  teardowns.push(attachPointsBalanceStareDetector(onSignal));
  const trackSearch = createRepeatedQueryTracker(onSignal);
  function destroy() {
    for (const teardown of teardowns) {
      teardown();
    }
  }
  return { trackSearch, destroy };
}
var defaultTheme = {
  background: "#1e40af",
  text: "#ffffff",
  border: "transparent",
  buttonBackground: "#ffffff",
  buttonText: "#1e40af"
};
function NudgeBanner({ intervention, onDismiss, theme }) {
  const t = { ...defaultTheme, ...intervention.theme ?? {}, ...theme ?? {} };
  const bannerStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: "1.5"
  };
  const messageStyle = {
    flex: 1,
    margin: 0
  };
  const actionsStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0
  };
  const buttonStyle = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: "none",
    borderRadius: "4px",
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit"
  };
  const dismissStyle = {
    background: "none",
    border: "none",
    color: t.text,
    cursor: "pointer",
    padding: "4px",
    fontSize: "18px",
    lineHeight: 1,
    opacity: 0.7,
    fontFamily: "inherit"
  };
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: bannerStyle, role: "alert", "aria-live": "polite", children: [
    /* @__PURE__ */ jsxRuntime.jsx("p", { style: messageStyle, children: intervention.message }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: actionsStyle, children: [
      intervention.ctaUrl && intervention.ctaLabel && /* @__PURE__ */ jsxRuntime.jsx(
        "a",
        {
          href: intervention.ctaUrl,
          style: buttonStyle,
          children: intervention.ctaLabel
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx("button", { style: dismissStyle, onClick: onDismiss, "aria-label": "Dismiss", children: "\u2715" })
    ] })
  ] });
}
var defaultTheme2 = {
  background: "#ffffff",
  text: "#111827",
  border: "#e5e7eb",
  buttonBackground: "#1e40af",
  buttonText: "#ffffff"
};
function OfferModal({ intervention, onDismiss, theme }) {
  const t = { ...defaultTheme2, ...intervention.theme ?? {}, ...theme ?? {} };
  const overlayStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 9998,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px"
  };
  const modalStyle = {
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: "8px",
    padding: "24px",
    maxWidth: "480px",
    width: "100%",
    fontFamily: "inherit",
    position: "relative",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
  };
  const headingStyle = {
    margin: "0 0 12px",
    fontSize: "18px",
    fontWeight: 700,
    lineHeight: 1.3,
    paddingRight: "24px"
  };
  const bodyStyle = {
    margin: "0 0 20px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: t.text,
    opacity: 0.85
  };
  const actionsStyle = {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end"
  };
  const primaryButtonStyle = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit"
  };
  const secondaryButtonStyle = {
    backgroundColor: "transparent",
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit"
  };
  const closeButtonStyle = {
    position: "absolute",
    top: "16px",
    right: "16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: 1,
    color: t.text,
    opacity: 0.5,
    fontFamily: "inherit"
  };
  return /* @__PURE__ */ jsxRuntime.jsx("div", { style: overlayStyle, role: "dialog", "aria-modal": "true", "aria-label": "Offer", children: /* @__PURE__ */ jsxRuntime.jsxs("div", { style: modalStyle, children: [
    /* @__PURE__ */ jsxRuntime.jsx("button", { style: closeButtonStyle, onClick: onDismiss, "aria-label": "Close", children: "\u2715" }),
    /* @__PURE__ */ jsxRuntime.jsx("h2", { style: headingStyle, children: intervention.message }),
    intervention.metadata?.description && /* @__PURE__ */ jsxRuntime.jsx("p", { style: bodyStyle, children: String(intervention.metadata.description) }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: actionsStyle, children: [
      /* @__PURE__ */ jsxRuntime.jsx("button", { style: secondaryButtonStyle, onClick: onDismiss, children: "Not now" }),
      intervention.ctaUrl && intervention.ctaLabel && /* @__PURE__ */ jsxRuntime.jsx("a", { href: intervention.ctaUrl, style: primaryButtonStyle, children: intervention.ctaLabel })
    ] })
  ] }) });
}
var defaultTheme3 = {
  background: "#1f2937",
  text: "#f9fafb",
  border: "transparent",
  buttonBackground: "#3b82f6",
  buttonText: "#ffffff"
};
function HelpTooltip({ intervention, onDismiss, theme }) {
  const t = { ...defaultTheme3, ...intervention.theme ?? {}, ...theme ?? {} };
  const [position, setPosition] = react.useState(null);
  const tooltipRef = react.useRef(null);
  react.useEffect(() => {
    const selector = intervention.anchorSelector;
    if (!selector) {
      setPosition({ top: 80, left: window.innerWidth / 2 - 140 });
      return;
    }
    const anchor = document.querySelector(selector);
    if (!anchor) {
      setPosition({ top: 80, left: window.innerWidth / 2 - 140 });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX
    });
  }, [intervention.anchorSelector]);
  if (position === null) return null;
  const tooltipStyle = {
    position: "absolute",
    top: position.top,
    left: position.left,
    zIndex: 9997,
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: "6px",
    padding: "10px 14px",
    maxWidth: "280px",
    fontSize: "13px",
    lineHeight: 1.5,
    fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
  };
  const arrowStyle = {
    position: "absolute",
    top: "-6px",
    left: "12px",
    width: 0,
    height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderBottom: `6px solid ${t.background}`
  };
  const messageStyle = {
    margin: "0 0 8px"
  };
  const actionsStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  };
  const ctaStyle = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: "none",
    borderRadius: "4px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit"
  };
  const dismissStyle = {
    background: "none",
    border: "none",
    color: t.text,
    cursor: "pointer",
    fontSize: "12px",
    opacity: 0.7,
    fontFamily: "inherit"
  };
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: tooltipRef, style: tooltipStyle, role: "tooltip", children: [
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: arrowStyle }),
    /* @__PURE__ */ jsxRuntime.jsx("p", { style: messageStyle, children: intervention.message }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: actionsStyle, children: [
      intervention.ctaUrl && intervention.ctaLabel && /* @__PURE__ */ jsxRuntime.jsx("a", { href: intervention.ctaUrl, style: ctaStyle, children: intervention.ctaLabel }),
      /* @__PURE__ */ jsxRuntime.jsx("button", { style: dismissStyle, onClick: onDismiss, children: "Got it" })
    ] })
  ] });
}

exports.HelpTooltip = HelpTooltip;
exports.NudgeBanner = NudgeBanner;
exports.OfferModal = OfferModal;
exports.Signal = Signal;
exports.TRUST_DELTAS = TRUST_DELTAS;
exports.attachAbandonedFlowStepDetector = attachAbandonedFlowStepDetector;
exports.attachDwellNoActionDetector = attachDwellNoActionDetector;
exports.attachPointsBalanceStareDetector = attachPointsBalanceStareDetector;
exports.attachRageClickDetector = attachRageClickDetector;
exports.createClient = createClient;
exports.createRepeatedQueryTracker = createRepeatedQueryTracker;
exports.mountCapture = mountCapture;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map