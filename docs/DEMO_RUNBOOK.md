# Signal Force Demo Runbook

For the codefest demo and for teammates picking up the project mid-flight.
Last updated: 2026-05-21 (the day before the Marriott Codefest 2026 final).

## TL;DR

Signal Force is a fraud-aware loyalty platform with four demo-able stories:

| Use Case | What it shows | Confidence |
| --- | --- | --- |
| UC1: Login risk + MFA | L1 fraud rules trigger MFA challenge; static OTP `123456` accepted | HIGH |
| UC2: Points transfer monitoring | ALLOW / REVIEW / BLOCK ladder; release flow from admin | HIGH |
| UC3: Behavior-driven offers | SDK signals (rage_click, dwell, etc.) trigger rule-matched offers | HIGH |
| UC4: AI Mode | L2 LLM (Anthropic Haiku 4.5 via LiteLLM) ranks surfaces and explains fraud | HIGH |

## URLs and access

- **Customer site (local dev):** http://localhost:3000
- **Admin overview:** http://localhost:3000/admin
- **Deployed API:** `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com`
- **Admin Basic Auth:** `demoClient` / `demoSecret`
- **Static MFA OTP for the demo:** `123456` (works because `MFA_MODE=static` is set on the Lambda)
- **Test customer login:** `user020` / `Password1` (and `user001`..`user030` similarly)

## DemoPanel cheat sheet

The DemoPanel floats on customer-facing pages. It is the operator console for the demo.

### User context controls

- **Switch user:** swaps the session to a different seed user. Publishes a `USER_SWITCH` demo event that shows up in the admin LiveActivityFeed.
- **Location override:** sets the geo on the next login so the fraud engine sees a fresh location. Useful for triggering the impossible-travel rule.
- **Device override:** same idea for a new deviceId.
- **Force MFA checkbox (login page):** sends `forceMfa: true` on the login body. The auth route honors this when `DEMO_MODE=1` (set on the Lambda). Bypasses the L1 fraud check to demo the MFA verify step on demand.
- **Force high-risk transfer:** flips a module flag so the next transfer is treated as high-velocity for the demo.
- **Signal triggers:** buttons that synthesise the SDK signals (rage_click, points_balance_stare, abandoned_flow_step, etc.) without having to perform the real interaction.

### Surface Eligibility section

Lists the six engagement surfaces with their current state:

- Color pills: SHOWN (green), HIDDEN (gray), PENDING (amber), COMPLETED (blue).
- Each row shows the matched ruleId and a one-line reason.
- Each row has a `nextAction` button (`Make Platinum`, `Enroll MFA`, `Complete profile`, etc.) that POSTs to `/admin/demo-actions/mutate-user` and immediately re-evaluates eligibility.

### Quick Mutations row (top of the section)

- **Make Platinum:** sets tier to Platinum + loyaltyScore high. Watch Property/Results Prestige cards flip COMPLETED -> HIDDEN.
- **Complete profile:** profileCompletion -> 95. Watch Catalyst Elevate flip COMPLETED -> HIDDEN.
- **Reset to Gold + 50%:** restores the demo defaults so you can re-run the story.

### AI Mode toggle

Purple pill switch in the Surface Eligibility header. When on, every surface row also shows:

- An AI verdict pill: PROMOTE (blue up arrow), KEEP (gray), DEMOTE (gray down arrow), HIDE (red eye-off), SWAP (purple shuffle).
- The AI priority rank: P1 (show first) through P5 (least).
- The AI rationale: a one to two sentence narrative explaining the verdict.

This is the AI Surface Prioritizer feature. It calls L2 LLM (`/customer/surface-eligibility?aiMode=on`) which runs the rule output + user context + recent signals through Anthropic Haiku 4.5 and returns the verdict per surface. Results cached 30s per (userId, state hash).

## Admin overview tour

`/admin` is the operator dashboard.

- **Top bar:** decisions per second meter (smoothed EMA, 10s poll), command palette (Cmd+K).
- **KPI tiles:** Total decisions, L1 only, L1+L2, LLM spend with sparklines.
- **By type donut** and **Action / Decision type** breakdowns.
- **Live activity feed (hero):** unified stream of decisions + sessions + demo operator events. Filter pills, color-coded borders, pause toggle, click any row to expand the raw payload. DECISION rows have a "Open in Decision Drawer" link.
- **Engine guard:** compact black tile with the LLM cost guardrail dial. Shows used / cap in the rolling window. Sub-cent values render with 4 decimals so the demo does not look like nothing has been billed.

### Decisions feed (`/admin/decisions`)

Per-row decision list with filter chips and search by userId. Click any row to open the Decision Drawer for the full trace.

