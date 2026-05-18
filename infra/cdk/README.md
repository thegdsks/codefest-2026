# infra/cdk

AWS CDK (TypeScript) infrastructure for the Signal Force platform.

Two stacks:

- `signal-force-dynamodb`: five DynamoDB tables used by the backend Lambda
- `signal-force-budgets`: monthly cost budgets with SNS email alerts

## Prerequisites

- Node.js 18+
- AWS credentials configured (`aws configure` or SSO)
- CDK bootstrapped in your account/region (one-time):
  ```
  cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
  ```

## Deploy

```bash
cd infra/cdk
npm install

# Set alert email before deploying the budgets stack
export BUDGET_ALERT_EMAIL=you@example.com
# or pass via context:
# --context budgetAlertEmail=you@example.com

npx cdk deploy --all
```

Confirm the SNS subscription email that AWS sends after deploy.

## Destroy

```bash
npx cdk destroy --all
```

DynamoDB tables use `RemovalPolicy.DESTROY` and are deleted with the stack.

## Outputs

Each table name is exported as a CloudFormation output:
`signal-force-dynamodb:UserProfileTableName`, `...UserSessionTableName`, etc.

## signal-force-runtime

Lambda function, HTTP API, fraud-alert SNS topic, and CloudWatch dashboard.

### Inputs (env vars at deploy time)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `FRAUD_ALERT_EMAIL` | no | (none) | If set, an email subscription is added to the fraud alert SNS topic at synth time. Otherwise subscribe manually after deploy using the `FraudAlertTopicArn` output. |
| `CLIENT_ID` | no | `demoClient` | Basic Auth client ID. Override via CDK context `--context clientId=...` or env var. |
| `CLIENT_SECRET` | no | `demoSecret` | Basic Auth client secret. Set via context or env. Do not commit real values. |
| `MFA_OTP` | no | `123456` | Static OTP for the demo MFA flow. Set via context or env. |

### Outputs

| Output | Description |
|---|---|
| `signal-force-runtime:ApiUrl` | HTTP API base URL |
| `signal-force-runtime:LambdaFunctionName` | Lambda function name |
| `signal-force-runtime:FraudAlertTopicArn` | SNS topic ARN for fraud alerts (subscribe here if `FRAUD_ALERT_EMAIL` was not set) |
| `signal-force-runtime:DashboardUrl` | CloudWatch console link to the `signal-force-demo` dashboard |

### Deploy example

```bash
cd infra/cdk

# Optionally pre-subscribe an email to fraud alerts
export FRAUD_ALERT_EMAIL=you@example.com

# Override credentials (do not commit)
npx cdk deploy signal-force-runtime \
  --context clientSecret=realSecret \
  --context mfaOtp=654321
```
