#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BudgetsStack } from '../lib/budgets-stack';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { RuntimeStack } from '../lib/runtime-stack';

const app = new cdk.App();

const sharedEnv = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'],
};

const dynamoDb = new DynamoDbStack(app, 'signal-force-dynamodb', {
  env: sharedEnv,
  description: 'Signal Force - DynamoDB tables',
});

new BudgetsStack(app, 'signal-force-budgets', {
  env: sharedEnv,
  description: 'Signal Force - cost budgets and alerts',
});

new RuntimeStack(app, 'signal-force-runtime', {
  env: sharedEnv,
  description: 'Signal Force - runtime (Lambda, HTTP API, fraud alert, dashboard)',
  dynamoDbStack: dynamoDb,
});

new FrontendStack(app, 'signal-force-frontend', {
  env: sharedEnv,
  description: 'Signal Force - SPA hosting (S3 + CloudFront)',
});

// cdk-nag: AWS Solutions ruleset. Verbose so findings list resource paths.
// Set CDK_NAG=off at synth time to skip locally when iterating.
if (process.env['CDK_NAG'] !== 'off') {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
