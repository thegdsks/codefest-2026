# Signal Force - Project Status

Last updated: 2026-05-21

**Demo:** 2026-05-22 | **Team:** 5 (1 infra, 3 product/dev, 1 PM)

Signal Force is a fraud-aware loyalty decision platform. A single
decision engine classifies every customer action (login, transfer, page visit) through a layered
pipeline: deterministic rules evaluated by `json-rules-engine`, an LLM rationale path via
LiteLLM-backed Bedrock Haiku 4.5, and a stateful surface evaluator that tracks which nudges,
offers, and profile prompts have already been shown. The customer SPA at `signal.glinr.com` and
the admin console share one Next.js 15 bundle routed by URL groups. The backend is a single Node
Lambda behind API Gateway HTTP API, deployed via Serverless Framework. Infrastructure is AWS CDK
v2 TypeScript (DynamoDB PAY_PER_REQUEST, Lambda arm64, Budgets alarm).

**Live URL:** `https://signal.glinr.com`
**Repo:** `github.com/thegdsks/codefest-2026` (private)

---

## Shipped

### Engine lane

| Item                                | What it does                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `engine/router.js`                  | Routes decisions through rule-only, L1+L2, or batch path based on context type                     |
| `engine/budget.js`                  | Per-day LLM spend tracking; blocks LLM calls when `LLM_DAILY_BUDGET_USD` ceiling is hit            |
| `engine/llm.js`                     | LiteLLM proxy wrapper with retry, fallback models, and configurable timeout (`LITELLM_TIMEOUT_MS`) |
| `engine/ai-fraud-explainer.js`      | Post-decision LLM call that returns a natural-language rationale for triggered fraud rules         |
| `engine/ai-surface-prioritizer.js`  | Ranks NUDGE/OFFER/PROFILE surfaces by userId context; returns ordered list with confidence scores  |
| `engine/surfaces.js`                | Stateful evaluator - tracks SHOWN/HIDDEN/PENDING/COMPLETED state per surface per user              |
| `rules/`                            | Engagement rule set including `DEMO_HIGH_VALUE_UNSEEN_DEVICE` (the demo story rule)                |
| `lib/jsonRulesEngine.js`            | Wraps `json-rules-engine` with condition tracing so the drawer can replay matched facts            |
| `lib/totp.js`                       | TOTP secret generation, code verification, and recovery-code management                            |
| `lib/ruleStore.js`                  | DynamoDB-backed rule CRUD; used by admin rule editor                                               |
| `lib/ruleMatchCount.js`             | Increments per-rule match counters for the admin stats tile                                        |
| `lib/activity.js`                   | Writes UserActivity records and emits `sf:*` SSE events for the live feed                          |
| Decision grouping by correlation id | Groups related decision rows in the admin feed under one expandable entry                          |

### Admin lane

| Item                                  | What it does                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `routes/admin/decisions.js`           | Lists and filters DecisionStore records; supports GSI userId query                   |
| `routes/admin/sessions.js`            | Lists active sessions; supports revoke by sessionId                                  |
| `routes/admin/mfa.js`                 | Returns per-user MFA enrollment status; admin read-only                              |
| `routes/admin/activity-feed.js`       | SSE stream endpoint backing the live activity feed tile                              |
| `routes/admin/metrics.js`             | Returns dec/s, pass/block rates, and rule match counts for the overview tiles        |
| `routes/admin/demo-actions.js`        | Reseed, force-MFA, and device-override mutations for the DemoPanel                   |
| `routes/admin/ai-config.js`           | Returns current LiteLLM model config and daily spend for the budget tile             |
| `routes/admin/users.js`               | Lists UserProfile records for the user switcher and admin table                      |
| `routes/admin/rules.js`               | Full rule CRUD (create, update, delete, list) backed by `ruleStore.js`               |
| `DecisionDrawer.tsx`                  | Slide-over showing rule trace, matched conditions, and LLM rationale                 |
| `LiveActivityFeed.tsx`                | SSE-backed feed with event type filtering and demo event tracking                    |
| `Tile.tsx` + `StatBreakdown.tsx`      | KPI tiles with sparklines, tooltips, and sub-cent cost display                       |
| `charts/` (5 components)              | Decisions-over-time, engine guard radial, score distribution, donut, sparkline       |
| `sessions/SessionDetailDrawer.tsx`    | Session detail slide-over with device info and risk score link                       |
| `sessions/SessionsTable.tsx`          | Paginated sessions table with revoke action                                          |
| `rules/RuleCard.tsx` + editor suite   | Visual rule builder with condition editor, AI-assist tab, flow preview, live preview |
| `investigations/` (5 components)      | Case card, bulk action bar, filter bar, and column layout for investigations view    |
| Budget-aware LLM spend tile           | Shows daily spend vs cap (`LLM_DAILY_BUDGET_USD`), blocks LLM if ceiling hit         |
| Engine guard card                     | Shows pass/block ratio and sub-cent per-decision cost in both light and dark themes  |
| `TopBarV2.tsx` + `CommandPalette.tsx` | Unified top bar with command palette for power-user navigation                       |

