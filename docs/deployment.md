# Deployment

## Prerequisites

- AWS account with credentials configured (`aws configure` or `AWS_PROFILE` set)
- Vercel account (free tier is enough)
- Node 20+, npm 10+
- AWS CDK CLI: `npm install -g aws-cdk`
- `jq`: `brew install jq`
- Vercel CLI: `npm install -g vercel`

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

## Environment variables expected at CDK synth time

These are read from the shell environment when you run `deploy-backend.sh`. They are NOT
committed to the repo. Set them in your shell or a local `.env` file (sourced manually, not
loaded by CDK automatically).

| Var | Purpose | Required? |
|---|---|---|
| `LITELLM_BASE_URL` | LiteLLM Cloudflare Worker proxy URL | Yes for AI Assist |
| `LITELLM_API_KEY` | LiteLLM API key (from team Slack) | Yes for AI Assist |
| `LITELLM_MODEL` | Model ID for fraud classification | Optional (defaults absent, falls back to Bedrock) |
| `CLIENT_ID` | Basic Auth client ID | Optional (defaults to `demoClient`) |
| `CLIENT_SECRET` | Basic Auth client secret | Optional (defaults to `demoSecret`) |
| `MFA_OTP` | Static demo OTP value | Optional (defaults to `123456`) |
| `SF_STAGE` | Deploy stage (`dev`/`prod`) | Optional (defaults to `dev`) |
| `FRAUD_ALERT_EMAIL` | Email to subscribe to fraud SNS topic | Optional |
| `BUDGET_ALERT_EMAIL` | Email to subscribe to budget SNS topic | Optional |

Variables hardcoded in the stack (not configurable via env):

| Var | Value | Notes |
|---|---|---|
| `MFA_MODE` | `static` | Accepts static OTP for the demo - not configurable at synth time |
| `DEMO_MODE` | `1` | Enables reseed endpoint and Demo controls UI |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Native Bedrock inference |
| `FRAUD_SCORE_THRESHOLD` | `60` | Defined in `infra/cdk/lib/config.ts` |

## Missing vars - action required before first deploy

The following vars from the original design are NOT wired into the Lambda environment
in the current CDK stack. The Lambda either uses hardcoded defaults or ignores them.
Add them to `runtime-stack.ts` in the `environment` block and redeploy if needed:

| Var | Demo value | Status |
|---|---|---|
| `SESSION_TTL_SEC` | `1800` | Not in stack - Lambda likely has an internal default |
| `LARGE_TRANSFER_AMOUNT_USD` | `5000` | Not in stack - Lambda likely has an internal default |
| `UNSEEN_DEVICE_DAYS_THRESHOLD` | `30` | Not in stack - Lambda likely has an internal default |
| `LITELLM_FALLBACK_MODELS` | `gemini-3.5-flash,nova-lite` | Not in stack |
| `LLM_DAILY_BUDGET_USD` | `250` | Not in stack - Lambda uses `LLM_GUARD_MAX_CALLS` instead |

## CORS

The HTTP API is currently configured with `allowOrigins: ['*']` in `runtime-stack.ts`. This
is open for the hackathon. No changes needed to add Vercel preview URLs. If you tighten
this after the event, edit the `corsPreflight` block in `infra/cdk/lib/runtime-stack.ts`
and redeploy.

## First-time backend deploy

```bash
# One-time bootstrap per AWS account/region (needed once per account)
cd infra/cdk && cdk bootstrap && cd ../..

# Set LiteLLM credentials in your shell
export LITELLM_BASE_URL="https://d1t4hkdc2i746c.cloudfront.net/v1"
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

## Subsequent deploys

Either script alone, in either order. They are idempotent. If you change backend env vars
(e.g. add `SESSION_TTL_SEC`), re-run `deploy-backend.sh` to roll out the new Lambda env.

If you only change frontend code, run `deploy-frontend.sh` alone.

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

## Seeding DynamoDB after deploy

```bash
# From repo root - replaces all 30 seed records per table
node scripts/seed-ddb.js
```

The Lambda also exposes a `POST /admin/reseed` endpoint when `DEMO_MODE=1` is set, which
the Demo controls panel uses to reset state between judge runs.

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

## Tear down (after 2 weeks)

```bash
# Destroy all AWS resources in the stacks
# Note: DynamoDB tables use RemovalPolicy.RETAIN by default in some stacks.
# Check infra/cdk/lib/dynamodb-stack.ts for the actual policy before running.
cd infra/cdk && cdk destroy --all

# Remove the Vercel project
cd apps/frontend && vercel remove signal-force
```

Manually delete the LiteLLM Cloudflare Worker at
`https://d1t4hkdc2i746c.cloudfront.net` if it is no longer needed.

## Quick reference - command sequence from a clean clone

```bash
git clone https://github.com/thegdsks/signal-force.git
cd signal-force
npm install

# Bootstrap CDK (once per AWS account/region)
cd infra/cdk && cdk bootstrap && cd ../..

# Set LiteLLM credentials
export LITELLM_BASE_URL="https://d1t4hkdc2i746c.cloudfront.net/v1"
export LITELLM_API_KEY="<from team Slack>"
export LITELLM_MODEL="us.anthropic.claude-haiku-4-5-20251001-v1:0"

# Deploy backend, then frontend
./scripts/deploy-backend.sh
./scripts/deploy-frontend.sh

# Seed tables
node scripts/seed-ddb.js
```
