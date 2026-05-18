# SF Node.js Backend (Serverless Framework)

This codebase implements the REST APIs defined in the full contract document using **Node.js AWS Lambda** deployed via **Serverless Framework (SF)**.

## Deploy

```bash
npm i
export CLIENT_ID=demoClient
export CLIENT_SECRET=demoSecret
serverless deploy
```

## Invoke with Basic Auth

Use the API URL shown in the `serverless deploy` output.

```bash
curl -u demoClient:demoSecret "$BASE_URL/dashboard?userId=USER#001"
```

## Notes
- Fraud logic: heuristic impossible-travel detection on login + transfer velocity on redemptions.
- Username lookup uses DynamoDB Scan (fine for SF demo). For production, add a GSI on username.
