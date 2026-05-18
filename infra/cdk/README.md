# infra/cdk

The CDK app for Signal Force. Four stacks live here and they own everything we deploy to AWS for the demo.

The repo has three logical apps. The CDK turns them into two deployable artifacts plus the data layer.

## What lives where

| Logical app | Repo path | Build artifact | AWS service | CDK stack |
|---|---|---|---|---|
| Customer surface (SPA) | `apps/frontend/` | `dist/` (static bundle) | S3 + CloudFront | `signal-force-frontend` |
| Studio admin console (`/admin` route) | same as above | same as above | same as above | same as above |
| Decision engine | `apps/backend/` | folder zipped by Lambda asset | Lambda + API Gateway HTTP API | `signal-force-runtime` |
| Storage (5 tables) | n/a (schema in CDK) | n/a (managed service) | DynamoDB, PAY_PER_REQUEST | `signal-force-dynamodb` |
| Cost guardrails | n/a | n/a | AWS Budgets + SNS | `signal-force-budgets` |
| Fraud alert pipe | n/a | n/a | SNS topic (subscribe via email) | `signal-force-runtime` |
| Operational dashboard | n/a | n/a | CloudWatch dashboard | `signal-force-runtime` |
| API URL handoff | n/a | n/a | SSM Parameter Store at `/signal-force/api-url` | `signal-force-runtime` |
| SPA URL handoff | n/a | n/a | SSM Parameter Store at `/signal-force/spa-url` | `signal-force-frontend` |
| Audit logging | n/a | n/a | CloudWatch Logs (1 day Lambda, 1 week API access) | `signal-force-runtime` |

Two notes on this table:

1. The customer surface and the studio admin console are the same React bundle. The admin lives at `/admin` inside the SPA. So three logical apps, two deployables.
2. DynamoDB is regional and fully managed. There is no host to provision, no AZ to pick, no instance to scale. The tables exist inside `us-east-1` and the Lambda talks to them over the AWS-internal network using IAM auth.

## Stack dependency order

```
signal-force-dynamodb         (independent, deploy first)
        |
        v
signal-force-runtime          (depends on DynamoDB stack via prop-passing, not CFN exports)

signal-force-frontend         (independent, deploy any time after the SPA is built)
signal-force-budgets          (independent, can deploy any time)
```

The runtime stack takes the DynamoDB stack as a constructor prop. Cross-stack references go through CloudFormation exports under the hood, but prop-passing keeps the dependency explicit in code and avoids the deadly-embrace pattern (where removing an import deadlocks a deploy). See the AWS CDK docs entry on `exportValue` if you ever need to remove a cross-stack ref later.

## Frontend hosting

`signal-force-frontend` owns the SPA delivery surface:

```
S3 bucket (private, encrypted, SSL-enforced)
   ^
   | OAC (Origin Access Control)
   |
CloudFront distribution
   |
   | default cert (*.cloudfront.net) for the demo
   | custom domain + ACM cert later
```

The distribution has:

- `viewerProtocolPolicy: REDIRECT_TO_HTTPS`
- `cachePolicy: CACHING_OPTIMIZED` and the AWS-managed `SECURITY_HEADERS` response headers policy
- SPA error rewrites: 403 and 404 return `/index.html` with status 200 so React Router handles deep links
- `priceClass: PRICE_CLASS_100` (NA + EU edge locations only) to keep CloudFront cheap

Two deploy flows for the SPA bundle are supported:

**Auto-deploy via CDK** (recommended): if `apps/frontend/dist/` exists at synth time, the stack includes a `BucketDeployment` construct that uploads the bundle and invalidates the distribution on `cdk deploy`. Build the frontend first:

```
cd apps/frontend
VITE_API_URL=$(aws ssm get-parameter \
  --name /signal-force/api-url \
  --query Parameter.Value --output text) \
  npm run build
cd ../../infra/cdk
npx cdk deploy signal-force-frontend
```

