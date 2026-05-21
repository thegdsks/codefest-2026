import type {
  EngagementConfig,
  EngagementClient,
  FlowState,
  Intervention,
  SignalEvent,
} from './types.js';
import { createSessionStore } from './store.js';
import { TRUST_DELTAS } from './trust.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
/** Max ms to buffer events before flushing as a batch (batching). */
const BATCH_DEBOUNCE_MS = 500;
/** Max events to hold in the offline retry queue (offline buffering). */
const OFFLINE_QUEUE_MAX = 50;
/** Max emissions of a single signal type per sampling window (sampling guard). */
const SAMPLE_RATE_MAX = 5;
const SAMPLE_RATE_WINDOW_MS = 10_000;

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Extended client type with additional capabilities
// ---------------------------------------------------------------------------

export interface ExtendedEngagementClient extends EngagementClient {
  trackHealthyEvent: (eventKey: string) => void;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createClient(config: EngagementConfig): ExtendedEngagementClient {
  const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const debug = config.debug ?? false;

  const store = createSessionStore();

  // Buffer: events waiting for the debounce batch send
  let pendingBuffer: SignalEvent[] = [];
  // Offline retry queue: events that failed to send
  let offlineQueue: SignalEvent[] = [];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  // Sampling: tracks emission count per signal type per window
  const sampleCounts = new Map<string, { count: number; windowStart: number }>();

  // Teardowns
  let scrollListenerTeardown: (() => void) | null = null;
  let scrollRecoveryTeardown: (() => void) | null = null;
  let routeChangeTeardown: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Debug logger
  // ---------------------------------------------------------------------------

  function log(msg: string, payload?: unknown): void {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.log(`[engagement-sdk] ${msg}`, payload !== undefined ? payload : '');
  }

  // ---------------------------------------------------------------------------
  // Sampling guard
  // ---------------------------------------------------------------------------

  function isSamplingAllowed(signal: string): boolean {
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

  // ---------------------------------------------------------------------------
  // Network send helpers (batching + offline buffering)
  // ---------------------------------------------------------------------------

  async function sendBatch(events: SignalEvent[]): Promise<boolean> {
    if (events.length === 0) return true;
    try {
      const res = await fetch(`${config.baseUrl}/engagement/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: config.getAuthHeader(),
          'X-Correlation-Id': generateCorrelationId(),
        },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log(`batch sent ${events.length} events`);
      return true;
    } catch (_err) {
      log('batch send failed, queuing for retry', _err);
      return false;
    }
  }

  async function drainOfflineQueue(): Promise<void> {
    if (offlineQueue.length === 0) return;
    const toRetry = offlineQueue.slice();
    offlineQueue = [];
    const ok = await sendBatch(toRetry);
    if (!ok) {
      const combined = [...toRetry, ...offlineQueue];
      offlineQueue = combined.slice(-OFFLINE_QUEUE_MAX);
    }
  }

  async function flushPending(): Promise<void> {
    if (pendingBuffer.length === 0) return;
    const toSend = pendingBuffer.slice();
    pendingBuffer = [];

    // Drain offline queue first if there are queued events
    await drainOfflineQueue();

    const ok = await sendBatch(toSend);
    if (!ok) {
      const combined = [...toSend, ...offlineQueue];
      offlineQueue = combined.slice(-OFFLINE_QUEUE_MAX);
    }
  }

  // ---------------------------------------------------------------------------
  // Debounce flush (batch within 500ms window)
  // ---------------------------------------------------------------------------

  function scheduleBatchFlush(): void {
    if (debounceTimer !== null) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flushPending().catch((_err) => {
        log('debounce flush error', _err);
      });
    }, BATCH_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // Periodic flush timer
  // ---------------------------------------------------------------------------

  function startFlushTimer(): void {
    if (flushTimer !== null) return;
    flushTimer = setInterval(() => {
      flushPending().catch((_err) => {
        log('periodic flush error', _err);
      });
    }, flushIntervalMs);
  }

  function stopFlushTimer(): void {
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Browser event listeners for session tracking
  // ---------------------------------------------------------------------------

  function attachBrowserListeners(): void {
    if (typeof window === 'undefined') return;

    function handleClick(): void {
      store.incrementClick();
    }

    function handleScroll(): void {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) return;
      const pct = Math.round((scrolled / total) * 100);
      store.recordScroll(pct);
    }

    function handleOnline(): void {
      drainOfflineQueue().catch((_err) => {
        log('online drain error', _err);
      });
    }

    document.addEventListener('click', handleClick, { capture: true, passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('online', handleOnline);

    scrollListenerTeardown = () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('scroll', handleScroll);
      window.removeEventListener('online', handleOnline);
    };

    scrollRecoveryTeardown = store.startScrollRecoveryTimer();
  }

  function attachRouteListener(): void {
    if (!config.onRouteChange) return;
    const unsub = config.onRouteChange(() => {
      store.recordRouteChange();
    });
    routeChangeTeardown = unsub;
  }

  function onBeforeUnload(): void {
    flushPending().catch(() => {
      // best-effort on unload
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
    startFlushTimer();
    attachBrowserListeners();
  }

  attachRouteListener();

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  function trackEvent(event: SignalEvent): void {
    if (!isSamplingAllowed(event.signal)) return;

    // Apply trust delta for this signal type
    const delta = TRUST_DELTAS[event.signal];
    if (delta !== undefined && delta !== 0) {
      store.applyTrustDelta(delta);
    }

    // Record the event type in the recent ring buffer
    store.recordEventType(event.signal);

    // Enrich event with context
    const enriched: SignalEvent = {
      ...event,
      context: store.buildContext(),
    };

    log('event queued', enriched);
    pendingBuffer.push(enriched);
    scheduleBatchFlush();
  }

  /**
   * Signal a healthy outcome so trust can recover.
   * Accepted keys: completed_booking, completed_transfer, search_result_click.
   */
  function trackHealthyEvent(eventKey: string): void {
    const delta = TRUST_DELTAS[eventKey];
    if (delta !== undefined && delta > 0) {
      store.applyTrustDelta(delta);
      log(`trust recovery applied: ${eventKey} +${delta}`, { score: store.getTrustScore() });
    }
  }

  const searchCounts = new Map<string, number>();

  function trackSearch(query: string): void {
    const normalized = query.trim().toLowerCase();
    const count = (searchCounts.get(normalized) ?? 0) + 1;
    searchCounts.set(normalized, count);
  }

  function getTrustScore(): number {
    return store.getTrustScore();
  }

  function setFlowState(state: FlowState | null): void {
    store.setFlowState(state);
    log('flow state updated', state);
  }

  async function flush(): Promise<void> {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await flushPending();
  }

  async function getPending(): Promise<Intervention | null> {
    try {
      const res = await fetch(`${config.baseUrl}/interventions/pending`, {
        headers: {
          Authorization: config.getAuthHeader(),
          'X-Correlation-Id': generateCorrelationId(),
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: Intervention | null;
        intervention?: Intervention | null;
      };
      return json.data ?? json.intervention ?? null;
    } catch (_err) {
      log('getPending error', _err);
      return null;
    }
  }

  function destroy(): void {
    stopFlushTimer();
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    scrollListenerTeardown?.();
    scrollRecoveryTeardown?.();
    routeChangeTeardown?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
    flushPending().catch(() => {
      // best-effort
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
    setFlowState,
  };
}
