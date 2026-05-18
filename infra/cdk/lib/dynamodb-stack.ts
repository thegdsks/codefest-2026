import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

const PROJECT_TAG = 'signal-force';

export class DynamoDbStack extends cdk.Stack {
  public readonly userProfileTable: dynamodb.Table;
  public readonly userSessionTable: dynamodb.Table;
  public readonly userActivityTable: dynamodb.Table;
  public readonly decisionStoreTable: dynamodb.Table;
  public readonly userStateTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // UserProfile: PK userId, GSI username-index on username
    this.userProfileTable = new dynamodb.Table(this, 'UserProfileTable', {
      tableName: 'UserProfile',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.userProfileTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(this.userProfileTable).add('Project', PROJECT_TAG);

    // UserSession: PK sessionId, GSI userId-index on userId
    this.userSessionTable = new dynamodb.Table(this, 'UserSessionTable', {
      tableName: 'UserSession',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.userSessionTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(this.userSessionTable).add('Project', PROJECT_TAG);

    // UserActivity: PK userId, SK activityTime (number), TTL on "ttl"
    this.userActivityTable = new dynamodb.Table(this, 'UserActivityTable', {
      tableName: 'UserActivity',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'activityTime', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });
    cdk.Tags.of(this.userActivityTable).add('Project', PROJECT_TAG);

    // DecisionStore: PK decisionId, GSI userId-timestamp-index (userId HASH + timestamp RANGE)
    this.decisionStoreTable = new dynamodb.Table(this, 'DecisionStoreTable', {
      tableName: 'DecisionStore',
      partitionKey: { name: 'decisionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.decisionStoreTable.addGlobalSecondaryIndex({
      indexName: 'userId-timestamp-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    cdk.Tags.of(this.decisionStoreTable).add('Project', PROJECT_TAG);

    // UserState: PK userId, no GSIs
    this.userStateTable = new dynamodb.Table(this, 'UserStateTable', {
      tableName: 'UserState',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(this.userStateTable).add('Project', PROJECT_TAG);

    // CfnOutputs: export each table name for cross-stack and backend reference
    new cdk.CfnOutput(this, 'UserProfileTableName', {
      value: this.userProfileTable.tableName,
      exportName: `${this.stackName}:UserProfileTableName`,
    });
    new cdk.CfnOutput(this, 'UserSessionTableName', {
      value: this.userSessionTable.tableName,
      exportName: `${this.stackName}:UserSessionTableName`,
    });
    new cdk.CfnOutput(this, 'UserActivityTableName', {
      value: this.userActivityTable.tableName,
      exportName: `${this.stackName}:UserActivityTableName`,
    });
    new cdk.CfnOutput(this, 'DecisionStoreTableName', {
      value: this.decisionStoreTable.tableName,
      exportName: `${this.stackName}:DecisionStoreTableName`,
    });
    new cdk.CfnOutput(this, 'UserStateTableName', {
      value: this.userStateTable.tableName,
      exportName: `${this.stackName}:UserStateTableName`,
    });
  }
}
