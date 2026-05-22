# Signal Force Architecture

Last updated: 2026-05-21

One engine that turns customer signals into adaptive decisions across security, personalization,
and engagement. Rules resolve first, cheaply. AI handles the cases rules cannot decide.
Every decision is auditable. The admin studio lets ops tune rules without a deploy.

This document is an index. Detailed sections live in sub-files to keep each one under 600 lines.

---

## Sub-documents

| File | Covers |
|---|---|
| [architecture-overview.md](./architecture-overview.md) | Full system diagram, three-app model, demo stack vs production stack, DynamoDB tables, MFA, CDK stacks, service selection decisions |
| [architecture-engine.md](./architecture-engine.md) | Rules-first engine flow, storage tiering, studio loop, stateful surfaces, demo events, decision flow diagrams |
| [architecture-ai.md](./architecture-ai.md) | AI fraud explainer, AI surface prioritizer, LiteLLM topology, budget guard |

---

## Quick facts

| Item | Value |
|---|---|
| Lambda runtime | Node.js 18, arm64, 512 MB, 10 s timeout |
| DynamoDB tables | 6 (UserProfile, UserSession, UserActivity, DecisionStore, UserState, EngagementRules) |
| Tier ladder | Silver / Gold / Platinum / Diamond (thresholds: 25k / 50k / 100k pts) |
| Engagement rules | 8 ACTIVE in seed data |
| LLM | Claude Haiku 4.5 via LiteLLM proxy (OpenAI-compatible, Bedrock-backed) |
| LLM timeout | 8000 ms (configurable via `LITELLM_TIMEOUT_MS`) |
| L1 gray zone | Score 40-70 escalates to L2 LLM |
| MFA mode | `MFA_MODE=static` for demo (OTP `123456`), `MFA_MODE=totp` for production |
| Demo URL | https://signal.glinr.com |
| Region | us-east-1 |

---

Related: [deployment.md](./deployment.md) | [api-quickstart.md](./api-quickstart.md) | [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md)