### Customer lane

| Item                                | What it does                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `/login` + `/mfa` routes            | Bearer token login flow; TOTP challenge fires on risk signal `action: "MFA"`   |
| TOTP MFA enroll/confirm/recover     | Authenticator app enrollment, confirm, and recovery code generation            |
| `/transfer` page                    | Points transfer form; MFA gate triggered by demo panel device-id override      |
| `/profile` page                     | Profile view wired to UserProfile DynamoDB item                                |
| `/property` page                    | Hotel property surface with prestige and catalyst benefit cards                |
| Engagement behavioral detectors     | Page-level event emitters for dwell time and scroll depth signals              |
| Smart promotions (Use Case 3)       | Behavior-driven offer rendering based on surface prioritizer ranking           |
| Prestige and catalyst benefit cards | Rule-driven benefit card display on property surface                           |
| AI Mode toggle                      | Customer-facing toggle that switches between rule-only and LLM-augmented paths |
| Verdict pills                       | Color-coded PASS/BLOCK/CHALLENGE/MFA pills on decision results                 |
| Fraud explainer panel               | Expandable rationale panel post-decision showing LLM output                    |
| Redirect on already-authenticated   | Skips login page if a valid session cookie is present                          |
| Force-MFA checkbox (demo mode)      | Login page checkbox forces MFA on the next request when `DEMO_MODE=1`          |
| `DemoPanel`                         | Floating debug panel for user switching, device override, and MFA force        |

### Infra and deploy lane

| Item                              | What it does                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `infra/cdk/lib/dynamodb-stack.ts` | 6 DynamoDB tables (UserProfile, UserSession, UserActivity, DecisionStore, UserState, EngagementRules) PAY_PER_REQUEST |
| `infra/cdk/lib/runtime-stack.ts`  | Lambda arm64 512 MB, 10 s timeout, env vars injected including LiteLLM and MFA config                                 |
| `infra/cdk/lib/budgets-stack.ts`  | AWS Budgets alarm at configurable USD threshold                                                                       |
| `infra/cdk/lib/frontend-stack.ts` | CloudFront + S3 OAC static bundle stack                                                                               |
| Serverless Framework deploy       | `apps/backend/serverless.yml` deploys Lambda + API Gateway HTTP API                                                   |
| Vercel deploy (Next.js)           | Manual-trigger GitHub Actions workflow; auto-detect Next.js build and output                                          |
| One-button deploy scripts         | `npm run deploy:aws` and `npm run deploy:vercel` in `apps/backend`                                                    |
| `MFA_MODE=static` Lambda env      | Lets judges use OTP `123456` without an authenticator app                                                             |
| `DEMO_MODE=1` Lambda env          | Activates reseed endpoint and DemoPanel controls                                                                      |
| LiteLLM env vars in CDK           | `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` passed through runtime stack                                   |
| Favicon, OG image                 | `/public/favicon.ico` and `/public/og-image.png` for social card and browser tab                                      |
| Vercel Analytics                  | `@vercel/analytics` component active on customer surface                                                              |

### Docs lane

| Item                     | What it does                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `docs/architecture.md`   | Full system design: engine pipeline, DynamoDB access patterns, scale model, cost at Bonvoy scale |
| `docs/deployment.md`     | Step-by-step AWS + Vercel deployment runbook                                                     |
| `docs/api-quickstart.md` | HTTP examples for every major route category                                                     |
| `docs/openapi.yaml`      | OpenAPI 3.0 spec                                                                                 |
| `docs/USE_CASE_3.md`     | Behavior-driven smart promotions design doc                                                      |
| `docs/rule-editor.md`    | Admin rule editor user guide                                                                     |
| `seed_data/`             | 30-record BatchWriteItem JSON per table; includes demo story rule and enriched trace fields      |
| `npm run rehearsal`      | End-to-end demo script: reseed, login, MFA verify, transfer, decisions check                     |

