# infra/cdk

AWS CDK (TypeScript) infrastructure for Codefest 2026.

Two stacks:
- `codefest-dynamodb` — five DynamoDB tables used by the backend Lambda
- `codefest-budgets` — monthly cost budgets with SNS email alerts

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

# Set alert email before deploying budgets stack
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

DynamoDB tables use `RemovalPolicy.DESTROY` — they are deleted with the stack.

## Outputs

Each table name is exported as a CloudFormation output:
`codefest-dynamodb:UserProfileTableName`, `...UserSessionTableName`, etc.
