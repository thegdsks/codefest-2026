# Lambda Timeout Review

**Date:** 2026-05-20
**Reviewer:** X8 (infra lane)
**Scope:** LLM call path latency budget vs current Lambda timeout

---

## 1. Current Configuration

Source: `infra/cdk/lib/config.ts`, `LAMBDA_DEFAULTS`

| Setting | Value |
|---|---|
| `timeoutSeconds` | **10 s** |
| `memorySize` | 512 MB |
| Architecture | arm64 |
| Runtime | Node.js 18 |

Note: the task brief mentioned 30 s as the current value. The actual value in
`config.ts` is **10 s**. This review uses 10 s as the baseline.

---

## 2. Worst-Case Latency Contributors

### 2a. LLM call timeout

Defined in `apps/backend/src/engine/llm.js`:

```
abortSignal: AbortSignal.timeout(1500)
```

Both `classify()` and `writeText()` cap at **1500 ms**. No retries. On timeout
the router falls back to the L1 decision, so the LLM timeout is a hard ceiling,
not a soft one.

### 2b. DynamoDB operations (login path, gray zone)

A login that scores in the gray zone triggers the following DDB calls:

| Operation | Table | Warm estimate | Cold estimate |
|---|---|---|---|
| GetItem (user lookup) | UserProfile | 5 ms | 80 ms |
| PutItem (session create) | UserSession | 8 ms | 120 ms |
| PutItem (activity record) | UserActivity | 8 ms | 120 ms |
| PutItem (decision record) | DecisionStore | 8 ms | 120 ms |
| UpdateItem (state) | UserState | 8 ms | 120 ms |

Warm total (5 ops): ~37 ms. Cold total (5 ops): ~560 ms.

DDB cold-start here means a Lambda cold-start, not a DDB cold-start. DDB is
serverless and consistently fast once the VPC/SDK connection is warm. On a true
Lambda cold-start (Node.js init + module load) the first DDB call is slower
because the SDK is still negotiating the connection.

### 2c. Cold-start overhead (Node.js 18, arm64, 512 MB)

Typical cold-start for this bundle size (no native binaries, bundled with esbuild):
**200-400 ms** init time on top of the first invocation duration.

### 2d. JSON parse / stringify

Request body parse, response serialise, EMF log line: negligible, **<5 ms** combined.

### 2e. Bedrock path (not currently in production)

`BEDROCK_MODEL_ID` is set in the CDK env, but `llm.js` uses `LITELLM_BASE_URL`
and `LITELLM_API_KEY`. If those are absent, `readConfig()` returns null and no
LLM call is made. The Bedrock IAM grant exists but is not exercised by the
current code path. This is a non-contributor today.

---

## 3. Worst-Case Sum (Login + L2 + 5 DDB Writes)

### Warm Lambda (steady state)

| Component | ms |
|---|---|
| DDB reads + writes (5 ops, warm) | 37 |
| LLM classify call (p95 observed: ~100 ms, hard cap 1500 ms) | 1500 |
| JSON / misc | 5 |
| **Total** | **1542 ms** |

### Cold-start Lambda

| Component | ms |
|---|---|
| Node.js init overhead | 400 |
| DDB (5 ops, first-call cold) | 560 |
| LLM classify (hard cap) | 1500 |
| JSON / misc | 5 |
| **Total** | **2465 ms** |

The absolute worst case is a cold-start where the LLM call hits the 1500 ms
abort: **~2465 ms end-to-end** inside the Lambda handler. API Gateway HTTP API
adds roughly 5-15 ms integration overhead on top.

---

## 4. CloudWatch Actuals (last 24 h)

Function: `signal-force-runtime-ApiLambda91D2282D-tv45G7vAnQvP`
Window: 2026-05-19T02:53Z to 2026-05-20T02:53Z

| Percentile | Duration |
|---|---|
| p95 | **99.7 ms** |
| p99 | **341.6 ms** |

Reading: p99 at 341 ms means the LLM path has not yet been exercised at scale
(or LiteLLM credentials are not set, keeping the handler in rules-only mode).
Once LiteLLM is active, p99 will rise toward the 1500 ms LLM cap on gray-zone
requests.

---

## 5. Recommendation

**Set `timeoutSeconds` to 6 s (from the current 10 s).** Do not drop to 3 s yet.

Math: worst-case cold-start + LLM cap = 2465 ms. Adding a 2x safety multiplier
gives ~4.9 s. Rounding up to 6 s provides ~2.4x headroom over the computed
worst case, and ~17x headroom over the observed p99 (341 ms). 6 s is tight
enough to fail-fast on hung Bedrock or LiteLLM calls but loose enough to absorb
a real cold-start on demo day.

The originally suggested value of 3 s would be safe for the warm steady-state
path (p99 341 ms today) but risks false timeouts on cold-start + max LLM
latency (2465 ms). 6 s is the right middle ground.

**Post-demo hardening (not in scope now):** split into two Lambda tiers via
`serverless.yml` function-per-route: a "fast" function (3 s, no LLM) for
health/profile reads, and the current "slow" function (6 s) for login, transfer,
and offer routes. This is straightforward with Serverless Framework but requires
two API Gateway integrations and is not worth the complexity during a 48-hour
event.

### Action required

Change `LAMBDA_DEFAULTS.timeoutSeconds` from `10` to `6` in
`infra/cdk/lib/config.ts` and redeploy the runtime stack:

```
cd infra/cdk
npx cdk deploy signal-force-runtime
```

This change is **not made in this review** per task constraints. It is
recommended for the next deploy before the demo on day 2.
