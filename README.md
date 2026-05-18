# Codefest 2026

Fraud-aware loyalty platform for Marriott Codefest 2026. Login risk scoring, points transfer monitoring, personalized offers, and adaptive nudges.

## Stack

- Backend: Node.js 18 Lambda, Serverless Framework, DynamoDB on-demand
- Frontend: Vite 5, React 18, TypeScript 5, Tailwind 3, React Router 6
- Infra: AWS CDK v2 in TypeScript
- Auth on the API: HTTP Basic Auth at the client level, app user creds in the login body

## Setup

```bash
git clone https://github.com/thegdsks/codefest-2026.git
cd codefest-2026
npm install
```

`npm install` at the root installs every workspace and wires up git hooks (Husky + lint-staged + Prettier + commit-msg checks).

Per workspace env files:

- `apps/backend` reads env vars at deploy time (`CLIENT_ID`, `CLIENT_SECRET`, table names, `MFA_OTP`)
- `apps/frontend` reads `apps/frontend/.env` (copy from `.env.example`)
- `infra/cdk` reads `BUDGET_ALERT_EMAIL` at deploy time

## Run locally

```bash
# Backend on http://localhost:3000 (serverless-offline)
cd apps/backend && npm run offline

# Frontend on http://localhost:5173 (separate shell)
cd apps/frontend && npm run dev
```

## Deploy to AWS

One time per account and region:

```bash
cd infra/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Every deploy:

```bash
# Infra (DynamoDB tables, budget alarms)
cd infra/cdk
export BUDGET_ALERT_EMAIL=<your-email>
npx cdk deploy --all

# Backend (Lambda + API Gateway)
cd ../../apps/backend
export CLIENT_ID=demoClient CLIENT_SECRET=demoSecret
npx serverless deploy --stage dev

# Seed data (run once after the tables exist)
cd ../../seed_data
# follow seed_data/README.md
```

## Repo layout

```
apps/backend         Node.js Lambda, single handler.js routing all paths
apps/frontend        Vite + React + TS SPA
infra/cdk            CDK TypeScript stacks (dynamodb + budgets)
seed_data            DynamoDB BatchWriteItem fixtures, 30 records per table
```

## Contributing

Five-person team, two-day event. Keep it light, keep it clean.

1. Branch from `main`: `git checkout -b feat/<short-name>` or `fix/<short-name>`
2. Commit small, one logical change per commit. Sign commits with SSH (see below).
3. Push and open a PR. One review is enough, merge on green, delete the branch.
4. Do not commit directly to `main`. The repo enforces this through hooks and through GitHub branch settings.

### Hook behavior

- `pre-commit` runs Prettier on staged files. Fast.
- `commit-msg` rejects commit messages with em dashes, AI mentions, oversized subject lines, or Co-Authored-By footers.
- `pre-push` runs typecheck and build for whichever workspace you touched. Skips workspaces you did not modify.

### Commit signing

SSH signing is recommended so PRs show "Verified" on GitHub.

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Upload the same public key at https://github.com/settings/ssh/new with type "Signing Key".

## License

MIT. See `LICENSE`.
