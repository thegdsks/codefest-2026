import type { App } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';

export const PROJECT_TAG = 'signal-force';

export const STACK_IDS = {
  dynamodb: 'signal-force-dynamodb',
  budgets: 'signal-force-budgets',
  runtime: 'signal-force-runtime',
  frontend: 'signal-force-frontend',
} as const;

export const TABLE_NAMES = {
  userProfile: 'UserProfile',
  userSession: 'UserSession',
  userActivity: 'UserActivity',
  decisionStore: 'DecisionStore',
  userState: 'UserState',
} as const;

export const BEDROCK_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
export const BEDROCK_MODEL_FAMILY_ARNS = [
  'arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*',
  'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5*',
];

export const FRAUD_SCORE_THRESHOLD = '60';

export const LAMBDA_DEFAULTS = {
  memorySize: 512,
  timeoutSeconds: 10,
} as const;

export const BUDGET_THRESHOLDS_USD = {
  warn: 25,
  alarm: 100,
  forecast: 200,
} as const;

export interface DeployEnv {
  account: string;
  region: string;
  stage: string;
}

export function resolveDeployEnv(app: App): DeployEnv {
  const account = process.env['CDK_DEFAULT_ACCOUNT'];
  const region = process.env['CDK_DEFAULT_REGION'];
  if (!account || !region) {
    throw new Error(
      'CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION must be set. Run `aws login` or `aws configure` and retry.'
    );
  }

  const expectedAccount =
    (app.node.tryGetContext('expectedAccount') as string | undefined) ??
    process.env['SF_EXPECTED_ACCOUNT'];
  if (expectedAccount && expectedAccount !== account) {
    throw new Error(
      `Wrong AWS account. Caller identity is ${account} but expectedAccount is ${expectedAccount}. ` +
        'Set SF_EXPECTED_ACCOUNT or context `expectedAccount` to the codefest account, or switch profiles.'
    );
  }

  const stage =
    (app.node.tryGetContext('stage') as string | undefined) ?? process.env['SF_STAGE'] ?? 'dev';

  return { account, region, stage };
}

export function applyProjectTags(app: App, stage: string): void {
  cdk.Tags.of(app).add('Project', PROJECT_TAG);
  cdk.Tags.of(app).add('Stage', stage);
}

export function ssmApiUrlPath(stage: string): string {
  return `/signal-force/${stage}/api-url`;
}

export function ssmSpaUrlPath(stage: string): string {
  return `/signal-force/${stage}/spa-url`;
}
