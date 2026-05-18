# Codefest 2026

Fraud-aware loyalty platform — login risk scoring, points transfer monitoring, personalized offers, and adaptive nudges.

## Structure

```
apps/
  backend/      Node.js Lambda (Serverless Framework)
seed_data/      DynamoDB BatchWriteItem JSON
```

`apps/frontend/`, `infra/`, `scripts/`, and `docs/` get added as work starts on them.

## Run backend locally

```bash
cd apps/backend
npm i
npm run offline
```

API will be on `http://localhost:3000` by default. See `apps/backend/postman_collection.json` for example calls.

## Deploy backend

```bash
cd apps/backend
export CLIENT_ID=demoClient
export CLIENT_SECRET=demoSecret
npx serverless deploy --stage dev
```

DynamoDB tables must exist first (infra templates coming).

## Conventions

- Branches: `main` + short-lived `feat/...` / `fix/...`
- Secrets in `.env` (gitignored) or GitHub Actions secrets — never in code
- Personal AI tools / personal GitHub accounts only
