# @signal-force/engagement-sdk

Captures behavioral signals from loyalty app pages and ships them to a server-side rules engine that decides which surface (banner, modal, tooltip) to show. Every signal carries a rolling trust score, full session context, and optional flow state so the L2 LLM has real numbers to ground its recommendations rather than guessing from signal names alone.

---

## Pipeline

```
+---------------------+     +----------------------+     +------------------------+
|  Customer page      | --> | SDK detector         | --> | Capture orchestrator   |
|  (React)            |     | (rage_click,         |     | enriches with trust    |
|                     |     |  dwell_no_action,    |     | score + device +       |
+---------------------+     |  abandoned_flow,     |     | flowState + context    |
                            |  repeated_query,     |     +----------+-------------+
                            |  points_stare)       |                |
                            +----------------------+                v
                                                        +----------+-------------+
                                                        |  Batch queue (500ms)   |
                                                        |  POST /engagement/     |
                                                        |        events          |
                                                        +----------+-------------+
                                                                   |
                                                                   v
                                                        +----------+-------------+
                                                        |  L1 rules engine       |
                                                        |  (deterministic)       |
                                                        +----------+-------------+
                                                                   |  score 40-70?
                                                                   v
                                                        +----------+-------------+
                                                        |  L2 LLM (Haiku 4.5)   |
                                                        |  ranks surfaces +      |
                                                        |  explains fraud        |
                                                        +----------+-------------+
                                                                   |
                                                                   v
                                                        +----------+-------------+
                                                        |  DecisionStore +       |
                                                        |  intervention to UI    |
                                                        +------------------------+
```

---

## Quick start

```tsx
import { EngagementProvider } from '@signal-force/engagement-sdk/react';

const config = {
  baseUrl: 'https://api.example.com',
  getAuthHeader: () => `Bearer ${localStorage.getItem('token') ?? ''}`,
  debug: false, // set true to log every event payload to console
  onRouteChange: (cb) => {
    // wire your router's route-change event here
    // return a teardown function
    router.events.on('routeChangeComplete', cb);
    return () => router.events.off('routeChangeComplete', cb);
  },
};

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <EngagementProvider config={config}>
      {children}
    </EngagementProvider>
  );
}
```

The provider automatically captures rage-clicks, dwell-without-action, abandoned flow steps, repeated queries, and points-balance stare events. It batches events for up to 500ms before sending, retries on reconnect, and rate-limits each signal type to 5 emissions per 10s.

---

## Trust score

The SDK maintains a rolling per-session trust score (0-100, starting at 70). It degrades on suspicious patterns and recovers on healthy ones. The score is attached to every event payload and passed to the L2 LLM.

| Event | Delta |
|---|---|
| rage_click | -8 |
| dwell_no_action | -3 |
| abandoned_flow_step | -4 |
| repeated_query | -2 |
| rapid navigation churn (>=5 routes in 60s) | -5 |
| completed_booking | +10 |
| completed_transfer | +5 |
| search_result_click | +2 |
| sustained scroll (30s, no click burst) | +1 |

Read the current score: `getTrustScore()`. Signal healthy outcomes: `trackHealthyEvent('completed_booking')`.

---

## Flow state

Page-level hooks can push flow state into the SDK so every subsequent event carries it:

```tsx
import { useEngagement } from '@signal-force/engagement-sdk/react';

function TransferForm() {
  const { setFlowState, trackHealthyEvent } = useEngagement();

  useEffect(() => {
    setFlowState({ page: 'transfer', step: 'amount' });
    return () => setFlowState(null);
  }, []);

  async function onSuccess() {
    trackHealthyEvent('completed_transfer');
  }
}
```

The backend persists `flowState` to `UserState` so future surface evaluations can reference "user left mid-transfer at amount=5000" across sessions.

---

## Endpoint reference

### POST /engagement/event

Single signal (legacy / backwards compatible).

```json
{
  "signal": "rage_click",
  "userId": "USER#001",
  "params": { "clickCount": 3 },
  "context": {
    "pageUrl": "https://app.example.com/transfer",
    "pageTimeSinceMountMs": 8240,
    "scrollDepthPct": 42,
    "clickCountInSession": 5,
    "routeChangesInSession": 2,
    "trustScore": 54,
    "recentEventTypes": ["dwell_no_action", "rage_click"],
    "device": {
      "userAgent": "Mozilla/5.0",
      "viewportWidth": 1440,
      "viewportHeight": 900,
      "language": "en-US",
      "timezone": "America/New_York",
      "pixelRatio": 2
    },
    "flowState": {
      "page": "transfer",
      "step": "confirm",
      "amountSfc": 5000,
      "recipientId": "USER#002"
    }
  }
}
```

Response: `{ data: { surface, copy, reasonCode, engineLayer, score, action, decisionId } }`

### POST /engagement/events

Batched (SDK default). Body: `{ events: [<SignalEvent>, ...] }`.

Response: `{ data: { processed: number, results: [{ ok, data }] } }`

---

## Detector reference

| Detector | Fires when | Threshold |
|---|---|---|
| `rage_click` | 3+ clicks on same target within 1s | 3 clicks / 1000ms |
| `dwell_no_action` | Page idle (no click/key/scroll) | 30s (configurable via `dwellThresholdMs`) |
| `abandoned_flow_step` | Route changes away from a tracked path mid-flow | any route change |
| `repeated_query` | Same search query entered 3+ times | 3 repetitions |
| `points_balance_stare` | Element with `data-signal="points_balance"` visible for 10s | 10s in viewport |

Mark your points display:

```tsx
<span data-signal="points_balance">{balance.toLocaleString()} pts</span>
```

---

## Surface taxonomy

| Type | When used |
|---|---|
| `nudge_banner` | Soft nudge at top/bottom of page - low friction |
| `offer_modal` | Centered modal for time-sensitive offers |
| `help_tooltip` | Anchored tooltip near a specific element |
| `inline_card` | Inline card within page content |

Override any surface by passing a `surfaces` prop to `EngagementProvider`:

```tsx
<EngagementProvider config={config} surfaces={{ nudge_banner: MyBanner }}>
  {children}
</EngagementProvider>
```

---

## Config reference

| Field | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | API base URL, no trailing slash |
| `getAuthHeader` | `() => string` | required | Returns the Authorization header value |
| `dwellThresholdMs` | `number` | 30000 | ms before dwell-no-action fires |
| `pollIntervalMs` | `number` | 2000 | Polling interval for pending interventions |
| `flushIntervalMs` | `number` | 5000 | Max ms between periodic flushes |
| `debug` | `boolean` | false | Log every event to console when true |
| `onRouteChange` | `(cb) => () => void` | - | Subscribe to route changes for abandoned-flow detection |

---

## Local dev

```bash
cd packages/engagement-sdk
npm install
npm run build   # outputs to dist/
npm run typecheck
```

The frontend app links this package directly. After rebuilding, the change is visible immediately without re-installing.

To verify the dist is current before committing:

```bash
cd packages/engagement-sdk && npm run build
git add dist/
```
