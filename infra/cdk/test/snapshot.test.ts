// Snapshot tests for all four CDK stacks.
//
// Non-determinism note: NodejsFunction (RuntimeStack) calls esbuild at synth
// time and produces a 64-character hex asset hash in the S3Key of the Lambda
// code property. That hash changes across machines and clean builds. To keep
// snapshots stable we replace every 64-char lowercase-hex run with the literal
// string ASSET_HASH before passing the template to toMatchSnapshot().
//
// If you need to regenerate snapshots after an intentional infra change, run:
//   cd infra/cdk && npx jest --testPathPattern snapshot --updateSnapshot

// Stub the deployment environment before any CDK module is imported.
process.env['CDK_DEFAULT_ACCOUNT'] = '000000000000';
process.env['CDK_DEFAULT_REGION'] = 'us-east-1';
// Keep the stage deterministic across all runs.
process.env['SF_STAGE'] = 'test';
// Disable cdk-nag so it does not inject Metadata that changes with library
// versions and would produce spurious snapshot diffs.
process.env['CDK_NAG'] = 'off';

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BudgetsStack } from '../lib/budgets-stack';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { RuntimeStack } from '../lib/runtime-stack';

// Replace all 64-char lowercase-hex strings (asset hashes from NodejsFunction
// and S3BucketDeployment) with the deterministic placeholder ASSET_HASH.
function normalise(template: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(template).replace(/[a-f0-9]{64}/g, 'ASSET_HASH'));
}

describe('signal-force CDK', () => {
  // Construct a single App and build all stacks on it once. Stacks that share
  // cross-stack references (RuntimeStack -> DynamoDbStack) must use the same
  // App instance.
  const app = new cdk.App({
    context: { expectedAccount: '000000000000', stage: 'test' },
  });

  const env = { account: '000000000000', region: 'us-east-1' };

  const dynamoDbStack = new DynamoDbStack(app, 'snap-dynamodb', { env });
  const budgetsStack = new BudgetsStack(app, 'snap-budgets', { env });
  const runtimeStack = new RuntimeStack(app, 'snap-runtime', { env, dynamoDbStack });
  const frontendStack = new FrontendStack(app, 'snap-frontend', { env });

  test('DynamoDbStack matches snapshot', () => {
    const template = normalise(Template.fromStack(dynamoDbStack).toJSON());
    expect(template).toMatchSnapshot();
  });

  test('BudgetsStack matches snapshot', () => {
    const template = normalise(Template.fromStack(budgetsStack).toJSON());
    expect(template).toMatchSnapshot();
  });

  test('RuntimeStack matches snapshot', () => {
    const template = normalise(Template.fromStack(runtimeStack).toJSON());
    expect(template).toMatchSnapshot();
  });

  test('FrontendStack matches snapshot', () => {
    const template = normalise(Template.fromStack(frontendStack).toJSON());
    expect(template).toMatchSnapshot();
  });
});