---

## Use case confidence

| Use case                                    | Status | Notes                                                                                                    |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| UC1 - geo-clean login, personalized offer   | HIGH   | Rule-only path live, offer renders on customer surface                                                   |
| UC2 - suspicious transfer, fraud hold + MFA | HIGH   | Demo story rule (`DEMO_HIGH_VALUE_UNSEEN_DEVICE`) fires reliably; MFA_MODE=static lets judges use 123456 |
| UC3 - behavior-driven smart promotions      | HIGH   | Engagement detectors wired on all five customer pages; 8 ACTIVE rules in DDB                             |
| UC4 - AI-augmented surface prioritization   | HIGH   | `aiMode=on` live on surface-eligibility; fraud explainer on every BLOCK/REVIEW/MFA decision              |

## PRs merged since last status update (PRs #86-#146)

Key items:

| PR         | Title                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| #88, #94   | DecisionStore GSI query fix (timestamp in KeyConditionExpression)          |
| #96        | Force-MFA checkbox on login (DEMO_MODE=1)                                  |
| #97        | Engagement detectors on all customer pages                                 |
| #99        | MFA_MODE=static + DEMO_MODE=1 in deployed Lambda                           |
| #100       | LITELLM env vars injected via CDK process.env                              |
| #101       | Transfer MFA gate driven by DemoPanel device id                            |
| #103       | Stateful surfaces - prestige and catalyst benefit cards                    |
| #106       | TopBar dec/s switched to TanStack Query + EMA smoothing                    |
| #111       | Stateful surface evaluator + demo mutation actions endpoint                |
| #112       | LiveActivityFeed hero widget, logo, load-more                              |
| #113       | Demo-events activityTime sort key fix                                      |
| #117, #118 | Engine guard tile black-themed, compact, sub-cent USD                      |
| #121       | AI fraud explainer + AI surface prioritizer (backend)                      |
| #122       | AI Mode toggle, verdict pills, DecisionDrawer AI Analysis panel (frontend) |
| #124       | AI prioritizer timeout raised 3s to 6s                                     |
| #136       | BLOCK flow end-to-end + UC3 inline bubble nudges                           |
| #137       | Two-step booking flow and AI personalized offer surface                    |
| #138       | Session guard on protected customer routes                                 |
| #142       | Signal visibility, booking shape, tier consistency, ErrorBoundary          |
| #144       | Login side-by-side layout and surface deep-linking                         |
| #145       | Signal history view and richer decision row labels                         |
| #146       | Wider impossible-travel windows and auto-clear block on persona select     |

---

## Polish backlog (next 24h before demo)

Ordered by demo impact:

1. **Replace README live URL placeholder** - `<PLACEHOLDER_PROD_URL>` is still in the README judges see first. One-line fix, high visibility.
2. **Demo rehearsal smoke test against live URL** - Run `npm run rehearsal` against `https://signal.glinr.com` to confirm reseed, login, MFA, and transfer all return 200 on the deployed stack. Catches env var drift before judges arrive.
3. **Seed judges accounts on live DynamoDB** - Confirm `user001` and `user002` exist in the deployed UserProfile table with the demo story rule pre-trigger. If the rehearsal script reseeds destructively, verify judge account passwords survive.
4. **OG image and social card refresh** - The current `og-image.png` is a placeholder. A real card improves the judges' first impression when they paste the URL into Slack or a browser.
5. **Add a judges quick-start 30-second loop in the README** - A numbered, time-annotated walk-through (sign in 0:00, transfer 0:30, admin 0:60) so judges know exactly where to look and in what order.
6. **Lambda cold-start warm-up cron** - A CloudWatch Events rule pinging `/health` every 5 minutes keeps the Lambda warm. At current PAY_PER_REQUEST rates this costs under $0.01 for the demo window and eliminates the 1-2 s first-request delay. Only add if budget headroom allows.

---

## Future enhancements (post-demo)

These are concrete next steps if the project continued for another week:

