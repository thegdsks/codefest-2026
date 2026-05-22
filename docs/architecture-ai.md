# Signal Force Architecture - AI Modules

Last updated: 2026-05-21

Two L2 AI modules live in `apps/backend/src/engine/`. Both are called only when the
deterministic L1 path cannot resolve the request - either because the score lands in the
gray zone (40-70) or because a caller explicitly requests AI-augmented output.

## Contents

- [AI fraud explainer](#ai-fraud-explainer-ai-fraud-explainerjs)
- [AI surface prioritizer](#ai-surface-prioritizer-ai-surface-prioritizerjs)
- [LiteLLM topology](#litellm-topology)
- [Budget guard](#budget-guard-enginebudgetjs)
- [References](#references)

---

## AI fraud explainer (`ai-fraud-explainer.js`)

Triggered after every `FRAUD_LOGIN` or `FRAUD_TRANSFER` decision where `action` is `BLOCK`,
`REVIEW`, or `MFA`. Sends a structured prompt to the LiteLLM proxy and returns a
`{ paragraph, riskFactors[], recommendation }` object stored on the decision row as
`aiExplanation`. The DecisionDrawer "AI Analysis" panel in the admin console renders this inline.

Constraints:

- Hard `AbortSignal` timeout, defaulting to `LITELLM_TIMEOUT_MS` (default 8000 ms). Returns null on timeout; the decision proceeds without a rationale.
- Budget guard (`engine/budget.js`) blocks the call when the daily LLM call cap is hit.
- Falls back silently (no error to the caller) when `LITELLM_BASE_URL` or `LITELLM_API_KEY` is absent.

`aiExplanation` shape on the decision row:

```json
{
  "paragraph": "The transfer of 7,500 points to an unfamiliar recipient was flagged because the device used has not appeared in this account's history in over 30 days. The combination of high transfer amount and unseen device raises the risk score to 65.",
  "riskFactors": [
    "Transfer amount 7,500 points exceeds typical 24h pattern",
    "Device fingerprint not seen in last 30 days"
  ],
  "recommendation": "Require the member to complete MFA and verify the recipient before releasing the transfer."
}
```

---

## AI surface prioritizer (`ai-surface-prioritizer.js`)

Activated on `GET /customer/surface-eligibility?aiMode=on`. After the deterministic
`evaluateSurfaces()` call produces the candidate surface list, the prioritizer sends those
surfaces plus user context (tier, loyalty score, profile completion, recent SDK signals) to L2
and receives per-surface verdicts.

Each verdict carries:

| Field | Values | Description |
|---|---|---|
| `aiAction` | `PROMOTE` / `KEEP` / `DEMOTE` / `HIDE` / `SWAP` | LLM verdict |
| `aiPriority` | 1 (show first) through 5 (least relevant) | Rank within active surfaces |
| `aiRationale` | string | 1-2 sentences for a product manager |

The deterministic `state` from the surface evaluator is the source of truth and is never
overridden by AI. AI fields are additive. The response includes `aiUnavailable: true` when the
LLM is unreachable.

Cache: in-memory Map keyed by `(userId + surface-state-hash)`, 30 s TTL per Lambda container.
No DDB write.

Timeout: 6 s (raised from 3 s in PR #124). Set via `LITELLM_TIMEOUT_MS` env var.

Example response (AI Mode enabled):

```json
{
  "data": {
    "userId": "USER#001",
    "aiMode": true,
    "surfaces": [
      {
        "surfaceId": "PROPERTY_PRESTIGE_ADVANCE",
        "state": "SHOWN",
        "ruleId": "RULE#TIER_GAP_NUDGE",
        "reason": "Within 2000 pts of Platinum",
        "context": { "pointsToNextTier": 2000, "currentTier": "Gold", "nextTier": "Platinum" },
        "copy": {
          "headline": "Prestige Advance Benefit",
          "body": "You are only 2,000 points away from Platinum. Book 4 nights to get double points."
        },
        "nextAction": { "label": "Book 4 nights to reach Platinum", "target": "tier", "delta": { "tier": "Platinum" } },
        "aiAction": "PROMOTE",
        "aiPriority": 1,
        "aiRationale": "User is close to tier upgrade and recently visited property pages; this card has high conversion likelihood."
      }
    ]
  }
}
```

---

## LiteLLM topology

```
Lambda engine modules
  |
  | LITELLM_BASE_URL (OpenAI-compatible REST)
  v
LiteLLM Cloudflare Worker proxy
  |
  | Bedrock Converse API
  v
us.anthropic.claude-haiku-4-5-20251001-v1:0
  (US cross-region inference profile)
```

The Lambda does not need direct Bedrock model activation because the proxy handles it. Three env
vars are read at runtime: `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`. These are
injected into the Lambda at CDK synth time via `process.env` in
`infra/cdk/lib/runtime-stack.ts` (PR #100). Updating them requires a CDK deploy.

Model catalog: `apps/backend/src/lib/aiModels.js`, surfaced in the admin UI at `/admin/settings`.
Budget tier (Nova Micro / Lite, Llama 3.x) for high-volume scoring under the demo cap. Standard
tier (Haiku, Sonnet) for quality. Fallback model list configurable via `LITELLM_FALLBACK_MODELS`.

Direct Bedrock path: the CDK Bedrock IAM policy is retained in `infra/cdk/lib/runtime-stack.ts`
for the production path. If the Lambda is ever switched to call Bedrock directly, Bedrock model
access for Claude Haiku 4.5 in us-east-1 must be enabled in the AWS console first.

---

## Budget guard (`engine/budget.js`)

Tracks LLM calls in an in-memory counter per Lambda container. Reads `LLM_DAILY_BUDGET_USD`
from the env (or `LLM_GUARD_MAX_CALLS` for a call-count ceiling). When the ceiling is hit,
`budget.tryReserve()` returns `{ ok: false }` and both AI modules skip the LLM call silently.
The daily spend is visible in the admin overview tile at `/admin` under "Engine Guard".

Because the counter is per-container, the actual call count across the fleet can exceed the
ceiling before each container individually hits its limit. For the demo this is fine. A
centralised DDB-backed budget tracker would be more accurate but is overkill for the demo
traffic volume.

---

## References

- Bedrock Converse API: https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html
- Bedrock Provisioned Throughput: https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- json-rules-engine: https://github.com/CacheControl/json-rules-engine
- CDK API reference: https://docs.aws.amazon.com/cdk/api/v2/
- DAX: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html

---

Related: [architecture-overview.md](./architecture-overview.md) | [architecture-engine.md](./architecture-engine.md) | [rule-editor.md](./rule-editor.md)
