import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

const PROJECT_TAG = 'codefest-2026';

export class BudgetsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Email address for budget alerts.
    // Set via CDK context: --context budgetAlertEmail=you@example.com
    // or environment variable BUDGET_ALERT_EMAIL.
    // Update before deploying — default is a placeholder.
    const alertEmail =
      (this.node.tryGetContext('budgetAlertEmail') as string | undefined) ??
      process.env['BUDGET_ALERT_EMAIL'] ??
      'change-me@example.com';

    const alertTopic = new sns.Topic(this, 'BudgetAlertTopic', {
      displayName: 'codefest-2026 budget alerts',
    });
    alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    cdk.Tags.of(alertTopic).add('Project', PROJECT_TAG);

    const topicArn = alertTopic.topicArn;

    const snsNotification = (
      threshold: number
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [{ subscriptionType: 'SNS', address: topicArn }],
    });

    const snsForecastedNotification = (
      threshold: number
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        notificationType: 'FORECASTED',
        comparisonOperator: 'GREATER_THAN',
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [{ subscriptionType: 'SNS', address: topicArn }],
    });

    // $25 monthly budget — alert at 80% and 100% actual spend
    new budgets.CfnBudget(this, 'Budget25', {
      budget: {
        budgetName: 'codefest-2026-25usd',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 25, unit: 'USD' },
      },
      notificationsWithSubscribers: [snsNotification(80), snsNotification(100)],
    });

    // $100 monthly budget — alert at 80% and 100% actual spend
    new budgets.CfnBudget(this, 'Budget100', {
      budget: {
        budgetName: 'codefest-2026-100usd',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 100, unit: 'USD' },
      },
      notificationsWithSubscribers: [snsNotification(80), snsNotification(100)],
    });

    // $200 monthly budget — alert at 100% forecasted spend
    new budgets.CfnBudget(this, 'Budget200', {
      budget: {
        budgetName: 'codefest-2026-200usd',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 200, unit: 'USD' },
      },
      notificationsWithSubscribers: [snsForecastedNotification(100)],
    });

    new cdk.CfnOutput(this, 'BudgetAlertTopicArn', {
      value: topicArn,
      exportName: `${this.stackName}:BudgetAlertTopicArn`,
    });
  }
}
