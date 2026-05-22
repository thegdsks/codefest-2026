# Lambda Timeout Review

Last updated: 2026-05-20

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

---

## 2. Worst-Case Latency Contributors

### 2a. LLM call timeout

Defined in `apps/backend/src/engine/llm.js` via the `LITELLM_TIMEOUT_MS` env var:

```
default: 8000 ms (configurable via LITELLM_TIMEOUT_MS)
```

Both `classify()` and `writeText()` use `AbortSignal.timeout(timeoutMs)`. On timeout
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

"Cold" here means a Lambda cold-start, not a DDB cold-start. DynamoDB is consistently fast
once the SDK connection is warm. On a true Lambda cold-start the first DDB call is slower
because the SDK is still negotiating the connection.

### 2c. Cold-start overhead (Node.js 18, arm64, 512 MB)

Typical cold-start for this bundle size (no native binaries, bundled with esbuild):
**200-400 ms** init time on top of the first invocation duration.

### 2d. JSON parse / stringify

Request body parse, response serialise, EMF log line: negligible, **<5 ms** combined.

---

## 3. Worst-Case Sum (Login + L2 + 5 DDB Writes)

### Warm Lambda (steady state)

| Component | ms |
|---|---|
| DDB reads + writes (5 ops, warm) | 37 |
| LLM classify call (p95 observed: ~100 ms, hard cap 8000 ms) | 8000 |
| JSON / misc | 5 |
| **Total** | **8042 ms** |

### Cold-start Lambda

| Component | ms |
|---|---|
| Node.js init overhead | 400 |
| DDB (5 ops, first-call cold) | 560 |
| LLM classify (hard cap) | 8000 |
| JSON / misc | 5 |
| **Total** | **8965 ms** |

The absolute worst case is a cold-start where the LLM call hits the 8000 ms abort: **~8965 ms
end-to-end** inside the Lambda handler. API Gateway HTTP API adds roughly 5-15 ms integration
overhead on top.

---

## 4. CloudWatch Actuals (observed)

| Percentile | Duration |
|---|---|
| p95 | ~100 ms |
| p99 | ~342 ms |

The low p99 indicates the LLM gray-zone path has not been exercised heavily, or LiteLLM
credentials were not set at the time of measurement, keeping the handler in rules-only mode.
Once LiteLLM is active, p99 will rise on gray-zone requests.

---

## 5. Recommendation

**Current timeout (10 s) is adequate.** The worst case (cold-start + LLM hard cap) is ~8965 ms,
leaving about 1 second of margin. The value could be reduced to 9 s for a tighter fail-fast
without risk, but the change is low priority given the observed p99 of ~342 ms.

The AI surface prioritizer timeout was already tightened to 6 s in PR #124, which is the
tighter sub-call that is more latency-sensitive.

**Post-demo hardening:** split into two Lambda tiers via `serverless.yml` function-per-route:
a "fast" function (3-4 s, no LLM) for health/profile reads, and the current "slow" function for
login, transfer, and offer routes. This is straightforward with Serverless Framework but requires
two API Gateway integrations and is not worth the complexity during a 48-hour event.

---

Related: [architecture-ai.md](./architecture-ai.md) | [deployment.md](./deployment.md)