### Decision Drawer

When opening a FRAUD_TRANSFER, FRAUD_LOGIN, or MFA_VERIFY decision with action BLOCK / REVIEW / MFA:

- **AI Analysis panel** appears at the top (when the AI fraud explainer ran).
  - A 2-4 sentence plain-English paragraph.
  - A bulleted list of specific risk factors.
  - A one-line recommendation for the analyst.
- Rule trace and LLM rationale below as before.

## Demo script (5 minutes)

Tell this story:

1. **Open the customer site (http://localhost:3000)** — show a normal flow: login as `user020`, browse search/results, view a property.
2. **Land on the property page** — the Prestige Advance Benefit card is there with the live "300 pts from Platinum" copy from the engine. Mention "this card is rule-driven, the engine is deciding to show it."
3. **Open DemoPanel** — show the Surface Eligibility section. 3 SHOWN, 3 HIDDEN.
4. **Toggle AI Mode** — AI verdict pills appear. Say "the LLM ranks the surfaces and says PROMOTE this one, DEMOTE that one because the user is 0.4% profile complete which is too noisy a signal."
5. **Click Make Platinum** — watch Prestige cards flip COMPLETED, Profile Catalyst HIDE. The DemoPanel shows the state change in real time.
6. **Switch to admin (`/admin`)** — show the live activity feed. The USER_MUTATION demo event from step 5 is at the top with the operator action.
7. **Trigger a high-risk transfer** (DemoPanel: Force high-risk + transfer 20K) — watch the FRAUD_TRANSFER BLOCK decision appear in the feed within 3 seconds.
8. **Click the BLOCK decision** — Decision Drawer opens. AI Analysis panel shows the LLM paragraph explaining why this was blocked, the specific risk factors, the analyst recommendation.

The whole story takes 4-5 minutes and shows rules + AI + live engine + operator transparency in one continuous flow.

## API quick reference

Auth on all admin endpoints: `Authorization: Basic <base64(demoClient:demoSecret)>`.

```bash
BASIC=$(printf "demoClient:demoSecret" | base64)
API=https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com
```

### Surface eligibility (rule + AI)

```bash
TOKEN=$(curl -s -X POST -u "demoClient:demoSecret" \
  -H "Content-Type: application/json" \
  -d '{"username":"user020","password":"Password1","location":"Chicago","deviceId":"d1","deviceType":"mobile","browser":"Safari","ipAddress":"50.1.2.3"}' \
  "$API/auth/login" | jq -r .data.token)

# Rule-only
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/customer/surface-eligibility?userId=USER%23020"

# Rule + AI
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/customer/surface-eligibility?userId=USER%23020&aiMode=on"
```

### Demo operator actions

```bash
# Mutate a user (tier, profile, MFA, etc.)
curl -s -X POST -u "demoClient:demoSecret" \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER#020","mutation":{"tier":"Platinum","loyaltyScore":10000,"profileCompletion":95,"mfaEnrolled":true}}' \
  "$API/admin/demo-actions/mutate-user"

# Publish an operator event to the live feed
curl -s -X POST -u "demoClient:demoSecret" \
  -H "Content-Type: application/json" \
  -d '{"type":"SIGNAL_TRIGGER","payload":{"signal":"rage_click","target":"booking-button"}}' \
  "$API/admin/demo-events"
```

### Activity feed

```bash
# Unified feed (decisions + sessions + demo events), newest first
curl -s -u "demoClient:demoSecret" "$API/admin/activity-feed?limit=20"
```

### AI config

```bash
# Returns proxyConfigured + active model
curl -s -u "demoClient:demoSecret" "$API/admin/ai-config"
```

## Engagement rules

Stored in DDB `EngagementRules` table. Eight ACTIVE rules drive the demo:

| ruleId | When it fires | Surface |
| --- | --- | --- |
| `RULE#TIER_GAP_NUDGE` | pointsToNextTier within 10k, not Platinum | Prestige Advance card |
| `RULE#PROFILE_INCOMPLETE_TIER_GAP` | profileCompletion < 90, not Platinum | Catalyst Elevate card |
| `RULE#MFA_ENROLLMENT_GAP` | Gold/Platinum tier with no mfaSecret | MFA Enrollment nudge |
| `RULE#TRANSFER_ABANDON_OFFER` | Transfer draft idle > 60s | 2x points retention offer |
| `RULE#POST_BOOKING_UPSELL` | Booking confirmed within 5 min | Booking confirmation offer |
| `RULE#POINTS_BALANCE_STARE` | dwellMs > threshold on points balance | Help nudge |
| `RULE#RAGE_CLICK_GLOBAL` | 3+ clicks same area in 1s | Inline help tooltip |
| `DEMO_HIGH_VALUE_UNSEEN_DEVICE` | High-value transfer from unseen device | Forces L1+L2 review |

Re-seed after a fresh stack: `node scripts/seed-ddb.js --table=EngagementRules`.

## Deploy and operate

### Backend (Lambda)

```bash
# AWS creds for the operator
eval "$(aws configure export-credentials --format env)"
# LiteLLM creds for the deploy
set -a && source ../codefest/.env.local && set +a
# Diff (always) and deploy
cd infra/cdk
npx cdk diff signal-force-runtime
npx cdk deploy signal-force-runtime --require-approval broadening
```

The LITELLM_* env vars are read from `process.env` at synth time, so the deploy command above bakes them into the Lambda environment block. Without those exports, `cdk deploy` will omit the keys and AI Mode goes dark.

### Frontend (Next.js dev)

```bash
cd apps/frontend
pkill -f "next dev" 2>/dev/null
pkill -f "serverless offline" 2>/dev/null   # orphan from old workflow; intercepts ::1:3000
rm -rf .next
nohup npx next dev > /tmp/sf-frontend.log 2>&1 &
```

### Seed DDB

```bash
eval "$(aws configure export-credentials --format env)"
AWS_REGION=us-east-1 node scripts/seed-ddb.js                 # all tables
AWS_REGION=us-east-1 node scripts/seed-ddb.js --table=EngagementRules
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| HTTP 401 on http://localhost:3000 | Orphan `serverless offline` bound to `::1:3000`, intercepting before Next.js | `pkill -f "serverless offline"` and retry |
| `aiUnavailable: true` on surface-eligibility | LITELLM_* env vars missing on Lambda OR prioritizer LLM call timing out | Confirm with `/admin/ai-config` (`proxyConfigured: true`). Check CloudWatch for `[ai-surface-prioritizer] LLM call failed` |
| Decision endpoint returns 500 on `?userId=` filter | Missing GSI or wrong KeyConditionExpression | Check `apps/backend/src/routes/admin/decisions.js` - userId-timestamp-index must be used and timestamp must be in KeyConditionExpression |
| Mutate-user returns INTERNAL_ERROR | UserActivity table requires `activityTime` sort key, not `timestamp` | Already fixed in `apps/backend/src/routes/admin/demo-actions.js` |
| MFA OTP `123456` rejected | `MFA_MODE` env var missing on Lambda | Already set in CDK; if a stack rebuild drops it, set context or env when running `cdk deploy` |
| TopBar dec/s counter "bursts" | Stale React strict mode double-fire on raw setInterval | Already fixed - uses TanStack Query with refetchInterval + EMA smoothing |

## What was built this round (PR-by-PR highlights)

A non-exhaustive list to help teammates pick up the context fast:

- `#86` Sessions admin page rebuild with detail drawer and risk linking
- `#88` `/admin/decisions?userId=...` GSI fix
- `#93` Use Case 3: behavior-driven smart promotions (engagement SDK wiring end to end)
- `#94` Decisions endpoint timestamp moved into GSI KeyConditionExpression
- `#96` Force MFA checkbox on login when demo mode on
- `#97` Engagement detectors placed on customer pages (rage_click, dwell, abandoned_flow_step, points_balance_stare)
- `#99` Lambda env vars MFA_MODE=static + DEMO_MODE=1 wired through CDK
- `#100` LiteLLM creds passed through CDK at synth time
- `#103` Rule-driven Prestige / Catalyst benefit cards (replaced static UI)
- `#111` Stateful surfaces (SHOWN/HIDDEN/PENDING/COMPLETED) + DemoPanel mutation buttons
- `#113` UserActivity activityTime fix for demo-actions endpoint
- `#117` Engine guard card black accent in light mode
- `#118` Engine guard compact + sub-cent USD precision
- `#121` AI fraud explainer + AI surface prioritizer (backend) + DecisionFeedRow component
- `#122` AI Mode toggle in DemoPanel + AI Analysis panel in DecisionDrawer
- `#124` AI prioritizer timeout 3s -> 6s

## Known gaps and follow-ups

- The decisions feed (`/admin/decisions`) page still uses the old inline row markup. The `DecisionFeedRow` component (with type icons, per-type sublines, color borders, inline expand) and `useDecisionGroups` hook are on main but not yet wired into the page. KPI strip + filter chips also not yet shipped.
- 30+ stale remote branches from merged PRs need a cleanup pass.
- LLM cost monitoring is per-Lambda-container; a centralised DDB-backed budget tracker would be more accurate but is overkill for the demo.
