import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import {
  BEDROCK_MODEL_FAMILY_ARNS,
  BEDROCK_MODEL_ID,
  FRAUD_SCORE_THRESHOLD,
  LAMBDA_DEFAULTS,
  ssmApiUrlPath,
} from './config';
import type { DynamoDbStack } from './dynamodb-stack';

export interface RuntimeStackProps extends cdk.StackProps {
  dynamoDbStack: DynamoDbStack;
}

export class RuntimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    const { dynamoDbStack } = props;

    // Stage drives SSM parameter paths so deploys to different environments
    // do not overwrite each other. Defaults to 'dev' when SF_STAGE is unset.
    const stage = process.env['SF_STAGE'] ?? 'dev';

    // -------------------------------------------------------------------------
    // SNS fraud alert topic
    // -------------------------------------------------------------------------
    const fraudAlertTopic = new sns.Topic(this, 'FraudAlertTopic', {
      displayName: 'signal-force fraud alerts',
    });

    // Subscribe an email address only when the env var is provided at synth time.
    // If not set, the topic ARN is exported below so manual subscription is easy.
    const fraudAlertEmail = process.env['FRAUD_ALERT_EMAIL'];
    if (fraudAlertEmail) {
      fraudAlertTopic.addSubscription(new subscriptions.EmailSubscription(fraudAlertEmail));
    }

    // -------------------------------------------------------------------------
    // Lambda - NodejsFunction bundles with esbuild, preventing the npm-workspace
    // hoisting regression hit in PR 13 where uuid disappeared from the asset.
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

    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      entry: path.join(__dirname, '..', '..', '..', 'apps', 'backend', 'src', 'handler.js'),
      handler: 'main',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: LAMBDA_DEFAULTS.memorySize,
      timeout: cdk.Duration.seconds(LAMBDA_DEFAULTS.timeoutSeconds),
      depsLockFilePath: path.join(__dirname, '..', '..', '..', 'package-lock.json'),
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node18',
        externalModules: ['@aws-sdk/*'],
      },
      // No reservedConcurrentExecutions: this account's total concurrency quota
      // is 10 with a 10-reserved floor, so reserving any amount is rejected.
      // API Gateway throttlingRateLimit (20 rps) is the load bound instead, and
      // each Lambda instance still has its own LLM_GUARD_MAX_CALLS sliding window.
      tracing: lambda.Tracing.ACTIVE,
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
        TABLE_ENGAGEMENT_RULES: dynamoDbStack.engagementRulesTable.tableName,
        // Cross-region inference profile for Claude Haiku 4.5 (US)
        BEDROCK_MODEL_ID,
        FRAUD_ALERT_TOPIC_ARN: fraudAlertTopic.topicArn,
        // Threshold is a string because Lambda env vars are always strings
        FRAUD_SCORE_THRESHOLD,
        // Demo env: static OTP accepted, forceMfa shortcut enabled
        MFA_MODE: 'static',
        DEMO_MODE: '1',
        // LiteLLM proxy creds: read from synth-time env so values are never
        // committed. Keys are omitted from the Lambda env block entirely when
        // unset so engine/llm.js short-circuits cleanly instead of trying to
        // call an empty URL.
        ...(process.env['LITELLM_BASE_URL']
          ? { LITELLM_BASE_URL: process.env['LITELLM_BASE_URL'] }
          : {}),
        ...(process.env['LITELLM_API_KEY']
          ? { LITELLM_API_KEY: process.env['LITELLM_API_KEY'] }
          : {}),
        ...(process.env['LITELLM_MODEL'] ? { LITELLM_MODEL: process.env['LITELLM_MODEL'] } : {}),
      },
    });

    // -------------------------------------------------------------------------
    // IAM grants
    // -------------------------------------------------------------------------
    dynamoDbStack.userProfileTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userSessionTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userActivityTable.grantReadWriteData(apiLambda);
    dynamoDbStack.decisionStoreTable.grantReadWriteData(apiLambda);
    dynamoDbStack.userStateTable.grantReadWriteData(apiLambda);
    dynamoDbStack.engagementRulesTable.grantReadWriteData(apiLambda);

    fraudAlertTopic.grantPublish(apiLambda);

    // Bedrock: allow InvokeModel and Converse on Haiku 4.5 foundation model
    // and the US cross-region inference profile ARN pattern
    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'BedrockHaikuAccess',
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: BEDROCK_MODEL_FAMILY_ARNS,
      })
    );

    // -------------------------------------------------------------------------
    // Lambda version + Live alias for rollback safety.
    // CDK publishes a new immutable version on every deploy via currentVersion.
    // The Live alias points at that version so the API always hits a pinned
    // artefact. Rollback is a one-liner that does not require a redeploy:
    //   aws lambda update-alias --function-name <name> --name live \
    //     --function-version <prior-version-number>
    // -------------------------------------------------------------------------
    const liveAlias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'live',
      version: apiLambda.currentVersion,
    });

    // -------------------------------------------------------------------------
    // API Gateway HTTP API (v2 - HttpApi)
    // The integration targets the Live alias, not $LATEST, so every request
    // runs against the published version pinned by the alias above.
    // -------------------------------------------------------------------------
    const api = new apigatewayv2.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
      },
    });

    const aliasIntegration = new HttpLambdaIntegration('AliasIntegration', liveAlias);

    api.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: aliasIntegration,
    });

    // Catch the root path too
    api.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: aliasIntegration,
    });

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
      // HttpApi v2 has no tracingEnabled prop; use the L1 escape hatch on the default stage.
      // Throttling: 20 rps steady-state, burst cap of 40 (2x steady, generous for a demo
      // with 5 reserved concurrency slots). UsagePlan is RestApi (v1) only; for HttpApi v2
      // the throttle lives on defaultRouteSettings via the CfnStage L1 escape hatch.
      defaultStage.defaultRouteSettings = {
        ...(defaultStage.defaultRouteSettings as Record<string, unknown> | undefined),
        detailedMetricsEnabled: true,
        throttlingRateLimit: 20,
        throttlingBurstLimit: 40,
      };
    }

    // -------------------------------------------------------------------------
    // CloudWatch dashboard - signal-force-runtime
    // Four tiles arranged 2x2 (12 wide x 6 tall each).
    // -------------------------------------------------------------------------
    const dashboard = new cloudwatch.Dashboard(this, 'SignalForceDemoDashboard', {
      dashboardName: 'signal-force-runtime',
      defaultInterval: cdk.Duration.hours(1),
    });

    // Tile 1: Lambda invocations (sum) + errors (sum) overlay, 1-min resolution
    // Tile 2: Lambda duration p50 / p95, 1-min resolution
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda invocations and errors',
        left: [
          apiLambda.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Invocations',
          }),
        ],
        right: [
          apiLambda.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Errors',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda duration p50 / p95',
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
        ],
        width: 12,
        height: 6,
      })
    );

    // Tile 3: API Gateway 4xx / 5xx overlay, 1-min resolution
    // Tile 4: LLMInvocations (sum, stacked) + LLMLatencyMs p95 overlay, 1-min resolution
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway 4xx / 5xx',
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
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'LLM invocations (stacked area) and latency p95',
        left: [
          new cloudwatch.Metric({
            namespace: 'SignalForce',
            metricName: 'LLMInvocations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'LLM Invocations',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'SignalForce',
            metricName: 'LLMLatencyMs',
            statistic: 'p95',
            period: cdk.Duration.minutes(1),
            label: 'LLM Latency p95 (ms)',
          }),
        ],
        leftYAxis: { label: 'Count', showUnits: false },
        rightYAxis: { label: 'ms', showUnits: false },
        stacked: true,
        width: 12,
        height: 6,
      })
    );

    // -------------------------------------------------------------------------
    // CloudWatch alarms - demo-day alerting via the fraud SNS topic.
    // Both alarms use a 1-minute period and a threshold of 1 so the team is
    // notified at the first sign of trouble during the presentation. They
    // auto-reset after one minute of no breach (treatMissingData NOT_BREACHING).
    // -------------------------------------------------------------------------
    const snsAlarmAction = new cloudwatchActions.SnsAction(fraudAlertTopic);

    // Alarm 1: Lambda errors (any 5xx produced by the function itself)
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'signal-force-lambda-5xx',
      alarmDescription:
        'Lambda emitted a 5xx during the codefest demo. Check CloudWatch Logs for the root cause.',
      metric: apiLambda.metricErrors({
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorAlarm.addAlarmAction(snsAlarmAction);

    // Alarm 2: API Gateway HTTP API 5xx errors
    // HttpApi.metricServerError() returns the 5XXError metric for the default stage.
    const apiGateway5xxAlarm = new cloudwatch.Alarm(this, 'ApiGateway5xxAlarm', {
      alarmName: 'signal-force-api-5xx',
      alarmDescription:
        'API Gateway 5xx during demo. Likely a Lambda integration failure or timeout.',
      metric: api.metricServerError({
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiGateway5xxAlarm.addAlarmAction(snsAlarmAction);

    // Alarm 3: LLM invocation rate exceeds 200 calls/hour across all instances.
    // The EMF metric is emitted from llm.js on every real LLM call; CloudWatch
    // aggregates it across all dimensions. Firing here means the sliding-window
    // guard may not be enough on its own - investigate for bugs or attack traffic.
    const llmBudgetAlarm = new cloudwatch.Alarm(this, 'LlmBudgetAlarm', {
      alarmName: 'signal-force-llm-budget',
      alarmDescription:
        'LLM invocations exceeded 200/hr. Check for bug loops or unexpected traffic. ' +
        'Tune LLM_GUARD_MAX_CALLS and LLM_GUARD_WINDOW_SEC env vars if thresholds need adjustment.',
      metric: new cloudwatch.Metric({
        namespace: 'SignalForce',
        metricName: 'LLMInvocations',
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      }),
      threshold: 200,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    llmBudgetAlarm.addAlarmAction(snsAlarmAction);

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
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'X-Ray PutTraceSegments and PutTelemetryRecords cannot be scoped to specific resource ARNs (AWS docs require Resource: *). Enabled by lambda.Tracing.ACTIVE so the runtime function appears in X-Ray traces.',
          appliesTo: ['Resource::*'],
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
    // Path is stage-scoped via ssmApiUrlPath so dev and prod do not collide.
    new ssm.StringParameter(this, 'ApiUrlParam', {
      parameterName: ssmApiUrlPath(stage),
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

    new cdk.CfnOutput(this, 'LiveAliasArn', {
      value: liveAlias.functionArn,
      exportName: `${this.stackName}:LiveAliasArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=signal-force-runtime`,
      exportName: `${this.stackName}:DashboardUrl`,
    });
  }
}
