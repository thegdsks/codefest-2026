import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BudgetsStack } from '../lib/budgets-stack';

describe('BudgetsStack', () => {
  const app = new cdk.App();
  const stack = new BudgetsStack(app, 'test-budgets', {
    env: { account: '000000000000', region: 'us-east-1' },
  });
  const template = Template.fromStack(stack);

  test('creates 3 budgets at $25, $100, $200', () => {
    template.resourceCountIs('AWS::Budgets::Budget', 3);
    for (const [name, amount] of [
      ['signal-force-25usd', 25],
      ['signal-force-100usd', 100],
      ['signal-force-200usd', 200],
    ] as const) {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetName: name,
          BudgetType: 'COST',
          TimeUnit: 'MONTHLY',
          BudgetLimit: { Amount: amount, Unit: 'USD' },
        }),
      });
    }
  });

  test('creates SNS topic for alert subscriptions', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  test('$25 budget alerts on 80% and 100% actual spend', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetName: 'signal-force-25usd' }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            Threshold: 80,
          }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            Threshold: 100,
          }),
        }),
      ]),
    });
  });
});
