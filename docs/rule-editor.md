# Engagement Rule Editor

## Overview

The rule editor at `/admin/rules/new` lets ops staff add and update engagement rules without a redeploy. An EngagementRule is a json-rules-engine document with a `conditions` block and an `event.params` block carrying `action`, `surface`, and `score`. Rules live in the DynamoDB `EngagementRules` table (PK `ruleId`, SK `version`, where `version='latest'` is the live row and ISO timestamps are immutable history entries). Only rules with `status: ACTIVE` are evaluated at L1 inside `routes/engagement.js` during `POST /engagement/event`; their highest-scoring match wins when it beats the static L1 scorer.

## Modes

The editor has two modes, both writing the same `definition` JSON:

- **Visual mode**: a form-driven builder. Pick a fact, an operator, and a value; stack predicates inside `all` or `any` groups. Use this when you know the exact field names and just need to wire the rule up.
- **AI Assist mode**: a natural-language prompt that calls `POST /admin/rules/ai-suggest`. Returns a draft `definition` you then review in Visual mode before saving. Use this when you have a description of the desired behavior but do not want to compose the JSON by hand.

Switching between modes preserves the in-memory rule state, so you can sketch a draft in AI Assist and finish it in Visual without losing work.

## Fields you can use in conditions

The L1 facts object is built in `routes/engagement.js` as `{ signal, userId, ...params }`. The keys below are the ones the seeded rules and the autocapture hook actually use.

| Fact             | Type   | Example                    | Operators                                                       |
| ---------------- | ------ | -------------------------- | --------------------------------------------------------------- |
| `signal`         | string | `dwell_no_action`          | `equal`, `notEqual`, `in`, `notIn`                              |
| `userId`         | string | `USER#001`                 | `equal`, `notEqual`                                             |
| `dwellMs`        | number | `8000`                     | `greaterThan`, `greaterThanInclusive`, `lessThan`, `equal`      |
| `target`         | string | `points_balance`           | `equal`, `notEqual`, `in`                                       |
| `clickCount`     | number | `5`                        | `greaterThan`, `greaterThanInclusive`, `lessThan`, `equal`      |
| `targetSelector` | string | `button.transfer-confirm`  | `equal`, `notEqual`, `contains`                                 |
| `flow`           | string | `transfer`                 | `equal`, `notEqual`, `in`                                       |
| `step`           | number | `2`                        | `greaterThan`, `greaterThanInclusive`, `lessThan`, `equal`      |
| `query`          | string | `redeem free night`        | `equal`, `notEqual`, `contains`                                 |
| `count`          | number | `4`                        | `greaterThan`, `greaterThanInclusive`, `lessThan`, `equal`      |

The five valid `signal` values are `rage_click`, `dwell_no_action`, `abandoned_flow_step`, `repeated_query`, and `points_balance_stare`. Anything in `params` on the incoming event becomes a top-level fact, so additional keys (e.g. `pointsBalance`) work without code changes.

## Action and surface vocabulary

Legal values for `event.params.action`:

`ALLOW`, `NUDGE`, `OFFER`, `HINT`, `BLOCK`, `REVIEW`, `MFA`

Legal values for `event.params.surface`:

`nudge_banner`, `offer_modal`, `help_tooltip`, `inline_help_tooltip`, `none`

Every action except `ALLOW` writes a `DecisionStore` row with `decisionType=ENGAGEMENT` so the admin metrics view can count it. `ALLOW` short-circuits and writes nothing, by design.

## AI Assist setup

AI Assist talks to a LiteLLM proxy. The Lambda needs three env vars:

```
LITELLM_BASE_URL=https://your-proxy.example.com
LITELLM_API_KEY=sk-...
LITELLM_MODEL=claude-haiku-4-5   # optional, defaults to claude-haiku-4-5
```

Add these to `.env.example` and set them on the deployed Lambda (Serverless `provider.environment` or `serverless deploy --param`). When `LITELLM_BASE_URL` or `LITELLM_API_KEY` is missing the endpoint returns 503 and the UI shows "AI assist is offline"; users fall back to Visual mode.

## API contract

All `/admin/*` routes use Basic Auth (`demoClient:demoSecret`) and require the Basic Auth subject to be in `ADMIN_USERNAMES` (default `demoClient`). Examples below omit the Authorization header for brevity.

`POST /admin/rules/ai-suggest`

```json
{ "prompt": "Show a help tooltip when a user rage-clicks the points balance" }
```

Response: `{ "data": { "definition": { "conditions": {...}, "event": {...} } } }`. 503 when LiteLLM env is missing.

`POST /admin/rules/test`

```json
{ "definition": { "conditions": {...}, "event": {...} },
  "facts": { "signal": "rage_click", "clickCount": 6 } }
```

Response: `{ "data": { "matched": true, "score": 80, "action": "HINT", "surface": "help_tooltip" } }`.

`POST /admin/rules`

```json
{ "name": "Rage click help",
  "status": "ACTIVE",
  "definition": { "conditions": { "all": [{ "fact": "clickCount", "operator": "greaterThanInclusive", "value": 5 }] },
                  "event": { "type": "RAGE", "params": { "action": "HINT", "surface": "help_tooltip", "score": 80 } } } }
```

Response: `201` with `{ "data": { "rule": { "ruleId": "RULE#a1b2c3d4", "version": "latest", ... } } }`.

`GET /admin/rules?status=ACTIVE`

Response: `{ "data": { "rules": [...], "count": 3 } }`.

`GET /admin/rules/RULE%23a1b2c3d4`

Response: `{ "data": { "rule": {...} } }` or 404.

`PUT /admin/rules/RULE%23a1b2c3d4`

Same body shape as `POST /admin/rules`. Response: `200` with the updated rule.

## Troubleshooting

- AI Assist always returns 503. Check that `LITELLM_BASE_URL` and `LITELLM_API_KEY` are set on the Lambda (Console, Configuration, Environment variables). For deeper inspection open CloudWatch log group `/aws/lambda/signal-force-runtime-ApiLambda` and filter for the `SignalForce/RuleAiSuggest` EMF metric namespace.
- Rule saved but never fires. Confirm `status` is `ACTIVE` (DRAFT and ARCHIVED rules are never evaluated). Then wait up to 60 seconds: `lib/ruleStore.js` caches the active list with a 60 s TTL. `putRule` calls `bustCache()`, but other Lambda containers will hold stale state until their cache expires.
- Match count always 0. There may simply be no recent ENGAGEMENT decisions in the table. Generate some by running `INCLUDE_ENGAGEMENT=1 LOAD_COUNT=50 node scripts/synthetic-load.mjs` from the repo root.
