# Use Case 3: Behavior-Driven Smart Promotions

Signal Force detects real-time visitor behavior (rage clicks, dwell stalls, points staring,
abandoned flows) and surfaces personalized promotions without any hard-coded promo copy in
the frontend.

---

## Architecture flow

```
Browser (SDK detectors)
  |
  |-- rage_click / dwell_no_action / points_balance_stare / abandoned_flow_step
  |
  v
POST /engagement/event          (Lambda: src/handler.js -> engagementEventHandler)
  |
  +-- fraud layer score check   (DecisionStore lookup)
  +-- rules engine              (signal -> surface + copy selection)
  |
  v
DecisionStore (DynamoDB)        recordType: ENGAGEMENT_DECISION
  |
  v
GET /engagement/pending         (polled every 2 s by EngagementProvider)
  |
  v
EngagementProvider              surfaces map (nudge_banner, offer_modal, help_tooltip)
  |
  v
DynamicOfferCard / NudgeBanner / OfferModal / HelpTooltip renders in UI
```

Numbered summary:

1. `EngagementProvider` (in `engagement-wrapper.tsx`) calls `mountCapture` on mount,
   which attaches all four detectors to the document automatically.
2. Each detector fires `POST /engagement/event` when its threshold is crossed.
3. The Lambda evaluates the signal through the rules engine, writes a decision row, and
   returns `{ surface, copy, action, score, reasonCode, engineLayer, decisionId }`.
4. The SDK polls `GET /engagement/pending` every 2 seconds. When a pending intervention
   exists, it calls the matching surface component from the `surfaces` map.
5. `DynamicOfferCard` also calls `useEngagement()` directly and renders the
   `currentIntervention` for offer and nudge surfaces inline on the profile and property
   pages.
6. Admins watch decisions arrive in real time on `/admin/decisions` via
   `LiveEngagementStream` (auto-refreshes every 5 seconds, Pause toggle available).

---

## Demo walkthrough

### Prerequisites

- Frontend running at `http://localhost:3000` (or deployed URL)
- Backend running and env vars set (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_CLIENT_ID`,
  `NEXT_PUBLIC_CLIENT_SECRET`)
- A customer account in DynamoDB (seed data includes `loyalty@example.com`)

### Steps

1. Log in as a customer (e.g. `loyalty@example.com`).
2. Navigate to `/profile`. The "Your Offers" card shows a placeholder until a signal fires.
3. Open the Demo Panel (gear icon, bottom-right). Under "Trigger Engagement Signal", click
   one of the four buttons. The response box shows the decision inline.
4. Within 2-3 seconds, the profile page's offer card (or a nudge banner) updates with the
   engine-generated copy.
5. Navigate to `/property/paris` to see the `DynamicOfferCard` on the property page.
6. Open `/admin/decisions` in a separate tab. The Live Engagement Stream table should
   show the fired signal within 5 seconds.

---

## Manual signal triggers (Demo Panel)

All four buttons POST to `POST /engagement/event`. The body shape is:

```json
{
  "signal": "<signal_name>",
  "userId": "<customer_userId_from_session>",
  "sessionId": "",
  "params": {}
}
```

### Expected response shapes

**rage_click**
```json
{
  "surface": "nudge_banner",
  "copy": "Looks like something went wrong. Let us help you find what you need.",
  "reasonCode": "RAGE_CLICK_DETECTED",
  "engineLayer": "L1",
  "score": 0.82,
  "action": "NUDGE",
  "decisionId": "<uuid>"
}
```

**dwell_no_action**
```json
{
  "surface": "offer_modal",
  "copy": "Still thinking? Here's 1,000 bonus points on your next stay.",
  "reasonCode": "DWELL_THRESHOLD_EXCEEDED",
  "engineLayer": "L2",
  "score": 0.65,
  "action": "OFFER",
  "decisionId": "<uuid>"
}
```

**points_balance_stare**
```json
{
  "surface": "nudge_banner",
  "copy": "You're 2,400 points away from Gold status. Book now to close the gap.",
  "reasonCode": "POINTS_STARE_DETECTED",
  "engineLayer": "L1",
  "score": 0.78,
  "action": "NUDGE",
  "decisionId": "<uuid>"
}
```

**abandoned_flow_step**
```json
{
  "surface": "offer_modal",
  "copy": "Don't leave your reservation behind. Complete your booking for an exclusive rate.",
  "reasonCode": "FLOW_ABANDONED",
  "engineLayer": "L2",
  "score": 0.71,
  "action": "OFFER",
  "decisionId": "<uuid>"
}
```

---

## Admin panel

| Column | Source |
|---|---|
| Time | `decision.timestamp` formatted as HH:MM:SS |
| User | `decision.userId` (truncated to 8 chars) |
| Signal | Derived from `reasonCode` prefix (DWELL, RAGE, STARE, ABANDON) |
| Engine | `decision.engineLayer` (L1, L2, L3) |
| Action | `decision.action` (NUDGE, OFFER, PASS, BLOCK) |
| Reason | `decision.reasonCode` |
| Score | `decision.score` formatted to 2 decimal places |

The stream filters to `type=ENGAGEMENT` decisions only and auto-refreshes every 5 seconds.
Click "Pause" to freeze the view for comparison.

---

## AI Mode (L2 surface prioritization)

In addition to the rule-driven engagement signals above, the surface eligibility endpoint
supports an `?aiMode=on` query parameter that activates the L2 AI surface prioritizer
(`engine/ai-surface-prioritizer.js`).

When `aiMode=on`, each surface in the response gains three additional fields:

| Field | Type | Description |
|---|---|---|
| `aiAction` | `PROMOTE` / `KEEP` / `DEMOTE` / `HIDE` / `SWAP` | LLM verdict on whether to surface this card |
| `aiPriority` | 1-5 | Ranking within the active surfaces (1 = show first) |
| `aiRationale` | string | One to two sentences a product manager can read |

The deterministic `state` from the surface evaluator is never modified by AI. AI fields are
additive. When the LLM is unavailable (budget exhausted, timeout, missing env vars) the
response includes `"aiUnavailable": true` and the deterministic surfaces are returned
unchanged.

Example request:

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/customer/surface-eligibility?userId=USER%23001&aiMode=on'
```

The customer DemoPanel exposes an AI Mode toggle that sets this parameter on each poll.

## Curl smoke test

Replace `<BASE_URL>`, `<B64_CREDS>`, `<USER_ID>` before running.

```bash
BASE_URL="https://signal.glinr.com/api"
CREDS="$(echo -n 'demoClient:demoSecret' | base64)"
USER_ID="USER%23001"

# fire a dwell signal
curl -s -X POST "$BASE_URL/engagement/event" \
  -H "Authorization: Basic $CREDS" \
  -H "Content-Type: application/json" \
  -d "{\"signal\":\"dwell_no_action\",\"userId\":\"$USER_ID\",\"sessionId\":\"\",\"params\":{}}" \
  | jq '{action,surface,reasonCode,score,engineLayer,decisionId}'
```

Expected: the call returns a decision with `action: "OFFER"` or `"NUDGE"`.

---

## Known limitations

- L2 threshold scoring (~0.50-0.75) sometimes returns `action: "PASS"` for dwell signals
  at low session-age. Fire the signal twice if the first response is PASS.
- The SDK polls every 2 seconds. There is a 2-4 second lag between signal fire and the
  UI update. This is expected behavior.
- Static MFA OTP (`123456`) is used in demo mode. Set `MFA_MODE=totp` in production.
- `abandoned_flow_step` requires a page navigation to fire from the SDK automatically.
  The Demo Panel button fires it directly without navigation.