- **Hot/warm/cold lane split** - Separate Lambdas (or Step Functions states) for rule-only (hot, < 50 ms), LLM-augmented (warm, < 2 s), and batch/async (cold, async). Removes the current single-Lambda latency ceiling.
- **EventBridge Pipes for activity ingest** - Replace direct DynamoDB writes from Lambda with EventBridge Pipes so downstream consumers (analytics, ML feature pipelines) can subscribe without coupling to the Lambda code.
- **SageMaker Feature Store integration** - Replace the in-Lambda score half-life calculation with a real-time feature group so the fraud model can read fresh velocity features without a DynamoDB scan.
- **Production-grade rate limiting** - Add a WAF rate rule or API Gateway usage plan per `CLIENT_ID`. The current demo accepts unlimited requests from any Basic Auth credential.
- **Real Cognito auth** - Replace the hand-rolled bearer token session with Amazon Cognito user pools and OAuth2/PKCE. Removes `CLIENT_SECRET` from the browser and enables MFA via Cognito's built-in TOTP flow.
- **Audit log export to S3 with Athena** - Stream DecisionStore writes to Kinesis Firehose, land Parquet in S3, and query with Athena. Gives compliance teams a full audit trail without DynamoDB scan costs.
- **Rule versioning and rollback** - The current rule editor writes in-place. Add a version field and a `versions` GSI so admins can inspect and roll back any rule change.
- **Multi-region active-passive** - DynamoDB Global Tables + Lambda@Edge for the decision path would bring P99 under 100 ms globally. Relevant at Bonvoy scale (170 M members).

---

## Open questions for the team

1. **Which user gets the demo story rule pre-trigger?** The seed script puts it on `user001`. Confirm the live DynamoDB row has `demoStoryTriggered: false` so the rule fires exactly once per rehearsal run.
2. **Judge account passwords** - The rehearsal reseed overwrites seed data. If a judge signs in before the demo and the host runs reseed, the session is invalidated. Decide: reseed only at demo start, or use a separate judge account that reseed does not touch.
3. **Static demo video fallback** - If the live URL is unreachable during the judges' session, do we have a screen recording as a fallback? Three minutes of the full flow recorded locally would cover a network outage.
4. **Admin Basic Auth distribution** - Judges need `demoClient:demoSecret` to open `/admin`. Decide how to hand this off (printed card, slide, QR code) without it appearing in any public communication before the event.
5. **LLM path for the demo** - The demo defaults to `MFA_MODE=static` and `DEMO_MODE=1`. Confirm whether `LITELLM_BASE_URL` is set in the deployed Lambda so the AI explainer fires during the live demo. If LiteLLM is not reachable, the engine falls back to the rule-only path silently - which is fine, but the fraud explainer panel will be empty.

---

## Cost snapshot

All figures are estimates. Actual spend requires checking the AWS Cost Explorer and LiteLLM proxy logs for the deployed account.

| Item                     | Env var / config          | Default | Actual spend                        |
| ------------------------ | ------------------------- | ------- | ----------------------------------- |
| LLM daily budget ceiling | `LLM_DAILY_BUDGET_USD`    | 250 USD | TBD - check LiteLLM proxy dashboard |
| LiteLLM model            | `LITELLM_MODEL`           | (unset) | TBD                                 |
| LiteLLM timeout          | `LITELLM_TIMEOUT_MS`      | 8000 ms | n/a                                 |
| Session TTL              | `SESSION_TTL_SEC`         | 1800 s  | n/a                                 |
| DynamoDB                 | PAY_PER_REQUEST, 6 tables | -       | TBD - AWS Cost Explorer             |
| Lambda                   | arm64, 512 MB, 10 s max   | -       | TBD                                 |
| API Gateway HTTP API     | -                         | -       | TBD                                 |
| Vercel (frontend)        | Hobby tier                | $0/mo   | $0 (within free tier)               |
| Total vs $250 cap        | -                         | -       | TBD                                 |

To get the actual numbers: open the AWS Console, go to Cost Explorer, set the date range to 2026-05-20 to today, and group by service. The LiteLLM daily spend is visible in the admin overview tile at `/admin` under "Engine Guard".

---

## Quick-start commands

```bash
# Install all workspace dependencies (run from repo root)
npm install

# Run backend test suite
npm --workspace=apps/backend test

# Run end-to-end demo rehearsal against configured API_BASE
npm --workspace=apps/backend run rehearsal

# Open a PR (bundle related commits, squash-merge only)
gh pr create --title "feat: <description>" --body "$(cat .git/last-prepush-report.md)"
gh pr merge --squash --delete-branch
```

---

Related: [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md) | [architecture.md](./architecture.md) | [TEST_PERSONAS.md](./TEST_PERSONAS.md)
