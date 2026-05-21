# DynamoDB seed data (30 items per table)

This bundle contains BatchWriteItem request JSON files.

Important DynamoDB limit: max 25 put/delete operations per `batch-write-item` call.
So each table has 2 batch files:
- *_batch_1.json (25 items)
- *_batch_2.json (5 items)

## Load data (AWS CLI)
Run each command:

aws dynamodb batch-write-item --request-items file://UserProfile_batch_1.json
aws dynamodb batch-write-item --request-items file://UserProfile_batch_2.json

aws dynamodb batch-write-item --request-items file://UserSession_batch_1.json
aws dynamodb batch-write-item --request-items file://UserSession_batch_2.json

aws dynamodb batch-write-item --request-items file://UserActivity_batch_1.json
aws dynamodb batch-write-item --request-items file://UserActivity_batch_2.json

aws dynamodb batch-write-item --request-items file://DecisionStore_batch_1.json
aws dynamodb batch-write-item --request-items file://DecisionStore_batch_2.json

aws dynamodb batch-write-item --request-items file://UserState_batch_1.json
aws dynamodb batch-write-item --request-items file://UserState_batch_2.json

## Notes
- All users use passwordHash = "Password1" (hackathon seed).
- UserActivity includes `ttl` (epoch seconds) set to 7 days after activityTime.
- DecisionStore records include `engineLayer`, `ruleId`, `ruleName`, `latencyMs`, `matched`, and `llmRationale` trace fields required by the PR-90 decision drawer.