**Manual sync**: skip the build step before `cdk deploy` and push later from any CI:

```
aws s3 sync apps/frontend/dist s3://<bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

The bucket name and distribution id come from the `BucketName` and `DistributionId` outputs on the frontend stack. The public URL is also published to SSM at `/signal-force/spa-url`.

## Prerequisites (one-time per AWS account)

1. AWS CLI installed and a profile with admin or close-to-admin permissions. Verify with `aws sts get-caller-identity`.
2. Node 18 or newer.
3. From repo root, `npm install` once to install workspace deps.
4. CDK bootstrap on the account + region you intend to deploy to:

   ```
   cd infra/cdk
   CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=us-east-1 \
     npx cdk bootstrap
   ```

   This creates a `CDKToolkit` stack with the asset S3 bucket and deploy role. Run once per account-region pair, not per stack.
5. In the AWS Console, open Amazon Bedrock in `us-east-1` and request model access for Claude Haiku 4.5. This is a manual approval that takes a few minutes. Without it the decision engine returns AccessDenied on Bedrock calls.

## First deploy walkthrough

```
cd infra/cdk

# Synth and look for nag findings before deploying
npm run synth

# DynamoDB tables first
CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=us-east-1 \
  npx cdk deploy signal-force-dynamodb

# Budgets so cost alerts are live before runtime
BUDGET_ALERT_EMAIL=you@example.com \
  npx cdk deploy signal-force-budgets

# Runtime: Lambda, HTTP API, fraud topic, dashboard
FRAUD_ALERT_EMAIL=you@example.com \
  npx cdk deploy signal-force-runtime

# Frontend: SPA bucket + CloudFront distribution
# Build the SPA first if you want cdk deploy to also upload it.
( cd ../../apps/frontend && \
  VITE_API_URL=$(aws ssm get-parameter \
    --name /signal-force/api-url \
    --query Parameter.Value --output text) \
    npm run build )
npx cdk deploy signal-force-frontend
```

Outputs you will get back:

Runtime stack:

- `ApiUrl`: the public HTTP API endpoint
- `LambdaFunctionName`: for `aws logs tail` and direct invokes
- `FraudAlertTopicArn`: for additional subscribers
- `DashboardUrl`: direct link to the CloudWatch dashboard

Frontend stack:

- `BucketName`: target for `aws s3 sync` when pushing builds manually
- `DistributionId`: for cache invalidation
- `DistributionUrl`: public HTTPS URL for the SPA

The runtime API URL is published to SSM at `/signal-force/api-url`. The SPA URL is published to SSM at `/signal-force/spa-url`. Frontend builds and any operator tooling can read these without needing a CloudFormation import.

## Inputs (env vars and context)

| Variable | Stack | Required | Default | Notes |
|---|---|---|---|---|
| `BUDGET_ALERT_EMAIL` | budgets | recommended | `change-me@example.com` | Email to receive budget alerts. Confirm the SNS subscription. |
| `FRAUD_ALERT_EMAIL` | runtime | no | none | If set, an email subscription is added at synth time. Otherwise subscribe manually via the `FraudAlertTopicArn` output. |
| `CLIENT_ID` | runtime | no | `demoClient` | Basic Auth client ID. Override via CDK context `--context clientId=...` or env var. |
| `CLIENT_SECRET` | runtime | no | `demoSecret` | Basic Auth client secret. Set via context or env. Do not commit real values. |
| `MFA_OTP` | runtime | no | `123456` | Static OTP for the demo MFA flow. Set via context or env. |
| `CDK_NAG` | all | no | enabled | Set to `off` to skip cdk-nag during synth for fast local iteration. CI should always run with nag on. |

## Seeding DynamoDB

After the DynamoDB stack is deployed, load the 30-rows-per-table demo data:

```
cd ../../seed_data
for f in *.json; do
  aws dynamodb batch-write-item --request-items "file://$f"
