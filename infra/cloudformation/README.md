# CloudFormation Templates

These templates are synthesized from the CDK app in `infra/cdk/`. Do not hand-edit them.
To make changes, update the CDK source and re-run `cdk synth` as described below.

## Files

| File | CDK stack ID | What it creates |
|---|---|---|
| `signal-force-dynamodb.yaml` | `signal-force-dynamodb` | Six DynamoDB tables (UserProfile, UserSession, UserActivity, DecisionStore, UserState, EngagementRules), all PAY_PER_REQUEST |
| `signal-force-budgets.yaml` | `signal-force-budgets` | AWS Budgets alarms at $25 warn / $100 alert / $200 forecast, SNS topic for notifications |
| `signal-force-runtime.yaml` | `signal-force-runtime` | Lambda function (Node.js 18), HTTP API Gateway, SNS fraud alert topic, CloudWatch dashboard, IAM roles |
| `signal-force-frontend.yaml` | `signal-force-frontend` | S3 bucket for the SPA, CloudFront distribution, bucket deployment custom resource |

## Deployment order

The runtime stack imports DynamoDB table ARNs from the dynamodb stack via CloudFormation exports.
Deploy in this order:

1. `signal-force-dynamodb`
2. `signal-force-budgets` (independent, can run in parallel with step 1)
3. `signal-force-runtime` (depends on dynamodb)
4. `signal-force-frontend` (independent)

## Lambda asset prerequisite

The runtime template references a Lambda zip at:

```
s3://cdk-hnb659fds-assets-<ACCOUNT>-<REGION>/<hash>.zip
```

This bucket is created by `cdk bootstrap`. Run `cdk bootstrap` once before deploying the runtime
stack, or upload the zip manually to a bucket you control and edit the `S3Bucket`/`S3Key` fields
in the template.

## Deploy commands

```bash
# DynamoDB tables (no IAM resources)
aws cloudformation deploy \
  --template-file signal-force-dynamodb.yaml \
  --stack-name signal-force-dynamodb

# Budgets (no IAM resources)
aws cloudformation deploy \
  --template-file signal-force-budgets.yaml \
  --stack-name signal-force-budgets

# Runtime Lambda + API (has IAM roles and policies)
aws cloudformation deploy \
  --template-file signal-force-runtime.yaml \
  --stack-name signal-force-runtime \
  --capabilities CAPABILITY_NAMED_IAM

# Frontend SPA hosting (has IAM roles and policies)
aws cloudformation deploy \
  --template-file signal-force-frontend.yaml \
  --stack-name signal-force-frontend \
  --capabilities CAPABILITY_NAMED_IAM
```

## Re-synthesizing

After changing the CDK source in `infra/cdk/`:

```bash
cd infra/cdk
CDK_NAG=off npx cdk synth <StackId> --json false > ../../infra/cloudformation/<file>.yaml
```

Strip the `CDKMetadata` resource, `BootstrapVersion` parameter, and `Rules` section before
committing, or use the `scripts/synth-cf.sh` helper if one exists. The canonical source is
always `infra/cdk/` - these YAML files are derived artifacts for judge/teammate use only.
