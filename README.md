# Signal Force

> Demo-ready as of 2026-05-21. Backend: 356 tests passing. Frontend: deployed to [signal.glinr.com](https://signal.glinr.com).

[![Node](https://img.shields.io/badge/Node-18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![AWS CDK](https://img.shields.io/badge/AWS_CDK-v2-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk)
[![LiteLLM](https://img.shields.io/badge/LiteLLM-proxy-7B5BFF)](https://github.com/BerriAI/litellm)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Biome](https://img.shields.io/badge/Biome-2-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev)
[![lefthook](https://img.shields.io/badge/lefthook-2-FF6F00)](https://lefthook.dev)

A real-time **decision intelligence platform**. One engine that turns customer signals into adaptive decisions across three surfaces: **security**, **personalization**, and **engagement**.

## For judges and reviewers

Live URL: [signal.glinr.com](https://signal.glinr.com)

### Test accounts

| Username | Password  | Role     | Notes                                                 |
|----------|-----------|----------|-------------------------------------------------------|
| user001  | Password1 | customer | Seeded with the demo story rule pre-trigger           |
| user002  | Password1 | customer | Transfer recipient for the demo flow                  |

Admin console access uses HTTP Basic Auth at the gateway level. Set your browser or API client to username `demoClient`, password `demoSecret` (the values in `NEXT_PUBLIC_CLIENT_ID` / `NEXT_PUBLIC_CLIENT_SECRET`). Navigate to `/admin` after the credentials are applied.

### Demo flow (90 seconds)

1. Sign in as `user001` with password `Password1`. You land on the customer hotel surface.
2. Navigate to Transfer. Enter amount `7500`, recipient `user002`, and submit.
3. An MFA challenge fires because the browser fingerprint is not in `user001`'s known device list. Enter `123456` (static demo OTP, valid when `MFA_MODE=static`).
4. Transfer completes. Open `/admin` in a new tab with Basic Auth `demoClient:demoSecret`.
5. Open the Decisions tab and click the newest row. The drawer shows the rule that fired (`DEMO_HIGH_VALUE_UNSEEN_DEVICE`), the matched conditions, and the LLM rationale (if `L1+L2` path was taken).

### Demo controls

A floating debug panel sits in the bottom-right corner of the customer surface while logged in. Use it to:

- Switch active users without logging out and back in.
- Force MFA on the next transfer regardless of amount or device.
- Override the device fingerprint to an unseen value (triggers the rule naturally for repeated runs).

### One-button rehearsal

```bash
npm run rehearsal
```

Runs the full demo story end-to-end against the configured API (reseed, login, MFA verify, transfer, decisions check). Exit 0 means demo-ready. Add `--verbose` to print full request and response bodies.

Every interaction on a loyalty platform is a decision. Show a promotion or not. Flag a transfer or not. Greet with a personalized nudge or stay quiet. Signal Force unifies those decisions into one engine, watches the activity stream, and returns a typed response the customer surface renders.

> **Architecture and decision log:** see [`docs/architecture.md`](./docs/architecture.md). Diagrams, request flows, scale model, cost at Bonvoy scale, what we build vs what we skip. Read this before opening any PR that adds a new AWS service.

## What we are building

Three apps, one repo. The customer surface and the admin console share one SPA for the demo. The decision engine is a single Lambda behind API Gateway. In production the engine splits into hot / warm / cold lanes by decision complexity (rules, LLM, batch). See [`docs/architecture.md`](./docs/architecture.md) for the scaled architecture and cost model.

Key engine capabilities shipped as of 2026-05-21:

- **AI surface prioritizer** - `GET /customer/surface-eligibility?aiMode=on` passes the six deterministic surface candidates to the LLM (Claude Haiku 4.5 via LiteLLM proxy), which returns per-surface `aiAction` (PROMOTE / KEEP / DEMOTE / HIDE / SWAP), `aiPriority` (P1-P5), and `aiRationale`. The deterministic state is never overridden. Results are cached 30 s per Lambda container.
- **AI fraud explainer** - every `BLOCK` / `REVIEW` / `MFA` fraud decision triggers a post-decision LLM call producing a `{ paragraph, riskFactors[], recommendation }` rationale stored on the decision row as `aiExplanation`. The DecisionDrawer "AI Analysis" panel in `/admin` renders it.
- **Stateful surface evaluator** - `engine/surfaces.js` tracks SHOWN / HIDDEN / PENDING / COMPLETED lifecycle for six named surfaces (PROPERTY_PRESTIGE_ADVANCE, RESULTS_PRESTIGE_ADVANCE, PROFILE_CATALYST_ELEVATE, MFA_ENROLLMENT_NUDGE, TRANSFER_ABANDON_OFFER, BOOKING_CONFIRMATION_OFFER) derived from UserProfile and UserState.
- **Live activity feed** - `GET /admin/activity-feed` merges decisions, sessions, and operator demo events into one chronological stream. The `LiveActivityFeed` hero widget on the admin overview polls this endpoint.
- **Demo operator endpoints** - `POST /admin/demo-actions/mutate-user` flips user fields live (tier, loyalty score, profile completion, MFA status, transfer draft state, booking state) and publishes a `DEMO_EVENT` to the activity feed.

For the full runbook used during the live demo see [`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md).

### System architecture

```
+--------------------------------------------------------------------------+
|                              CLIENTS                                     |
|  Customer SPA (/login, /dashboard)        Admin SPA (/admin)             |
|  Vite + React + TS + Tailwind             same bundle, route-gated       |
+----------------------------+---------------------------------------------+
                             | HTTPS, Basic Auth at gateway
                             v
+--------------------------------------------------------------------------+
|                         EDGE  (apps/frontend)                            |
|  CloudFront  ->  S3 (static bundle)        OAC, no public S3             |
+----------------------------+---------------------------------------------+
                             | XHR/fetch, Bearer session id
                             v
+--------------------------------------------------------------------------+
|                       API   (apps/backend, infra/cdk)                    |
|  API Gateway HTTP API  ->  Lambda (Node 18, arm64, 512 MB, 10 s)         |
|       routes: /auth/*  /transactions/*  /offers  /nudges                 |
|               /user/*  /dashboard  /decisions/evaluate                   |
|                                                                          |
|   DECISION ENGINE                                                        |
|   +-----------------------------------------------------------------+    |
|   |  L1: deterministic rules  (apps/backend/src/rules/)             |    |
|   |      score, apply rules, emit L1Draft                           |    |
|   |             |                                                   |    |
|   |             v                                                   |    |
|   |  Router     (apps/backend/src/engine/router.js)                 |    |
|   |      score < 40  -> use L1Draft as final decision               |    |
|   |      score 40-70 -> gray zone: forward to L2                    |    |
|   |      score > 70  -> use L1Draft as final decision               |    |
|   |             |  (gray zone path only)                            |    |
|   |             v                                                   |    |
|   |  L2: LLM call  (apps/backend/src/engine/llm.js)                 |    |
|   |      LiteLLM proxy (Marriott-hosted, OpenAI-compatible)         |    |
|   |      returns enriched decision + llmTelemetry                   |    |
|   |             |                                                   |    |
|   |             v                                                   |    |
|   |  DecisionStore write  (engineLayer, llmTelemetry, decision)     |    |
|   +-----------------------------------------------------------------+    |
+--+----------------+-----------------+-----------------+------------------+
   |                |                 |                 |
   v                v                 v                 v
+----------+  +-----------+    +-----------+    +------------------+
| LiteLLM  |  | DynamoDB  |    |  SNS      |    | CloudWatch       |
| proxy    |  | 5 tables  |    | fraud     |    | Logs + Dashboard |
|(Marriott |  | PAY/req   |    | alerts    |    | alarms (see      |
| hosted)  |  | + PITR    |    | email sub |    | Observability)   |
+----------+  +-----------+    +-----------+    +------------------+
                                                          ^
                                                          | $25 / $100 / $200
                                                          | actual + forecast
                                                  +--------------------+
                                                  | AWS Budgets        |
                                                  | + kill switch      |
                                                  | (DenyAll @ $80)    |
                                                  +--------------------+
```

The **gray zone** (score 40-70) is where L1 rules fire but confidence is low enough that an LLM call adds value. Decisions in this range incur an extra LiteLLM round-trip (~50-200 ms, minimal token cost). Scores outside that band never hit the LLM, keeping the majority of requests fast and cost-free.

#### Observability

CloudWatch alarms wired to the fraud SNS topic:

- **Lambda 5xx alarm** - triggers when the Lambda error rate exceeds threshold, publishes to the fraud SNS topic.
- **API Gateway 5xx alarm** - triggers on API-level server errors, also publishes to the same fraud SNS topic.

### DynamoDB tables

| Table          | PK / SK                  | GSI                              | Purpose                                  |
|----------------|--------------------------|----------------------------------|------------------------------------------|
| UserProfile    | userId                   | username-index (username)        | Loyalty member directory                 |
| UserSession    | sessionId                | userId-index (userId)            | Logged-in sessions, MFA state            |
| UserActivity   | userId / activityTime    | (TTL on `ttl`)                   | Append-only event log per user           |
| DecisionStore  | decisionId               | userId-timestamp-index           | Every engine decision, auditable         |
| UserState      | userId                   | -                                | Rolling counters: transfers, nudges...   |

### Request lifecycle (clean evaluate)

UC1: geo-clean login, score below gray zone. L1 rules resolve, no LLM call.

```
Customer SPA                Gateway+Lambda           DynamoDB     L1 Rules   DecisionStore
     |                            |                     |              |          |
 1.  | POST /auth/login           |                     |              |          |
     |--------------------------->|                     |              |          |
     |                            | 2. lookup user      |              |          |
     |                            |-------------------->|              |          |
     |                            |<-- profile ---------|              |          |
     |                            | 3. seed session     |              |          |
     |                            |-------------------->|              |          |
     |<-- 200 {sessionId} --------|                     |              |          |
     |                            |                     |              |          |
 4.  | POST /auth/mfa/verify      |                     |              |          |
     |--------------------------->|                     |              |          |
     |<-- 200 {mfaOk:true} -------|                     |              |          |
     |                            |                     |              |          |
 5.  | GET  /offers?ctx=login     |                     |              |          |
     |--------------------------->|                     |              |          |
     |                            | 6. read state       |              |          |
     |                            |-------------------->|              |          |
     |                            |<-- counters --------|              |          |
     |                            | 7. L1 rules score (geo ok -> 20)  |          |
     |                            |------------------------------>    |          |
     |                            |<-- L1Draft (score 20, ALLOW) ---- |          |
     |                            | router: score<40, skip L2         |          |
     |                            | 8. write decision (engineLayer=L1)           |
     |                            |---------------------------------------------------->|
     |<-- 200 {offer} ------------|                                               |
```

### Request lifecycle (suspicious points transfer, fraud hold)

UC2: transfer velocity anomaly, score lands in gray zone (40-70). Router forwards to L2 for the adaptive nudge.

```
Customer SPA                Gateway+Lambda           DynamoDB     L1 Rules   L2 LiteLLM    SNS
     |                            |                     |              |           |          |
 1.  | POST /transactions/transfer|                     |              |           |          |
     |  body: {amount, recipient} |                     |              |           |          |
     |--------------------------->|                     |              |           |          |
     |                            | 2. load state + recent activity    |           |          |
     |                            |-------------------->|              |           |          |
     |                            |<-- counters --------|              |           |          |
     |                            | 3. L1 rules score (velocity -> 62) |           |          |
     |                            |------------------------------>    |           |          |
     |                            |<-- L1Draft (score 62, HOLD) ------ |           |          |
     |                            | router: 40<score<70, forward L2   |           |          |
     |                            | 4. L2 LLM call (adaptive nudge)   |           |          |
     |                            |---------------------------------------------> |          |
     |                            |<-- enriched decision + llmTelemetry --------- |          |
     |                            | 5. write decision (engineLayer=L2, HELD)       |          |
     |                            |-------------------->|              |           |          |
     |                            | 6. publish fraud alert             |           |          |
     |                            |--------------------------------------------------------->|
     |<-- 200 {status:HELD,nudge}-|                                                           |
     |                                                                                       |
     |     Admin SPA polling /dashboard sees HELD entry within next refresh tick             |
```

Activity stream context (Akamai logs, web hits, page events) is the longer-term input that fills `UserActivity`. For the demo it is replayed by the seed loader; in production it would arrive over a stream (Kinesis or EventBridge Pipes).

## API surface

Customer routes (Bearer auth after login):

- `POST /auth/login` - login with fraud scoring, returns sessionId and risk decision
- `POST /auth/mfa/verify` - verify OTP (or static `123456` when `MFA_MODE=static`) to complete login
- `POST /auth/mfa/enroll` / `POST /auth/mfa/confirm-enroll` - TOTP enrollment flow
- `POST /transactions/transfer` - points transfer with fraud scoring; MFA gate on high-risk
- `GET /customer/surface-eligibility?userId=&aiMode=on|off` - stateful evaluation of 6 surfaces; AI re-ranking when `aiMode=on`
- `POST /engagement/event` - report a behavioral signal, returns surface and copy for the UI
- `GET /user/profile` / `GET /user/profile-completeness?userId=` - profile data and completeness
- `GET /offers?userId=` / `GET /nudges?userId=` - personalized offers and nudges
- `GET /dashboard?userId=` - aggregate: profile, fraud status, offers, nudges, activity

Admin routes (Basic Auth `demoClient:demoSecret`):

- `GET /admin/decisions?window=&type=&userId=&limit=` - decision feed with AI explanation fields
- `GET /admin/metrics?window=` - aggregate counts and L1 vs L1+L2 split
- `POST /admin/decisions/{id}/release` - override a HOLD or BLOCK decision
- `GET /admin/sessions` / `POST /admin/sessions/{id}/revoke` - session management
- `GET /admin/activity-feed?since=&limit=` - merged feed of decisions, sessions, and demo events
- `POST /admin/demo-actions/mutate-user` - flip user fields live for demo scripting
- `POST /admin/demo-events` / `GET /admin/demo-events` - operator event log
- `GET /admin/users` / `GET /admin/rules` / `POST /admin/rules` - user list and rule CRUD

Full request/response shapes and curl examples are in [`docs/api-quickstart.md`](./docs/api-quickstart.md). OpenAPI 3.1 spec: [`docs/openapi.yaml`](./docs/openapi.yaml) (Postman import source).

## Quick start

```bash
git clone https://github.com/thegdsks/signal-force.git
cd signal-force
npm install
```

`npm install` at the root installs every workspace and wires the git hooks. That is the only setup step.

## Run locally

```bash
# Backend on http://localhost:3000
cd apps/backend && npm run offline

# Frontend on http://localhost:5173 (separate shell)
cd apps/frontend && npm run dev
```

Copy `apps/frontend/.env.example` to `apps/frontend/.env` and fill in the three vars before `npm run dev`.

## Repo layout

```
apps/backend           Node.js 18 Lambda, single handler.js routing all paths
apps/frontend          Vite + React + TS SPA (customer simulator + /admin route)
infra/cdk              CDK TypeScript stacks (dynamodb, budgets, runtime)
seed_data              DynamoDB BatchWriteItem fixtures, 30 records per table
docs                   Architecture and design notes
scripts/hooks          commit-msg and pre-push scripts called by lefthook
```

## Daily flow

| Step | Command |
|---|---|
| New work | `git checkout -b feat/<short-name>` |
| Commit | `git commit -m "Imperative subject under 72 chars"` |
| Push and open PR | `git push -u origin <branch>` then `gh pr create` |
| Merge | `gh pr merge --squash --delete-branch` |

Direct push to `main` is blocked by both a local hook and GitHub branch protection. Always PR.

Hooks are educational by default (warn and let you through). Set `LEFTHOOK_STRICT=1` if you want them to block on warnings. Full conventions in [`AGENTS.md`](./AGENTS.md).

## Deploy to AWS

One time per account and region:

```bash
cd infra/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

The L2 engine talks to a Marriott-hosted LiteLLM proxy (OpenAI-compatible wire format, backed by Bedrock under the hood). Set `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `LITELLM_MODEL` on the Lambda before deploying. The proxy already has Bedrock model access, so the Lambda itself does **not** need direct AWS Bedrock model activation for the demo path. The catalog of models the proxy exposes is in `apps/backend/src/lib/aiModels.js` and visible at `/admin/settings`. For one-shot setup against a deployed function use `./scripts/enable-litellm.sh`.

The Bedrock IAM policy in `infra/cdk/lib/runtime-stack.ts` is retained for the alternate production path where the Lambda would call Bedrock directly (provisioned throughput, lower latency). It is unused on the LiteLLM path and harmless to leave attached.

Standard deploy:

```bash
cd infra/cdk
export BUDGET_ALERT_EMAIL=<your-email>
export FRAUD_ALERT_EMAIL=<your-email>
npx cdk deploy --all
```

Outputs include the API URL and CloudWatch dashboard URL.

## Demo scenarios

The hackathon demo walks through four scenarios that show the engine across all three surfaces:

1. **UC1 - geo-clean login (personalization)**: high-tier member logs in from a known location. L1 rules score the event below the gray zone. The engine returns a personalized offer. L2 is not called. Customer surface renders the offer card via the stateful surface evaluator.
2. **UC2 - transfer velocity anomaly (fraud hold + MFA)**: same user attempts a high-value transfer from an unseen device. The `DEMO_HIGH_VALUE_UNSEEN_DEVICE` rule fires, the engine issues an MFA challenge. Judge enters `123456` (static OTP). Admin console shows the FRAUD_TRANSFER decision with an AI fraud explanation in the drawer.
3. **UC3 - profile completeness nudge (engagement)**: user with an incomplete profile triggers the engagement detectors on `/profile`. L1 rules match the `RULE#PROFILE_INCOMPLETE_TIER_GAP` rule, surface a Catalyst Elevate benefit card. The DemoPanel Quick Mutations row can flip this state live.
4. **UC4 - AI surface prioritization**: with the AI Mode toggle ON, `GET /customer/surface-eligibility?aiMode=on` returns LLM-ranked surfaces alongside the deterministic output. The DecisionDrawer in `/admin` shows the `aiExplanation` field on any fraud decision.

See [`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md) for the step-by-step 90-second judge walkthrough.

## See also

- [`docs/architecture.md`](./docs/architecture.md): the engine in detail, AI brain, DDB tables, scale model, cost, decision log.
- [`docs/api-quickstart.md`](./docs/api-quickstart.md): curl examples for every endpoint including new AI mode and demo controls.
- [`docs/DEMO_RUNBOOK.md`](./docs/DEMO_RUNBOOK.md): step-by-step judge walkthrough (on `docs/demo-runbook` branch, merging soon).
- [`AGENTS.md`](./AGENTS.md): code conventions, commit signing setup, hook behavior, rules for AI tools.
- [`infra/cdk/README.md`](./infra/cdk/README.md): per-stack deploy notes.