done
```

If `seed_data/` has a wrapper script (`seed.sh` or similar), prefer that.

## Subsequent deploys

```
cd infra/cdk
npm run synth          # full synth with cdk-nag
npx cdk diff --all     # always diff before deploy
npx cdk deploy --all   # deploy everything
```

## Testing the CDK code

```
npm run test           # jest, 29 assertions across the 4 stacks
npm run synth          # cdk-nag enforces AWS Solutions checks
npm run synth:fast     # skip nag for fast iteration
```

The jest tests run against synthesized CloudFormation templates. No AWS calls are made. Roughly 6 seconds and they cover table shapes, GSIs, Lambda config, IAM policies, API routes, SNS topics, SSM parameters, the CloudFront distribution, S3 bucket settings, and the dashboard.

## Teardown

```
npx cdk destroy --all
```

`removalPolicy: DESTROY` is set on all stateful resources for the hackathon (tables, log groups, SNS topics) so destroy is clean. Production would flip data resources to `RETAIN` and add `terminationProtection: true` on the data stack.

## Cost expectation

Realistic spend across the three stacks for the 48-hour demo:

| Resource | Why it costs little | Estimate |
|---|---|---|
| DynamoDB PAY_PER_REQUEST | Demo traffic is tens to hundreds of requests | under $0.10 |
| Lambda arm64 + HTTP API | A few thousand invocations at 512 MB | under $0.50 |
| Bedrock Haiku 4.5 | Called only on the warm lane, capped by `FRAUD_SCORE_THRESHOLD` | under $5 with liberal use |
| CloudWatch (logs + dashboard) | 1-day retention on Lambda, 1-week on API access logs | under $0.20 |
| SNS | A handful of fraud alert emails | free tier |
| AWS Budgets | First 2 free, third at $0.02/day | under $0.20 |
| S3 (SPA bucket) | A few MB of static assets | under $0.01 |
| CloudFront | New-account free tier covers 1 TB/month outbound for 12 months | $0 during demo |
| CDK bootstrap S3 bucket | A few MB of asset storage | under $0.01 |

Total demo spend lands well under the $250 team cap, even with active Bedrock use.

## When something does not work

- `Error: This stack uses assets, so the toolkit stack must be deployed to the environment`: run `cdk bootstrap` for the target account + region.
- `AccessDeniedException: bedrock:InvokeModel`: model access was not enabled in the Bedrock console for `us-east-1`.
- `ResourceNotFoundException` on a DynamoDB call: table was not seeded, or the Lambda env var points at the wrong table name. Check the runtime stack outputs.
- `502 Bad Gateway` from the API: open CloudWatch Logs for the Lambda. Most likely cause is a handler crash before the response is built.
- `cdk synth` fails with nag errors after a code change: read the finding, decide whether it is a real fix or a suppression with rationale. Do not blanket-suppress.
- Long-running `cdk deploy` that seems stuck: check the CloudFormation events in the console for a `CREATE_IN_PROGRESS` resource waiting on something external (Bedrock access, manual approval, etc).

## Design choices worth knowing

- Three stacks, not one. Keeps blast radius small. Data, runtime, and cost guardrails change at different cadences.
- Prop-passing for cross-stack refs, not raw `Fn::ImportValue`. Easier to refactor without deadly embrace.
- `pointInTimeRecoveryEnabled: true` on all tables. Cheap insurance against an accidental wipe during the demo.
- Lambda on arm64. About 20 percent cheaper and slightly faster cold starts than x86_64.
- HTTP API, not REST API. About 70 percent cheaper for the same throughput, all the features we need.
- cdk-nag AwsSolutionsChecks aspect at the app level. Every synth checks for AWS Solutions Library best practices. Suppressions live next to the construct that earned them, with reasons.
- All non-default suppressions are reviewable: search for `NagSuppressions.addResourceSuppressions` to find them.
