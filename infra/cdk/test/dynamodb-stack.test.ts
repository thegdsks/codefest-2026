import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DynamoDbStack } from '../lib/dynamodb-stack';

describe('DynamoDbStack', () => {
  const app = new cdk.App();
  const stack = new DynamoDbStack(app, 'test-dynamodb', {
    env: { account: '000000000000', region: 'us-east-1' },
  });
  const template = Template.fromStack(stack);

  test('creates 5 tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 5);
  });

  test.each([
    ['UserProfile', 'userId'],
    ['UserSession', 'sessionId'],
    ['UserActivity', 'userId'],
    ['DecisionStore', 'decisionId'],
    ['UserState', 'userId'],
  ])('table %s has PK %s and PITR enabled', (tableName, pkName) => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: tableName,
      KeySchema: Match.arrayWith([{ AttributeName: pkName, KeyType: 'HASH' }]),
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('UserActivity has activityTime sort key and TTL on ttl', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'UserActivity',
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'activityTime', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  test('UserProfile has username-index GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'UserProfile',
      GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: 'username-index' })]),
    });
  });

  test('DecisionStore has userId-timestamp-index GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'DecisionStore',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'userId-timestamp-index',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
            { AttributeName: 'timestamp', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });
  });

  test('exports table names for each table', () => {
    for (const name of [
      'UserProfileTableName',
      'UserSessionTableName',
      'UserActivityTableName',
      'DecisionStoreTableName',
      'UserStateTableName',
    ]) {
      template.hasOutput(name, {});
    }
  });
});
