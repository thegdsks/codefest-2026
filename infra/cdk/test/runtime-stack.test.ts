import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { RuntimeStack } from '../lib/runtime-stack';

describe('RuntimeStack', () => {
  const app = new cdk.App();
  const env = { account: '000000000000', region: 'us-east-1' };
  const dynamoDb = new DynamoDbStack(app, 'test-dynamodb', { env });
  const stack = new RuntimeStack(app, 'test-runtime', { env, dynamoDbStack: dynamoDb });
  const template = Template.fromStack(stack);

  test('creates one Lambda function on Node 18 arm64', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs18.x',
      Architectures: ['arm64'],
      Handler: 'index.main',
      MemorySize: 512,
      Timeout: 10,
    });
  });

  test('Lambda environment carries table names and Bedrock model id', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          TABLE_USER_PROFILE: Match.anyValue(),
          TABLE_USER_SESSION: Match.anyValue(),
          TABLE_USER_ACTIVITY: Match.anyValue(),
          TABLE_DECISION_STORE: Match.anyValue(),
          TABLE_USER_STATE: Match.anyValue(),
          BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
          FRAUD_SCORE_THRESHOLD: '60',
        }),
      },
    });
  });

  test('creates an HTTP API with CORS and a default stage', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['*'],
        AllowMethods: ['*'],
      }),
    });
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
  });

  test('default stage has access logging wired to a log group', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      AccessLogSettings: Match.objectLike({
        DestinationArn: Match.anyValue(),
        Format: Match.stringLikeRegexp('requestId'),
      }),
    });
  });

  test('creates a routes for proxy+ and root', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 2);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /{proxy+}',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /',
    });
  });

  test('creates SNS fraud alert topic and grants publish to Lambda role', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sns:Publish',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Lambda role has a Bedrock invoke statement scoped to Haiku 4.5', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'BedrockHaikuAccess',
            Action: ['bedrock:InvokeModel', 'bedrock:Converse'],
            Resource: [
              'arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*',
              'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5*',
            ],
          }),
        ]),
      },
    });
  });

  test('publishes API URL to SSM parameter store', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/signal-force/dev/api-url',
      Type: 'String',
    });
  });

  test('creates the CloudWatch dashboard', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'signal-force-demo',
    });
  });
});
