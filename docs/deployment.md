# Deployment

Last updated: 2026-05-21

## Contents

- [Prerequisites](#prerequisites)
- [Stack overview](#stack-overview)
- [Environment variables](#environment-variables-expected-at-cdk-synth-time)
- [Lambda alias and immutable env vars](#lambda-alias-and-immutable-env-vars)
- [Optional vars](#optional-vars-with-lambda-internal-defaults)
- [CORS](#cors)
- [First-time backend deploy](#first-time-backend-deploy)
- [First-time frontend deploy](#first-time-frontend-deploy)
- [Subsequent deploys](#subsequent-deploys)
- [Rollback](#rollback)
- [Seeding DynamoDB](#seeding-dynamodb-after-deploy)
- [Cost budget](#cost-budget)
- [Tear down](#tear-down-after-2-weeks)
- [Quick reference](#quick-reference---command-sequence-from-a-clean-clone)

---

## Prerequisites

- AWS account with credentials configured (`aws configure` or `AWS_PROFILE` set)
- Vercel account (free tier is enough)
- Node 20+, npm 10+
- AWS CDK CLI: `npm install -g aws-cdk`
- `jq`: `brew install jq`
- Vercel CLI: `npm install -g vercel`

---

## Stack overview

Four CDK stacks deploy in sequence when you run `cdk deploy --all`:

| Stack name | Resources |
|---|---|
| `signal-force-dynamodb` | 6 DynamoDB tables (PAY_PER_REQUEST) |
| `signal-force-budgets` | 3 AWS Budgets + SNS alerts ($25/$100/$200) |
| `signal-force-runtime` | Lambda (ARM64, Node 18), HTTP API (v2), CloudWatch dashboard + alarms |
| `signal-force-frontend` | S3 bucket + CloudFront distribution for CDK-deployed SPA assets |

The frontend is a Next.js app deployed to Vercel separately. The `signal-force-frontend`
CDK stack exists for static asset hosting but is not the primary Vercel deploy path.

---

## Environment variables expected at CDK synth time

These are read from the shell environment when you run `deploy-backend.sh`. They are NOT
committed to the repo. Set them in your shell or a local `.env` file (sourced manually, not
loaded by CDK automatically).

| Var | Purpose | Required? |
|---|---|---|
| `LITELLM_BASE_URL` | LiteLLM proxy URL | Yes for AI Assist |
| `LITELLM_API_KEY` | LiteLLM API key (from team Slack) | Yes for AI Assist |
| `LITELLM_MODEL` | Model ID for fraud classification | Optional (falls back to rule-only if absent) |
| `CLIENT_ID` | Basic Auth client ID | Optional (defaults to `demoClient`) |
| `CLIENT_SECRET` | Basic Auth client secret | Optional (defaults to `demoSecret`) |
| `SF_STAGE` | Deploy stage (`dev`/`prod`) | Optional (defaults to `dev`) |
| `FRAUD_ALERT_EMAIL` | Email to subscribe to fraud SNS topic | Optional |
| `BUDGET_ALERT_EMAIL` | Email to subscribe to budget SNS topic | Optional |

Variables hardcoded in the stack (not configurable via env):

| Var | Value | Notes |
|---|---|---|
| `MFA_MODE` | `static` | Accepts static OTP `123456` for the demo. Set to `totp` for production. |
| `DEMO_MODE` | `1` | Enables reseed endpoint, DemoPanel controls, and `forceMfa` on login. |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Native Bedrock inference (unused on LiteLLM path) |
| `FRAUD_SCORE_THRESHOLD` | `60` | Defined in `infra/cdk/lib/config.ts` |

---

## Lambda alias and immutable env vars

Lambda Versions snapshot environment variables at publish time. Updating `$LATEST`
via `aws lambda update-function-configuration` does NOT propagate to a published alias.
Always go through CDK to make env var changes reach the alias-served version:

```bash
set -a && source ../codefest/.env.local && set +a \
  && eval "$(aws configure export-credentials --format env)" \
  && npx cdk deploy signal-force-runtime --require-approval broadening
```

The deploy script (`scripts/deploy-backend.sh`) does this automatically. Use the
command above only when you want to deploy a single stack without the full script.

---

## Optional vars with Lambda-internal defaults

The following vars are not required at synth time but can be set to override defaults:

| Var | Demo value | Notes |
|---|---|---|
| `SESSION_TTL_SEC` | `1800` | Sliding window TTL for bearer tokens |
| `LITELLM_TIMEOUT_MS` | `8000` | Per-attempt LLM call timeout in ms |
| `LARGE_TRANSFER_AMOUNT_USD` | `5000` | Threshold for the high-value transfer rule |
| `UNSEEN_DEVICE_DAYS_THRESHOLD` | `30` | Days before a device is considered unseen |
| `LLM_GUARD_MAX_CALLS` | (internal) | Hard call count cap before `engine/budget.js` blocks LLM |

---

## CORS

The HTTP API is currently configured with `allowOrigins: ['*']` in `runtime-stack.ts`. This
is open for the hackathon. No changes needed to add Vercel preview URLs. If you tighten
this after the event, edit the `corsPreflight` block in `infra/cdk/lib/runtime-stack.ts`
and redeploy.

---

## First-time backend deploy

```bash
# One-time bootstrap per AWS account/region (needed once per account)
cd infra/cdk && cdk bootstrap && cd ../..

# Set LiteLLM credentials in your shell
export LITELLM_BASE_URL="<get from team Slack>"
export LITELLM_API_KEY="<get from team Slack>"
export LITELLM_MODEL="us.anthropic.claude-haiku-4-5-20251001-v1:0"

# Run the one-button deploy
./scripts/deploy-backend.sh
```

The script will:
1. Check prerequisites and AWS credentials
2. Refuse to deploy if there are uncommitted changes (pass `--allow-dirty` to skip)
3. Install CDK and backend dependencies
4. Run backend tests - deploy is aborted if any test fails
5. Deploy all four CDK stacks
6. Write the API URL to `apps/frontend/.env.production.local`

---

## First-time frontend deploy

```bash
./scripts/deploy-frontend.sh
```

The script will:
1. Verify `NEXT_PUBLIC_API_BASE_URL` is in `apps/frontend/.env.production.local`
2. Run TypeScript type-check
3. Build the Next.js production bundle
4. Run `vercel --prod` from `apps/frontend/`

On the first run, the Vercel CLI will prompt you to log in and choose a project name.
Accept the defaults. Note the live URL printed at the end.

---

## Subsequent deploys

Either script alone, in either order. They are idempotent. If you change backend env vars
(e.g. add `SESSION_TTL_SEC`), re-run `deploy-backend.sh` to roll out the new Lambda env.

If you only change frontend code, run `deploy-frontend.sh` alone.

---

## Rollback

Backend rollback (no redeploy needed):

```bash
# Find the prior Lambda version number
aws lambda list-versions-by-function --function-name <function-name>

# Point the live alias back at it
aws lambda update-alias \
  --function-name <function-name> \
  --name live \
  --function-version <prior-version-number>
```

CDK-level rollback (full stack):

```bash
cd infra/cdk && cdk deploy --rollback
```

Frontend rollback:

```bash
cd apps/frontend && vercel rollback
```

---

## Seeding DynamoDB after deploy

```bash
# From repo root - replaces all seed records per table
node scripts/seed-ddb.js
```

The Lambda also exposes `POST /admin/dev/reseed` when `DEMO_MODE=1` is set, which
the Demo controls panel uses to reset state between judge runs.

---

## Cost budget

Expected spend during the 2-day event and a week of judge access:

| Service | Estimate |
|---|---|
| Lambda (ARM64) | < $1 (PAY_PER_REQUEST) |
| DynamoDB | < $1 (PAY_PER_REQUEST) |
| API Gateway HTTP API | < $1 |
| CloudFront (SPA) | < $1 |
| Bedrock Haiku | $0.0006 per classify call, ~1000 calls = $0.60 |
| LiteLLM proxy | Billed via LiteLLM account, not AWS |

Total expected AWS spend: under $5. Three budget alarms are in place via the
`signal-force-budgets` stack: $25 (warn), $100 (alarm), $200 (forecast). Set
`BUDGET_ALERT_EMAIL` at synth time to receive email notifications.

---

## Tear down (after 2 weeks)

```bash
# Destroy all AWS resources in the stacks
# Note: check infra/cdk/lib/dynamodb-stack.ts for the RemovalPolicy before running.
cd infra/cdk && cdk destroy --all

# Remove the Vercel project
cd apps/frontend && vercel remove signal-force
```

Manually delete the LiteLLM Cloudflare Worker via the Cloudflare dashboard if it is
no longer needed.

---

## Quick reference - command sequence from a clean clone

```bash
git clone https://github.com/thegdsks/codefest-2026.git
cd codefest-2026
npm install

# Bootstrap CDK (once per AWS account/region)
cd infra/cdk && cdk bootstrap && cd ../..

# Set LiteLLM credentials
export LITELLM_BASE_URL="<from team Slack>"
export LITELLM_API_KEY="<from team Slack>"
export LITELLM_MODEL="us.anthropic.claude-haiku-4-5-20251001-v1:0"

# Deploy backend, then frontend
./scripts/deploy-backend.sh
./scripts/deploy-frontend.sh

# Seed tables
node scripts/seed-ddb.js
```

---

Related: [architecture-overview.md](./architecture-overview.md) | [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md) | [vercel-deploy-hooks.md](./vercel-deploy-hooks.md)
