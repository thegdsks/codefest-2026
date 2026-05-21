import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import { TABLE_NAMES } from './config';

export class DynamoDbStack extends cdk.Stack {
  public readonly userProfileTable: dynamodb.Table;
  public readonly userSessionTable: dynamodb.Table;
  public readonly userActivityTable: dynamodb.Table;
  public readonly decisionStoreTable: dynamodb.Table;
  public readonly userStateTable: dynamodb.Table;
  public readonly engagementRulesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // UserProfile: PK userId, GSI username-index on username
    this.userProfileTable = new dynamodb.Table(this, 'UserProfileTable', {
      tableName: TABLE_NAMES.userProfile,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.userProfileTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // UserSession: PK sessionId, GSI userId-index on userId
    this.userSessionTable = new dynamodb.Table(this, 'UserSessionTable', {
      tableName: TABLE_NAMES.userSession,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.userSessionTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // UserActivity: PK userId, SK activityTime (number), TTL on "ttl"
    this.userActivityTable = new dynamodb.Table(this, 'UserActivityTable', {
      tableName: TABLE_NAMES.userActivity,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'activityTime', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // DecisionStore: PK decisionId, GSI userId-timestamp-index (userId HASH + timestamp RANGE)
    this.decisionStoreTable = new dynamodb.Table(this, 'DecisionStoreTable', {
      tableName: TABLE_NAMES.decisionStore,
      partitionKey: { name: 'decisionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    this.decisionStoreTable.addGlobalSecondaryIndex({
      indexName: 'userId-timestamp-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // UserState: PK userId, no GSIs
    this.userStateTable = new dynamodb.Table(this, 'UserStateTable', {
      tableName: TABLE_NAMES.userState,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // EngagementRules: PK ruleId (S), SK version (S)
    // Stores rule documents for the engagement intelligence engine.
    // version='latest' is the live/current row; version=ISO-timestamp is history.
    this.engagementRulesTable = new dynamodb.Table(this, 'EngagementRulesTable', {
      tableName: TABLE_NAMES.engagementRules,
      partitionKey: { name: 'ruleId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

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

    new cdk.CfnOutput(this, 'EngagementRulesTableName', {
      value: this.engagementRulesTable.tableName,
      exportName: `${this.stackName}:EngagementRulesTableName`,
    });
  }
}
