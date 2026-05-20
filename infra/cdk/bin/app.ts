#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BudgetsStack } from '../lib/budgets-stack';
import { applyProjectTags, resolveDeployEnv, STACK_IDS } from '../lib/config';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { RuntimeStack } from '../lib/runtime-stack';

const app = new cdk.App();

const env = resolveDeployEnv(app);

const dynamoDb = new DynamoDbStack(app, STACK_IDS.dynamodb, {
  env: { account: env.account, region: env.region },
  description: 'Signal Force - DynamoDB tables',
});

new BudgetsStack(app, STACK_IDS.budgets, {
  env: { account: env.account, region: env.region },
  description: 'Signal Force - cost budgets and alerts',
});

new RuntimeStack(app, STACK_IDS.runtime, {
  env: { account: env.account, region: env.region },
  description: 'Signal Force - runtime (Lambda, HTTP API, fraud alert, dashboard)',
  dynamoDbStack: dynamoDb,
});

new FrontendStack(app, STACK_IDS.frontend, {
  env: { account: env.account, region: env.region },
  description: 'Signal Force - SPA hosting (S3 + CloudFront)',
});

applyProjectTags(app, env.stage);

// cdk-nag: AWS Solutions ruleset. Verbose so findings list resource paths.
// Set CDK_NAG=off at synth time to skip locally when iterating.
if (process.env['CDK_NAG'] !== 'off') {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
