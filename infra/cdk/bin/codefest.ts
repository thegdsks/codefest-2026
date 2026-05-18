#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { BudgetsStack } from '../lib/budgets-stack';

const app = new cdk.App();

new DynamoDbStack(app, 'codefest-dynamodb', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'],
  },
  description: 'Codefest 2026 — DynamoDB tables',
});

new BudgetsStack(app, 'codefest-budgets', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'],
  },
  description: 'Codefest 2026 — cost budgets and alerts',
});
