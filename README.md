# Signal Force

[![Node](https://img.shields.io/badge/Node-18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![AWS CDK](https://img.shields.io/badge/AWS_CDK-v2-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk)
[![Bedrock](https://img.shields.io/badge/Bedrock-Claude_Haiku_4.5-7B5BFF?logo=amazonaws&logoColor=white)](https://aws.amazon.com/bedrock)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Biome](https://img.shields.io/badge/Biome-2-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev)
[![lefthook](https://img.shields.io/badge/lefthook-2-FF6F00)](https://lefthook.dev)

A real-time **decision intelligence platform**. One engine that turns customer signals into adaptive decisions across three surfaces: **security**, **personalization**, and **engagement**.

Every interaction on a loyalty platform is a decision. Show a promotion or not. Flag a transfer or not. Greet with a personalized nudge or stay quiet. Signal Force unifies those decisions into one engine, watches the activity stream, and returns a typed response the customer surface renders.

> **Architecture and decision log:** see [`docs/architecture.md`](./docs/architecture.md). Diagrams, request flows, scale model, cost at Bonvoy scale, what we build vs what we skip. Read this before opening any PR that adds a new AWS service.

## What we are building

Three apps, one repo. The customer surface and the admin console share one SPA for the demo. The decision engine is a single Lambda behind API Gateway. In production the engine splits into hot / warm / cold lanes by decision complexity (rules, LLM, batch). See [`docs/architecture.md`](./docs/architecture.md) for the scaled architecture and cost model.

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
+--+----------------+-----------------+-----------------+------------------+
   |                |                 |                 |
   v                v                 v                 v
+--------+    +-----------+    +-----------+    +------------------+
| Bedrock|    | DynamoDB  |    |  SNS      |    | CloudWatch       |
| Claude |    | 5 tables  |    | fraud     |    | Logs + Dashboard |
| Haiku  |    | PAY/req   |    | alerts    |    | X-Ray traces     |
| 4.5    |    | + PITR    |    | email sub |    | budget alarms    |
+--------+    +-----------+    +-----------+    +------------------+
                                                          ^
                                                          | $25 / $100 / $200
                                                          | actual + forecast
                                                  +--------------------+
                                                  | AWS Budgets        |
                                                  | + kill switch      |
                                                  | (DenyAll @ $80)    |
                                                  +--------------------+
```

### DynamoDB tables

| Table          | PK / SK                  | GSI                              | Purpose                                  |
|----------------|--------------------------|----------------------------------|------------------------------------------|
| UserProfile    | userId                   | username-index (username)        | Loyalty member directory                 |
| UserSession    | sessionId                | userId-index (userId)            | Logged-in sessions, MFA state            |
| UserActivity   | userId / activityTime    | (TTL on `ttl`)                   | Append-only event log per user           |
| DecisionStore  | decisionId               | userId-timestamp-index           | Every engine decision, auditable         |
| UserState      | userId                   | -                                | Rolling counters: transfers, nudges...   |

### Request lifecycle (clean evaluate)

```
Customer SPA                Gateway+Lambda           DynamoDB       Bedrock        DecisionStore
     |                            |                     |              |                |
 1.  | POST /auth/login           |                     |              |                |
     |--------------------------->|                     |              |                |
     |                            | 2. lookup user      |              |                |
     |                            |-------------------->|              |                |
     |                            |<-- profile ---------|              |                |
     |                            | 3. seed session     |              |                |
     |                            |-------------------->|              |                |
     |<-- 200 {sessionId} --------|                     |              |                |
     |                            |                     |              |                |
 4.  | POST /auth/mfa/verify      |                     |              |                |
     |--------------------------->|                     |              |                |
     |<-- 200 {mfaOk:true} -------|                     |              |                |
     |                            |                     |              |                |
 5.  | GET  /offers?ctx=login     |                     |              |                |
     |--------------------------->|                     |              |                |
     |                            | 6. read state       |              |                |
     |                            |-------------------->|              |                |
     |                            |<-- counters --------|              |                |
     |                            | 7. generate offer (Converse)       |                |
     |                            |--------------------------------->  |                |
     |                            |<-- offer json --------------------- |                |
     |                            | 8. write decision                                    |
     |                            |---------------------------------------------------->|
     |<-- 200 {offer} ------------|                                                      |
```

### Request lifecycle (suspicious points transfer, fraud hold)

```
Customer SPA                Gateway+Lambda           DynamoDB     Heuristics    Bedrock       SNS
     |                            |                     |              |           |          |
 1.  | POST /transactions/transfer|                     |              |           |          |
     |  body: {amount, recipient} |                     |              |           |          |
     |--------------------------->|                     |              |           |          |
     |                            | 2. load state + recent activity    |           |          |
     |                            |-------------------->|              |           |          |
     |                            |<-- counters --------|              |           |          |
     |                            | 3. compute risk score              |           |          |
     |                            |-------------------------->         |           |          |
     |                            |<-- score=82 (over 60) ------------ |           |          |
     |                            | 4. generate adaptive nudge         |           |          |
     |                            |---------------------------------------------> |          |
     |                            |<-- nudge text ------------------------------- |          |
     |                            | 5. write decision (status=HELD)    |           |          |
     |                            |-------------------->|              |           |          |
     |                            | 6. publish fraud alert             |           |          |
     |                            |--------------------------------------------------------->|
     |<-- 200 {status:HELD,nudge}-|                                                           |
     |                                                                                       |
     |     Admin SPA polling /dashboard sees HELD entry within next refresh tick             |
```

Activity stream context (Akamai logs, web hits, page events) is the longer-term input that fills `UserActivity`. For the demo it is replayed by the seed loader; in production it would arrive over a stream (Kinesis or EventBridge Pipes).

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
| Merge | `gh pr merge --merge --delete-branch` |

Direct push to `main` is blocked by both a local hook and GitHub branch protection. Always PR.

Hooks are educational by default (warn and let you through). Set `LEFTHOOK_STRICT=1` if you want them to block on warnings. Full conventions in [`AGENTS.md`](./AGENTS.md).

## Deploy to AWS

One time per account and region:

```bash
cd infra/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Before the first deploy, enable Anthropic Claude Haiku 4.5 in the Bedrock console for `us-east-1` (one-time, ~5 clicks in the AWS console). The runtime stack deploys without it, but Lambda calls will fail at runtime until the model is enabled.

Standard deploy:

```bash
cd infra/cdk
export BUDGET_ALERT_EMAIL=<your-email>
export FRAUD_ALERT_EMAIL=<your-email>
npx cdk deploy --all
```

Outputs include the API URL and CloudWatch dashboard URL.

## Demo scenarios

The hackathon demo walks through three scenarios that show the engine across all three surfaces:

1. **Clean user**: high-tier member logs in, page-view triggers `/decisions/evaluate`, the engine returns a personalized credit-card promotion dynamically generated by Bedrock. Customer surface renders it as a nudge popup.
2. **Suspicious transfer**: same user attempts a 10x normal points transfer from a new geolocation. Heuristic risk score crosses the threshold. Bedrock generates the adaptive nudge ("we paused this transfer, here is what to do"). Fraud alert SNS publishes. Admin console shows the hold in real time.
3. **Admin rule change**: admin opens `/admin`, toggles a promotion eligibility rule, the next customer evaluate picks it up. Demonstrates the closed loop between marketing config and live decisions.

## See also

- [`docs/architecture.md`](./docs/architecture.md): the engine in detail, scale model, cost, decision log.
- [`AGENTS.md`](./AGENTS.md): code conventions, commit signing setup, hook behavior, rules for AI tools.
- [`infra/cdk/README.md`](./infra/cdk/README.md): per-stack deploy notes.
