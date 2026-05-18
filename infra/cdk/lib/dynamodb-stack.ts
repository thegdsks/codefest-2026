import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

const PROJECT_TAG = 'signal-force';

export class DynamoDbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // UserProfile: PK userId, GSI username-index on username
    const userProfileTable = new dynamodb.Table(this, 'UserProfileTable', {
      tableName: 'UserProfile',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    userProfileTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(userProfileTable).add('Project', PROJECT_TAG);

    // UserSession: PK sessionId, GSI userId-index on userId
    const userSessionTable = new dynamodb.Table(this, 'UserSessionTable', {
      tableName: 'UserSession',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    userSessionTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(userSessionTable).add('Project', PROJECT_TAG);

    // UserActivity: PK userId, SK activityTime (number), TTL on "ttl"
    const userActivityTable = new dynamodb.Table(this, 'UserActivityTable', {
      tableName: 'UserActivity',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'activityTime', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });
    cdk.Tags.of(userActivityTable).add('Project', PROJECT_TAG);

    // DecisionStore: PK decisionId, GSI userId-timestamp-index (userId HASH + timestamp RANGE)
    const decisionStoreTable = new dynamodb.Table(this, 'DecisionStoreTable', {
      tableName: 'DecisionStore',
      partitionKey: { name: 'decisionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    decisionStoreTable.addGlobalSecondaryIndex({
      indexName: 'userId-timestamp-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(decisionStoreTable).add('Project', PROJECT_TAG);

    // UserState: PK userId, no GSIs
    const userStateTable = new dynamodb.Table(this, 'UserStateTable', {
      tableName: 'UserState',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(userStateTable).add('Project', PROJECT_TAG);

    // CfnOutputs: export each table name for cross-stack and backend reference
    new cdk.CfnOutput(this, 'UserProfileTableName', {
      value: userProfileTable.tableName,
      exportName: `${this.stackName}:UserProfileTableName`,
    });
    new cdk.CfnOutput(this, 'UserSessionTableName', {
      value: userSessionTable.tableName,
      exportName: `${this.stackName}:UserSessionTableName`,
    });
    new cdk.CfnOutput(this, 'UserActivityTableName', {
      value: userActivityTable.tableName,
      exportName: `${this.stackName}:UserActivityTableName`,
    });
    new cdk.CfnOutput(this, 'DecisionStoreTableName', {
      value: decisionStoreTable.tableName,
      exportName: `${this.stackName}:DecisionStoreTableName`,
    });
    new cdk.CfnOutput(this, 'UserStateTableName', {
      value: userStateTable.tableName,
      exportName: `${this.stackName}:UserStateTableName`,
    });
  }
}
