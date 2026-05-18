# Signal Force

[![Node](https://img.shields.io/badge/Node-18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![AWS CDK](https://img.shields.io/badge/AWS_CDK-v2-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Biome](https://img.shields.io/badge/Biome-2-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev)
[![lefthook](https://img.shields.io/badge/lefthook-2-FF6F00)](https://lefthook.dev)

Fraud-aware loyalty platform. Login risk scoring, points transfer monitoring, personalized offers, and adaptive nudges. Serverless on AWS.

> **Architecture:** see [`docs/architecture.md`](./docs/architecture.md) for the service map, request flows, decision log, and cost estimate. Read this before opening a PR that adds a new AWS service.

## Quick start

```bash
git clone https://github.com/thegdsks/signal-force.git
cd signal-force
npm install
```

`npm install` at the root installs every workspace and wires the git hooks. That is the only setup step.

## Run locally

```bash
# Backend on http://localhost:3000
cd apps/backend && npm run offline

# Frontend on http://localhost:5173 (separate shell)
cd apps/frontend && npm run dev
```

Copy `apps/frontend/.env.example` to `apps/frontend/.env` and fill in the three vars before `npm run dev`.

## Repo layout

```
apps/backend         Node.js 18 Lambda, single handler.js routing all paths
apps/frontend        Vite + React + TS SPA
infra/cdk            CDK TypeScript stacks (dynamodb, budgets, runtime)
seed_data            DynamoDB BatchWriteItem fixtures, 30 records per table
docs                 Architecture and design notes
scripts/hooks        commit-msg and pre-push scripts called by lefthook
```

## Daily flow

Branch, commit small, open a PR. Hooks do the heavy lifting.

| Step | Command |
|---|---|
| New work | `git checkout -b feat/<short-name>` |
| Commit | `git commit -m "Imperative subject under 72 chars"` |
| Push and open PR | `git push -u origin <branch>` then `gh pr create` |
| Merge | `gh pr merge --merge --delete-branch` |

Direct push to `main` is blocked by both a local hook and GitHub branch protection. Always PR.

Hooks are **educational by default** (warn and let you through). Set `LEFTHOOK_STRICT=1` if you want them to block on warnings. Full conventions in [`AGENTS.md`](./AGENTS.md).

## Deploy to AWS

One time per account and region:

```bash
cd infra/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Standard deploy:

```bash
# Infra
cd infra/cdk
export BUDGET_ALERT_EMAIL=<your-email>
npx cdk deploy --all

# Seed data, once after the tables exist
cd ../../seed_data
# follow seed_data/README.md
```

The CDK stacks: `signal-force-dynamodb`, `signal-force-budgets`, `signal-force-runtime`. The runtime stack outputs the API URL and CloudWatch dashboard URL.

## See also

- [`docs/architecture.md`](./docs/architecture.md): service map, request flows, decisions, cost.
- [`AGENTS.md`](./AGENTS.md): code conventions, commit signing setup, hook details, rules for AI tools.
- [`infra/cdk/README.md`](./infra/cdk/README.md): per-stack deploy notes.
