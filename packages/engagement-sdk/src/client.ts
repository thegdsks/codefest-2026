import type { EngagementConfig, EngagementClient, Intervention, SignalEvent } from './types.js';

const DEFAULT_FLUSH_INTERVAL_MS = 5000;

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createClient(config: EngagementConfig): EngagementClient {
  const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

  let buffer: SignalEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function sendEvents(events: SignalEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await fetch(`${config.baseUrl}/engagement/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: config.getAuthHeader(),
          'X-Correlation-Id': generateCorrelationId(),
        },
        body: JSON.stringify({ events }),
      });
    } catch (err) {
      console.error('[engagement-sdk] Failed to send events:', err);
    }
  }

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const toSend = buffer.slice();
    buffer = [];
    await sendEvents(toSend);
  }

  function startFlushTimer(): void {
    if (flushTimer !== null) return;
    flushTimer = setInterval(() => {
      flush().catch((err) => {
        console.error('[engagement-sdk] Flush error:', err);
      });
    }, flushIntervalMs);
  }

  function stopFlushTimer(): void {
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }

  function onBeforeUnload(): void {
    flush().catch(() => {
      // best-effort on unload
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
    startFlushTimer();
  }

  function trackEvent(event: SignalEvent): void {
    buffer.push(event);
  }

  const searchCounts = new Map<string, number>();

  function trackSearch(query: string): void {
    const normalized = query.trim().toLowerCase();
    const count = (searchCounts.get(normalized) ?? 0) + 1;
    searchCounts.set(normalized, count);
  }

  function getSearchCounts(): Map<string, number> {
    return searchCounts;
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
      const json = (await res.json()) as { data?: Intervention | null; intervention?: Intervention | null };
      return json.data ?? json.intervention ?? null;
    } catch (err) {
      console.error('[engagement-sdk] getPending error:', err);
      return null;
    }
  }

  function destroy(): void {
    stopFlushTimer();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
    flush().catch(() => {
      // best-effort
    });
  }

  return {
    trackEvent,
    trackSearch,
    getPending,
    flush,
    destroy,
    // expose for capture module use
    _getSearchCounts: getSearchCounts,
  } as EngagementClient & { _getSearchCounts: () => Map<string, number> };
}
