# Signal Force

Signal Force is a real-time decision intelligence platform built for loyalty programs. It turns behavioral signals from the customer surface into adaptive decisions across three lanes: fraud prevention, personalization, and engagement. One engine evaluates each event through deterministic rules, escalates ambiguous cases to an LLM, and returns a typed response the UI renders as a fraud hold, a personalized offer, or an engagement nudge.

[Live demo](https://signal.glinr.com) | [Demo runbook](docs/DEMO_RUNBOOK.md) | [Test personas](docs/TEST_PERSONAS.md) | [Architecture](docs/architecture.md) | [API quickstart](docs/api-quickstart.md)

---

## What it does

A loyalty member logs in; the engine scores the event against fraud rules and returns a session token plus a personalized offer selected from six named surfaces. If the member attempts a high-value points transfer from an unknown device, the rules engine fires an MFA challenge and the admin console shows the full decision with an AI-generated fraud explanation. Throughout the session, a behavioral SDK watches for rage clicks, abandoned flows, and prolonged point stares; when it sees them, it fires engagement events that the rules engine converts into contextual nudges. All decisions land in DynamoDB and are visible to operators in real time on the admin overview.

---

## The engagement SDK

The SDK is the differentiator because it closes the gap between a customer's hesitation and the system's response. Without it, the engine only sees explicit actions (login, transfer). With it, the engine sees the full behavioral arc: the user who hovered on the points balance for 8 seconds before abandoning the flow is a different signal from the user who clicked the transfer button three times rapidly. The SDK captures these signals, enriches them with a rolling trust score and device fingerprint, and batches them into a single POST every 500 ms.

| Signal | Threshold | What it means |
|---|---|---|
| `rage_click` | 3 clicks in 1 s | Repeated tap on a non-responsive element |
| `dwell_no_action` | 8 s on one element | Member studying options without committing |
| `abandoned_flow` | exit before step 3 | Transfer or booking started but not finished |
| `repeated_query` | same search 3 x | Confusion about search results or availability |
| `points_stare` | 5 s on balance widget | Member evaluating whether they have enough points |

```
+---------------+     +--------------------+     +-----------------------+
|  Customer page| --> | SDK detector       | --> | Capture orchestrator  |
|  (React)      |     | rage_click, dwell, |     | enriches with trust + |
|               |     | abandoned_flow,    |     | device + flowState +  |
|               |     | repeated_query,    |     | recent events         |
|               |     | points_stare       |     +-----------+-----------+
+---------------+     +--------------------+                 |
                                                             v
                                                +------------+------------+
                                                | POST /engagement/event  |
                                                | (batched up to 500ms)   |
                                                +------------+------------+
                                                             |
                                                             v
                                                +------------+------------+
                                                |  L1 rules engine        |
                                                |  json-rules-engine      |
                                                |  deterministic, fast    |
                                                +------------+------------+
                                                             | score 40-70 -> escalate
                                                             v
                                                +------------+------------+
                                                |  L2 LLM router          |
                                                |  Haiku 4.5 via LiteLLM  |
                                                |  ranks surfaces +       |
                                                |  explains fraud         |
                                                +------------+------------+
                                                             |
                                                             v
                                                +------------+------------+
                                                |  DecisionStore +        |
                                                |  intervention to UI     |
                                                +-------------------------+
```

Full SDK docs including the React provider, hook reference, and signal thresholds: [packages/engagement-sdk/README.md](packages/engagement-sdk/README.md).

---

## Get it running

### 1. Clone and install

```bash
git clone https://github.com/thegdsks/signal-force.git
cd signal-force
npm install
```

`npm install` at the root installs every workspace and wires the git hooks. No separate `npm install` calls are needed in subdirectories.

### 2. Env files

Three env files are needed. None are committed to the repo. Each has a `.example` counterpart you copy and fill in.

#### `apps/backend/.env` (copy from `apps/backend/.env.example`)

| Var | Required | What it does | Where to get it |
|---|---|---|---|
| `CLIENT_ID` | yes | Basic Auth username for all API routes | use `demoClient` |
| `CLIENT_SECRET` | yes | Basic Auth password for all API routes | use `demoSecret` |
| `MFA_OTP` | no | Static OTP for demo login (deprecated; prefer `MFA_MODE=static` on Lambda) | use `123456` |
| `TABLE_USER_PROFILE` | no | DynamoDB table name | `UserProfile` (matches CDK output) |
| `TABLE_USER_SESSION` | no | DynamoDB table name | `UserSession` |
| `TABLE_USER_ACTIVITY` | no | DynamoDB table name | `UserActivity` |
| `TABLE_DECISION_STORE` | no | DynamoDB table name | `DecisionStore` |
| `TABLE_USER_STATE` | no | DynamoDB table name | `UserState` |
| `AWS_ACCOUNT_ID` | deploy only | Used by `serverless deploy`; not needed for local offline | `aws sts get-caller-identity --query Account --output text` |
| `AWS_REGION` | no | Defaults to `us-east-1` | set if deploying to another region |

#### `apps/frontend/.env.local` (copy from `apps/frontend/.env.example`)

| Var | Required | What it does | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | yes | Backend API base URL | `http://localhost:3000` for local dev; API Gateway URL after deploy |
| `NEXT_PUBLIC_CLIENT_ID` | yes | Basic Auth username sent with every API request | `demoClient` |
| `NEXT_PUBLIC_CLIENT_SECRET` | yes | Basic Auth password sent with every API request | `demoSecret` |
| `NEXT_PUBLIC_SITE_URL` | no | Canonical URL for OG metadata | `http://localhost:3001` locally; `https://signal.glinr.com` on Vercel |

#### CDK deploy vars (set in shell before `cdk deploy --all`)

These are passed through `deploy-backend.sh` at synth time. They are not loaded automatically.

| Var | Required | What it does | Where to get it |
|---|---|---|---|
| `LITELLM_BASE_URL` | yes, for AI features | LiteLLM proxy URL | `https://d1t4hkdc2i746c.cloudfront.net/v1` (team Slack) |
| `LITELLM_API_KEY` | yes, for AI features | LiteLLM API key | from team Slack |
| `LITELLM_MODEL` | no | Model ID; defaults to Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `FRAUD_ALERT_EMAIL` | no | Email to subscribe to fraud SNS topic | your address |
| `BUDGET_ALERT_EMAIL` | no | Email to subscribe to budget SNS topic | your address |
| `SF_STAGE` | no | Deploy stage label | `dev` or `prod` |
| `AWS_ACCOUNT_ID` | yes | CDK bootstrap target | `aws sts get-caller-identity --query Account --output text` |

After CDK deploy, push the LiteLLM credentials to the Lambda:

```bash
./scripts/enable-litellm.sh "$LITELLM_BASE_URL" "$LITELLM_API_KEY" "$LITELLM_MODEL"
```

### 3. Seed the DynamoDB tables

The seed script writes all fixtures from `seed_data/` in batches. Run it after every CDK deploy and whenever you want a clean demo state.

```bash
# Standard seed (adds or overwrites records)
node scripts/seed-ddb.js

# Purge all existing rows first, then seed (use before a demo to guarantee clean state)
node scripts/seed-ddb.js --purge-first

# Seed a single table
node scripts/seed-ddb.js --table=UserProfile

# Dry run (prints what would be written, no DynamoDB writes)
node scripts/seed-ddb.js --dry-run
```

The fixtures cover 38 records across 6 tables: 10 named demo personas plus supporting session, activity, decision, and engagement rule rows. See [docs/TEST_PERSONAS.md](docs/TEST_PERSONAS.md) for per-persona demo beats. Reseed whenever you want to reset a persona's transfer history or decision state to its original value.

### 4. Run locally

```bash
# Backend on http://localhost:3000
cd apps/backend && npm run offline

# Frontend on http://localhost:3001 (separate shell)
cd apps/frontend && npm run dev
```

The frontend dev server proxies API calls to `NEXT_PUBLIC_API_BASE_URL`. With `serverless offline` running locally, no AWS credentials are needed for the backend (it uses a local DynamoDB emulator or a real table depending on your setup).

### 5. Deploy to AWS

One-time CDK bootstrap per account and region:

```bash
cd infra/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Standard deploy (exports short-lived credentials so CDK and Serverless Framework share the same session):

```bash
eval "$(aws configure export-credentials --format env)"
cd infra/cdk
export BUDGET_ALERT_EMAIL=<your-email>
export FRAUD_ALERT_EMAIL=<your-email>
npx cdk deploy --all
```

CDK outputs include the API Gateway URL and the CloudWatch dashboard URL. Copy the API URL into `NEXT_PUBLIC_API_BASE_URL` on Vercel (or `.env.local` for local testing against the deployed backend).

The frontend deploys to Vercel automatically on merge to `main`. To trigger a manual redeploy without a code change, use the GitHub Actions workflow: **Actions -> Deploy Vercel -> Run workflow**.

---

## Test personas

Ten personas cover every demo beat. All use password `Password1`. The table below lists the quick-reference trigger for each; full context and step-by-step setup is in [docs/TEST_PERSONAS.md](docs/TEST_PERSONAS.md).

| Username | Tier | Points | Demo beat |
|---|---|---|---|
| user001 | Gold | 510 | Baseline: high-value transfer triggers MFA path |
| user020 | Silver | 700 | Mid-flow: incomplete profile + no MFA enrolled |
| maya031 | Silver | 1,500 | First-timer: all three surfaces shown at once |
| dre032 | Gold | 49,500 | Near-Platinum: Prestige + Catalyst + MFA triple |
| priya033 | Diamond | 120,000 | AI Mode: LLM demotes all nudges, shows celebratory state only |
| ethan034 | Gold | 32,000 | Velocity: 3 transfers in last hour, FRAUD_TRANSFER risk |
| naomi035 | Silver | 4,200 | Abandon: TRANSFER_ABANDON_OFFER fires from 90s-old draft |
| marcus036 | Gold | 18,000 | Engagement signals: rage_click + dwell for LLM reasoning |
| inez037 | Platinum | 88,000 | Booking: BOOKING_CONFIRMATION_OFFER fires on landing |
| owen038 | Silver | 8,800 | Fraud history: BLOCK + REVIEW chain, fraud-explainer AI demo |

Admin console: navigate to `/admin` with Basic Auth `demoClient:demoSecret` (set these as browser credentials or use an extension like Requestly).

---

## Demo flow

The 90-second judge walkthrough hits all four use cases in sequence. Each step is scripted in [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md).

- **UC1 - geo-clean login (personalization):** log in as `user001`. L1 rules score below the gray zone. The engine returns a personalized offer; L2 is not called. See [DEMO_RUNBOOK.md - UC1](docs/DEMO_RUNBOOK.md).
- **UC2 - transfer velocity + MFA (fraud):** attempt a 7,500-point transfer from `user001`. The `DEMO_HIGH_VALUE_UNSEEN_DEVICE` rule fires an MFA challenge. Enter `123456`. Admin console shows the decision with AI fraud explanation. See [DEMO_RUNBOOK.md - UC2](docs/DEMO_RUNBOOK.md).
- **UC3 - profile completeness nudge (engagement):** switch to `maya031`. PROFILE_CATALYST_ELEVATE and MFA_ENROLLMENT_NUDGE surfaces appear. The floating DemoPanel can flip profile state live mid-demo. See [DEMO_RUNBOOK.md - UC3](docs/DEMO_RUNBOOK.md).
- **UC4 - AI surface prioritization:** toggle AI Mode on with `dre032`. `GET /customer/surface-eligibility?aiMode=on` returns LLM-ranked surfaces. Switch to `priya033` to show the LLM demoting all nudges. See [DEMO_RUNBOOK.md - UC4](docs/DEMO_RUNBOOK.md).

One-button rehearsal that runs the full story end-to-end and exits 0 when demo-ready:

```bash
npm run rehearsal
```

---

## Repo layout

```
apps/backend/          Node.js 18 Lambda; single handler.js routes all paths
apps/frontend/         Next.js 15 + React + TS SPA (customer surface + /admin route)
infra/cdk/             CDK TypeScript stacks (DynamoDB, budgets, runtime, frontend)
packages/engagement-sdk/  Behavioral signal SDK (React provider + hooks + detector)
scripts/               seed-ddb.js, rehearsal.mjs, deploy helpers, lefthook hooks
seed_data/             DynamoDB BatchWriteItem JSON fixtures, 38 records across 6 tables
docs/                  Architecture, API quickstart, demo runbook, personas, OpenAPI spec
```

---

## Tech

Node 18 Lambda + Next.js 15 + CDK v2 + DynamoDB + LiteLLM (Haiku 4.5).

---

## Contributing

Branch from `main` using `feat/...` or `fix/...`. Never commit directly to `main`. Open a PR, let the hooks run (Biome + commit-msg + pre-push typecheck + build), then merge with `gh pr merge --squash --delete-branch`.

Commit message rules: Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `style`, `build`, `ci`, `revert`). Subject under 72 chars. No em dashes, no emojis, no AI mentions, no Co-Authored-By lines. SSH commit signing is required (see `AGENTS.md` for the one-time setup).

Hooks are educational by default (warn, let through). Set `LEFTHOOK_STRICT=1` to make them blocking. Full conventions in [AGENTS.md](AGENTS.md).

---

## License

All rights reserved. Hackathon submission, not open-sourced.
