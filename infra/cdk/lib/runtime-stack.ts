import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import type { DynamoDbStack } from './dynamodb-stack';

const PROJECT_TAG = 'signal-force';

export interface RuntimeStackProps extends cdk.StackProps {
  dynamoDbStack: DynamoDbStack;
}

export class RuntimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    const { dynamoDbStack } = props;

    // -------------------------------------------------------------------------
    // SNS fraud alert topic
    // -------------------------------------------------------------------------
    const fraudAlertTopic = new sns.Topic(this, 'FraudAlertTopic', {
      displayName: 'signal-force fraud alerts',
    });
    cdk.Tags.of(fraudAlertTopic).add('Project', PROJECT_TAG);

    // Subscribe an email address only when the env var is provided at synth time.
    // If not set, the topic ARN is exported below so manual subscription is easy.
    const fraudAlertEmail = process.env['FRAUD_ALERT_EMAIL'];
    if (fraudAlertEmail) {
      fraudAlertTopic.addSubscription(new subscriptions.EmailSubscription(fraudAlertEmail));
    }

    // -------------------------------------------------------------------------
    // Lambda - asset is the apps/backend directory so node_modules is included
    // -------------------------------------------------------------------------
    // CLIENT_SECRET and MFA_OTP: set via context or env at deploy time.
    // Do not commit real values. Defaults here are demo placeholders only.
    const clientId =
      (this.node.tryGetContext('clientId') as string | undefined) ??
      process.env['CLIENT_ID'] ??
      'demoClient';
    const clientSecret =
      (this.node.tryGetContext('clientSecret') as string | undefined) ??
      process.env['CLIENT_SECRET'] ??
      'demoSecret';
    const mfaOtp =
      (this.node.tryGetContext('mfaOtp') as string | undefined) ??
      process.env['MFA_OTP'] ??
      '123456';

    const logGroup = new logs.LogGroup(this, 'ApiLambdaLogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      // Asset root is apps/backend so node_modules/uuid is included in the zip
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', '..', 'apps', 'backend'), {
        exclude: ['node_modules/.cache', '.serverless', '.nyc_output'],
      }),
      // The file is src/handler.js and exports.main is the entry point
      handler: 'src/handler.main',
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      architecture: lambda.Architecture.ARM_64,
      logGroup,
      environment: {
        CLIENT_ID: clientId,
        CLIENT_SECRET: clientSecret,
        MFA_OTP: mfaOtp,
        TABLE_USER_PROFILE: dynamoDbStack.userProfileTable.tableName,
        TABLE_USER_SESSION: dynamoDbStack.userSessionTable.tableName,
        TABLE_USER_ACTIVITY: dynamoDbStack.userActivityTable.tableName,
        TABLE_DECISION_STORE: dynamoDbStack.decisionStoreTable.tableName,
        TABLE_USER_STATE: dynamoDbStack.userStateTable.tableName,
        // Cross-region inference profile for Claude Haiku 4.5 (US)
        BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        FRAUD_ALERT_TOPIC_ARN: fraudAlertTopic.topicArn,
        // Threshold is a string because Lambda env vars are always strings
        FRAUD_SCORE_THRESHOLD: '60',
      },
    });
    cdk.Tags.of(apiLambda).add('Project', PROJECT_TAG);

    // -------------------------------------------------------------------------
    // IAM grants
    // -------------------------------------------------------------------------
    dynamoDbStack.userProfileTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userSessionTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userActivityTable.grantReadWriteData(apiLambda);
    dynamoDbStack.decisionStoreTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userStateTable.grantReadWriteData(apiLambda);

    fraudAlertTopic.grantPublish(apiLambda);

    // Bedrock: allow InvokeModel and Converse on Haiku 4.5 foundation model
    // and the US cross-region inference profile ARN pattern
    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockHaikuAccess',
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*',
          'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5*',
        ],
      })
    );

    // -------------------------------------------------------------------------
    // API Gateway HTTP API
    // -------------------------------------------------------------------------
    const integration = new HttpLambdaIntegration('LambdaIntegration', apiLambda);

    const api = new apigatewayv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
      },
    });

    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    // Catch the root path too
    api.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
    });

    cdk.Tags.of(api).add('Project', PROJECT_TAG);

    // Access logging on the default stage. Format keeps the JSON small so
    // CloudWatch ingestion cost stays in the cents-per-month range for the demo.
    const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const defaultStage = api.defaultStage?.node.defaultChild as apigatewayv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.accessLogSettings = {
        destinationArn: apiAccessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
          integrationErrorMessage: '$context.integrationErrorMessage',
        }),
      };
    }

    // -------------------------------------------------------------------------
    // CloudWatch dashboard
    // -------------------------------------------------------------------------
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'signal-force-demo',
    });

    // Row 1: Lambda invocations/errors | Lambda duration percentiles
    dashboard.addWidgets(
      new cloudwatch.Row(
        new cloudwatch.GraphWidget({
          title: 'Lambda invocations and errors',
          left: [
            apiLambda.metricInvocations({ statistic: 'Sum', period: cdk.Duration.minutes(1) }),
          ],
          right: [apiLambda.metricErrors({ statistic: 'Sum', period: cdk.Duration.minutes(1) })],
          width: 12,
        }),
        new cloudwatch.GraphWidget({
          title: 'Lambda duration (ms) - p50 / p95 / p99',
          left: [
            apiLambda.metricDuration({
              statistic: 'p50',
              period: cdk.Duration.minutes(1),
              label: 'p50',
            }),
            apiLambda.metricDuration({
              statistic: 'p95',
              period: cdk.Duration.minutes(1),
              label: 'p95',
            }),
            apiLambda.metricDuration({
              statistic: 'p99',
              period: cdk.Duration.minutes(1),
              label: 'p99',
            }),
          ],
          width: 12,
        })
      )
    );

    // Row 2: API Gateway error counts and latency | DecisionStore write activity
    dashboard.addWidgets(
      new cloudwatch.Row(
        new cloudwatch.GraphWidget({
          title: 'API Gateway 4xx / 5xx / latency',
          left: [
            api.metricClientError({
              statistic: 'Sum',
              period: cdk.Duration.minutes(1),
              label: '4xx',
            }),
            api.metricServerError({
              statistic: 'Sum',
              period: cdk.Duration.minutes(1),
              label: '5xx',
            }),
          ],
          right: [
            api.metricLatency({
              statistic: 'p99',
              period: cdk.Duration.minutes(1),
              label: 'latency p99',
            }),
          ],
          width: 12,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'DecisionStore writes (last hour)',
          metrics: [
            dynamoDbStack.decisionStoreTable.metricConsumedWriteCapacityUnits({
              statistic: 'Sum',
              period: cdk.Duration.hours(1),
              label: 'Write CU',
            }),
          ],
          width: 12,
        })
      )
    );

    // Row 3: Fraud log query - real-time view of FRAUD log lines
    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: 'Fraud-related log lines',
        logGroupNames: [logGroup.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'filter @message like /FRAUD/',
          'sort @timestamp desc',
          'limit 50',
        ],
        width: 24,
        height: 6,
      })
    );

    // -------------------------------------------------------------------------
    // cdk-nag suppressions: documented architecture choices, not oversights.
    // Each entry has a reason that explains why it is acceptable for this app.
    // Revisit during post-event hardening.
    // -------------------------------------------------------------------------
    NagSuppressions.addResourceSuppressions(
      fraudAlertTopic,
      [
        {
          id: 'AwsSolutions-SNS3',
          reason:
            'Demo topic for internal fraud notifications. AWS SDK and Lambda publish over TLS by default. SSE will be revisited when the topic carries real user data.',
        },
        {
          id: 'AwsSolutions-SNS2',
          reason:
            'Demo topic. KMS-managed encryption deferred until the topic carries production payloads.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      apiLambda,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'Node.js 18 is the documented runtime for this hackathon (see AGENTS.md). Bump tracked as post-event work before Lambda EOL.',
        },
      ],
      true
    );
    const lambdaRole = apiLambda.role;
    if (!lambdaRole) {
      throw new Error('apiLambda.role is undefined which should not happen');
    }
    NagSuppressions.addResourceSuppressions(
      lambdaRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWSLambdaBasicExecutionRole is the CDK default for Lambda CloudWatch Logs access and is acceptable.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'GSI wildcards are required by Table.grantReadWriteData so the function can query the indexes attached to each table.',
          appliesTo: [
            'Resource::<UserProfileTable61BB5480.Arn>/index/*',
            'Resource::<UserSessionTableCD18DD22.Arn>/index/*',
            'Resource::<DecisionStoreTable3E281CE6.Arn>/index/*',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Bedrock foundation-model and inference-profile ARNs use a model-family wildcard so the function works across Haiku 4.5 minor versions without redeploy.',
          appliesTo: [
            'Resource::arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*',
            'Resource::arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5*',
          ],
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      api,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Authorization is handled in-Lambda by the Basic Auth + static MFA OTP flow documented in AGENTS.md. Replace with Cognito + WAF post-event (see docs/architecture.md upgrade path).',
        },
      ],
      true
    );

    // -------------------------------------------------------------------------
    // Outputs
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      exportName: `${this.stackName}:ApiUrl`,
    });

    // Publish the API URL to SSM so the frontend build can read it without
    // a coupled CloudFormation import. Avoids deadly-embrace on rename.
    new ssm.StringParameter(this, 'ApiUrlParam', {
      parameterName: '/signal-force/api-url',
      stringValue: api.apiEndpoint,
      description: 'HTTP API endpoint for the signal-force runtime stack',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: apiLambda.functionName,
      exportName: `${this.stackName}:LambdaFunctionName`,
    });

    new cdk.CfnOutput(this, 'FraudAlertTopicArn', {
      value: fraudAlertTopic.topicArn,
      exportName: `${this.stackName}:FraudAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=signal-force-demo`,
      exportName: `${this.stackName}:DashboardUrl`,
    });
  }
}
