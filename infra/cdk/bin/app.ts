#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BudgetsStack } from '../lib/budgets-stack';
import { DynamoDbStack } from '../lib/dynamodb-stack';

const app = new cdk.App();

new DynamoDbStack(app, 'signal-force-dynamodb', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'],
  },
  description: 'Signal Force - DynamoDB tables',
});

new BudgetsStack(app, 'signal-force-budgets', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'],
  },
  description: 'Signal Force - cost budgets and alerts',
});
