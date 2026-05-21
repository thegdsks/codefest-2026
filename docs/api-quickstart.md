# Signal Force API quickstart

> OpenAPI 3.1 spec: [docs/openapi.yaml](./openapi.yaml) - see [docs/openapi-readme.md](./openapi-readme.md) for TypeScript codegen instructions.

Copy-paste curl examples for the deployed demo API. Verified working against the live stack on 2026-05-20.

## Endpoint index

All endpoints require `Authorization: Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0` (`demoClient:demoSecret`). Admin routes additionally require the basic-auth subject to be in the `ADMIN_USERNAMES` env (default `demoClient`). Bearer-auth routes require `Authorization: Bearer <token>` instead (token from `POST /auth/login` or `POST /auth/mfa/verify`).

| Method | Path | Purpose | Auth | Anchor |
|--------|------|---------|------|--------|
| `POST` | `/auth/login` | Customer login, returns sessionId and risk decision | Basic | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/mfa/verify` | Verify OTP to complete login, returns bearer token | Basic | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/mfa/enroll` | Generate TOTP secret, QR code, and recovery codes | Bearer | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/mfa/confirm-enroll` | Confirm TOTP enrollment with a live code | Bearer | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/mfa/recover` | Consume a recovery code to reset MFA | Basic (body creds) | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/logout` | Revoke the current bearer token | Bearer | [Auth flow](#auth-flow-run-these-two-first) |
| `GET` | `/auth/session` | Return current session metadata | Bearer | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/transactions/transfer` | Points transfer with fraud scoring | Bearer | [Transactions](#transactions) |
| `POST` | `/transactions/mfa/verify` | Complete a transfer that was held for step-up MFA | Bearer | [Transactions](#transactions) |
| `GET` | `/user/profile` | Fetch full loyalty profile for a user | Bearer | [Customer surface](#customer-surface) |
| `GET` | `/user/profile-completeness?userId=` | Completeness percent, missing fields, and nudge text | Bearer | [Profile completeness](#profile-completeness) |
| `GET` | `/offers?userId=` | Personalized offers for a user | Bearer | [Customer surface](#customer-surface) |
| `POST` | `/offers/action` | Track an offer interaction (IMPRESSION, CLICK, BOOK) | Bearer | [Customer surface](#customer-surface) |
| `GET` | `/nudges?userId=` | Active nudges for a user | Bearer | [Customer surface](#customer-surface) |
| `POST` | `/nudges/action` | Track a nudge interaction (SHOWN, DISMISSED, COMPLETED) | Bearer | [Customer surface](#customer-surface) |
| `GET` | `/dashboard?userId=` | Customer dashboard: profile, fraud status, offers, nudges, activity | Bearer | [Customer surface](#customer-surface) |
| `GET` | `/customer/surface-eligibility?userId=` | State-aware surface evaluation for all surfaces | Bearer | [Customer surface](#customer-surface) |
| `POST` | `/engagement/event` | Track a behavioral signal, returns surface and copy | Bearer | [Customer surface](#customer-surface) |
| `GET` | `/admin/decisions?window=&type=&userId=&limit=` | Decision feed, sorted newest-first | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/decisions/{id}` | Single decision with audit trail and trace | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/decisions/export?window=&format=` | Export decisions as JSON or CSV | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/metrics?window=` | Aggregate counts and L1 vs L1+L2 split | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `POST` | `/admin/decisions/{id}/release` | Override a HOLD or BLOCK decision | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/users?limit=&cursor=` | Paginated user list (passwordHash stripped) | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/users/{id}/risk` | Decayed risk score and recent decision sparkline | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/sessions` | List active ACCESS sessions | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `POST` | `/admin/sessions/{sessionId}/revoke` | Revoke a specific session by ID | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/mfa-status` | MFA enrollment status across users | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/ai-config` | LLM catalog and active model config | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `POST` | `/admin/demo-actions/mutate-user` | Apply field mutations to a user for demo scripting | Basic + admin | [Demo controls](#demo-controls) |
| `POST` | `/admin/demo-events` | Record an operator action from DemoPanel | Basic + admin | [Demo controls](#demo-controls) |
| `GET` | `/admin/demo-events?since=&limit=` | List recent operator demo events | Basic + admin | [Demo controls](#demo-controls) |
| `GET` | `/admin/activity-feed?since=&limit=` | Merged feed of decisions, sessions, and demo events | Basic + admin | [Demo controls](#demo-controls) |
| `POST` | `/admin/dev/reseed` | Restore all tables from seed_data/ (DEMO_MODE=1 only) | Basic + admin | [Demo controls](#demo-controls) |
| `GET` | `/admin/dev/config` | Return demo feature flags | Basic + admin | [Demo controls](#demo-controls) |
| `GET` | `/admin/rules?status=` | List engagement rules | Basic + admin | [Rules editor](#rules-editor) |
| `POST` | `/admin/rules` | Create an engagement rule | Basic + admin | [Rules editor](#rules-editor) |
| `GET` | `/admin/rules/{id}` | Fetch a single rule by ID | Basic + admin | [Rules editor](#rules-editor) |
| `PUT` | `/admin/rules/{id}` | Update an existing rule | Basic + admin | [Rules editor](#rules-editor) |
| `POST` | `/admin/rules/ai-suggest` | Convert a description to a draft rule via LLM | Basic + admin | [Rules editor](#rules-editor) |
| `POST` | `/admin/rules/test` | Preview match count for a draft rule definition | Basic + admin | [Rules editor](#rules-editor) |

## Connection details

- Base URL: `https://signal.glinr.com`
- All paths: `https://signal.glinr.com/api/<path>` (Next.js API routes proxy to the Lambda backend)
- Gateway auth: HTTP Basic, `demoClient` / `demoSecret`. Goes in the `Authorization` header.
- App auth: separate. After `POST /auth/login` you get a `sessionId`. Verify with `POST /auth/mfa/verify` to receive a bearer token. Pass it as `Authorization: Bearer <token>` on bearer-auth routes.
- Content type for POSTs: `application/json`.

## Seeded users

30 users, ids `USER#001` through `USER#030`, usernames `user001` through `user030`. All share password `Password1`.

The user id contains a `#`. In query strings that becomes `%23`, so `USER#001` becomes `USER%23001`. Postman handles this for you when you put the value in the Params tab.

## Decision row schema

Every decision written to `DecisionStore` carries a set of standard attributes plus optional engine-layer fields.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `decisionId` | string | yes | Partition key, format `DECISION#<uuid>` |
| `userId` | string | yes | Subject of the decision |
| `decisionType` | string | yes | One of `FRAUD_LOGIN`, `FRAUD_TRANSFER`, `ENGAGEMENT`, `NUDGE`, `OFFER`, `MFA_VERIFY`, `DECISION_RELEASE`, `PROFILE_COMPLETENESS` |
| `action` | string | yes | Outcome: `ALLOW`, `HOLD`, `BLOCK`, `MFA`, `REVIEW`, `OFFER`, `NUDGE`, `RELEASE` |
| `score` | number | yes | Risk or engagement score 0-100 from the engine |
| `reason` | string | yes | Machine-readable reason code |
| `explanation` | string | no | Human-readable explanation |
| `engineLayer` | string | yes | `L1` or `L1+L2` (see below) |
| `llmLatencyMs` | number | no | Round-trip to the L2 LLM router in ms. Present only when `engineLayer` is `L1+L2`. |
| `llmModel` | string | no | Model identifier from LiteLLM proxy. Present only when `engineLayer` is `L1+L2`. |
| `aiExplanation` | object | no | LLM-generated fraud rationale on `BLOCK`/`REVIEW`/`MFA` decisions (see below). |
| `timestamp` | number | yes | Unix epoch seconds when the decision was written |
| `ttl` | number | no | DynamoDB TTL epoch, set on non-critical rows |

**aiExplanation shape.** Present on `FRAUD_LOGIN` and `FRAUD_TRANSFER` decisions where `action` is `BLOCK`, `REVIEW`, or `MFA` and the LiteLLM env vars are configured. The DecisionDrawer "AI Analysis" panel renders this.

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

**L1 vs L1+L2.** L1 is the rule-based heuristic layer. When the score lands in the gray zone (40-70 inclusive) the request escalates to L2 (LiteLLM proxy). Decisions that stay in L1 carry `engineLayer: "L1"` and no LLM fields. Decisions that hit L2 carry `engineLayer: "L1+L2"` plus `llmLatencyMs`, `llmModel`, and (on fraud outcomes) `aiExplanation`.

## Auth flow (run these two first)

### 1. Login

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/auth/login' \
  -d '{
    "username": "user001",
    "password": "Password1",
    "location": "New York",
    "deviceId": "device-abc"
  }'
```

200 response (L1-only, score outside gray zone):
```json
{
  "data": {
    "status": "SUCCESS",
    "userId": "USER#001",
    "sessionId": "SESSION#xxxxxxxx",
    "token": "tok_xxxxxxxx",
    "expiresAt": 1716300000
  }
}
```

200 response (MFA required, score triggered challenge):
```json
{
  "data": {
    "status": "MFA_REQUIRED",
    "reason": "GEO_VELOCITY",
    "sessionId": "SESSION#xxxxxxxx",
    "mfa": { "type": "OTP", "expiresInSeconds": 300 }
  }
}
```

Copy the `sessionId` for the MFA verify call, or use `token` directly on bearer routes if MFA was not required. Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### 2. MFA verify

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/auth/mfa/verify' \
  -d '{
    "sessionId": "SESSION#xxxxxxxx",
    "otp": "123456"
  }'
```

200 response:
```json
{
  "data": {
    "status": "SUCCESS",
    "message": "MFA verified",
    "mfaPath": "STATIC",
    "token": "tok_xxxxxxxx",
    "expiresAt": 1716300000
  }
}
```

Use `token` as the bearer on subsequent calls.

### 3. MFA enroll

Starts TOTP enrollment for the authenticated user. The secret is parked as `pendingMfaSecret` until confirmed; it does not activate MFA until `/auth/mfa/confirm-enroll` succeeds.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -X POST 'https://signal.glinr.com/api/auth/mfa/enroll'
```

200 response:
```json
{
  "data": {
    "otpauthUrl": "otpauth://totp/SignalForce:user001?secret=...",
    "qrCodePngBase64": "iVBORw...",
    "recoveryCodes": ["AAAA-BBBB", "CCCC-DDDD"],
    "issuer": "SignalForce",
    "username": "user001"
  }
}
```

### 4. MFA confirm-enroll

Validates a TOTP code generated from the pending secret and promotes it to the active secret.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/auth/mfa/confirm-enroll' \
  -d '{ "code": "123456" }'
```

200 response:
```json
{ "data": { "status": "ENROLLED" } }
```

### 5. MFA recover

Authenticated by username and password in the body (not bearer). Consumes one recovery code to clear the TOTP secret so the user can re-enroll a new authenticator.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/auth/mfa/recover' \
  -d '{
    "username": "user001",
    "password": "Password1",
    "code": "AAAA-BBBB"
  }'
```

200 response:
```json
{
  "data": {
    "status": "RECOVERED",
    "token": "tok_xxxxxxxx",
    "expiresAt": 1716300000,
    "recoveryCodesRemaining": 7,
    "message": "MFA disabled. Please re-enroll a new authenticator app."
  }
}
```

### 6. Logout

Revokes the current bearer token. Idempotent: returns 204 whether the row existed or not.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -X POST 'https://signal.glinr.com/api/auth/logout'
```

204 response (no body).

### 7. Session info

Returns metadata about the current bearer's session. Calling this slides the expiry forward, so polling it keeps the session alive.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/auth/session'
```

200 response:
```json
{
  "data": {
    "userId": "USER#001",
    "issuedAt": 1716298200,
    "expiresAt": 1716300000,
    "lastActivityAt": 1716299100,
    "mfaVerified": true
  }
}
```

## Customer surface

### Dashboard (aggregate view)

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/dashboard?userId=USER%23001'
```

Returns the user, fraud status, current offers and nudges, plus recent activity. Verified 200.

### Get user profile

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/user/profile?userId=USER%23001'
```

### Get offers

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/offers?userId=USER%23001'
```

204 (no content) means the user has no live offers right now. Trigger a fresh evaluate to seed one.

Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### Track offer action

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/offers/action' \
  -d '{
    "userId": "USER#001",
    "offerId": "OFFER#001",
    "action": "CLICK"
  }'
```

Valid actions: `CLICK`, `DISMISS`, `CONVERT`.

### Get nudges

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/nudges?userId=USER%23001'
```

Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### Track nudge action

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/nudges/action' \
  -d '{
    "userId": "USER#001",
    "nudgeId": "NUDGE#PROFILE",
    "action": "DISMISS"
  }'
```

### Surface eligibility

Returns a state-aware evaluation for every known surface (6 surfaces). Each item carries `state` (`SHOWN`, `HIDDEN`, `PENDING`, or `COMPLETED`), a `ruleId`, a `reason`, raw context inputs, `copy` (null when not SHOWN), and a `nextAction` the DemoPanel can use to flip state.

The six surface IDs are: `PROPERTY_PRESTIGE_ADVANCE`, `RESULTS_PRESTIGE_ADVANCE`, `PROFILE_CATALYST_ELEVATE`, `MFA_ENROLLMENT_NUDGE`, `TRANSFER_ABANDON_OFFER`, `BOOKING_CONFIRMATION_OFFER`.

Add `?aiMode=on` to activate the L2 AI surface prioritizer. Each surface gains `aiAction`, `aiPriority`, and `aiRationale` fields. Without the parameter the response is deterministic-only (same as `?aiMode=off`).

```bash
# Deterministic only (default)
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/customer/surface-eligibility?userId=USER%23001'

# AI Mode - L2 LLM re-ranks surfaces
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/customer/surface-eligibility?userId=USER%23001&aiMode=on'
```

200 response (AI Mode enabled):
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

When the LLM is unavailable (budget exhausted, timeout, or missing env vars) the response includes `"aiUnavailable": true` alongside the deterministic surfaces without AI fields.

### Track engagement event

Accepts a behavioral signal from the frontend, evaluates L1 rules (and optionally L2), writes an ENGAGEMENT decision row if the action is not ALLOW, and returns a surface and copy for the UI to render.

Valid signals: `rage_click`, `dwell_no_action`, `abandoned_flow_step`, `repeated_query`, `points_balance_stare`.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/engagement/event' \
  -d '{
    "signal": "rage_click",
    "userId": "USER#001",
    "sessionId": "SESSION#xxxxxxxx",
    "params": { "count": 5 }
  }'
```

200 response:
```json
{
  "data": {
    "surface": "nudge_banner",
    "copy": "Your loyalty points are waiting - explore what you can do with them.",
    "reasonCode": "RAGE_CLICK_HIGH",
    "engineLayer": "L1",
    "score": 72,
    "action": "NUDGE",
    "decisionId": "DEC#ENG#xxxxxxxx"
  }
}
```

`surface` is `null` and `decisionId` is `null` when `action` is `ALLOW`.

## Profile completeness

`GET /user/profile-completeness` returns a percentage score, a list of missing fields, and a suggested nudge message for the user.

**Request**

| Parameter | In | Required | Description |
|---|---|---|---|
| `userId` | query | yes | e.g. `USER%23001` |

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  'https://signal.glinr.com/api/user/profile-completeness?userId=USER%23001'
```

**Response**

```json
{
  "percent": 60,
  "missingFields": ["phone", "homeAddress", "tier"],
  "nudgeText": "Add your phone number to unlock faster account recovery."
}
```

| Field | Type | Description |
|---|---|---|
| `percent` | number | 0-100 completeness score |
| `missingFields` | string[] | Attribute names absent or null on the profile |
| `nudgeText` | string | Suggested copy to display to the user |

## Transactions

### Transfer points (clean run)

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/transactions/transfer' \
  -d '{
    "userId": "USER#001",
    "recipientId": "USER#002",
    "amount": 500,
    "channel": "APP"
  }'
```

Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### Transfer (trigger fraud hold)

Run the transfer call above five times in quick succession (within an hour) from the same sender. The fifth one trips the heuristic (`transferCount1h >= 4`) and returns a HELD decision plus a fraud SNS publish.

### Transfer step-up MFA verify

Completes a transfer that the fraud engine held for step-up MFA. The `challengeId` comes from the `MFA_REQUIRED` response on the original transfer attempt.

```bash
curl -H 'Authorization: Bearer tok_xxxxxxxx' \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/transactions/mfa/verify' \
  -d '{
    "challengeId": "SESSION#xxxxxxxx",
    "otp": "123456"
  }'
```

200 response:
```json
{
  "data": {
    "action": "ALLOW",
    "transferId": "XFER#xxxxxxxx",
    "completedAt": 1716299100,
    "mfaPath": "TRANSFER_RISK"
  }
}
```

400 `MFA_CHALLENGE_INVALID` means the challenge row is missing, expired, or already consumed.

## Admin endpoints

All admin endpoints require the same gateway Basic Auth header (`demoClient:demoSecret`). The gateway additionally checks that the basic-auth subject is present in the `ADMIN_USERNAMES` environment variable (default value: `demoClient`). Requests from any other subject receive a `403`.

### Decisions list

`GET /admin/decisions` returns decision rows sorted newest-first.

**Query parameters**

| Parameter | Required | Description |
|---|---|---|
| `window` | yes | Time window: `1h`, `24h`, or `7d` |
| `type` | no | Filter by decision type (`LOGIN`, `TRANSFER`, `OFFER`, `NUDGE`) |
| `userId` | no | Filter to a single user |
| `limit` | no | Max rows to return (default 50) |

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/decisions?window=24h&type=LOGIN&limit=10'
```

**Response**

```json
{
  "decisions": [
    {
      "decisionId": "DECISION#abc123",
      "userId": "USER#001",
      "type": "LOGIN",
      "action": "ALLOW",
      "score": 48,
      "reason": "L2 reviewed geo change; context acceptable",
      "engineLayer": "L1+L2",
      "llmLatencyMs": 320,
      "llmModel": "gpt-4o-mini",
      "createdAt": "2026-05-20T14:22:00Z"
    }
  ]
}
```

Auth requirement: basic-auth subject must be listed in `ADMIN_USERNAMES`.

### Decision detail

`GET /admin/decisions/{id}` returns a single decision row plus a synthetic audit trail and trace object.

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/decisions/DECISION%23abc123'
```

200 response (top-level keys):
```json
{
  "data": {
    "decision": { "...all row fields..." },
    "auditTrail": [
      { "step": "L1 rule evaluated", "score": 48, "action": "ALLOW", "reasonCode": "GEO_OK" }
    ],
    "trace": {
      "ruleId": null,
      "ruleName": "GEO_OK",
      "engineLayer": "L1",
      "latencyMs": 4,
      "matched": [...],
      "llmRationale": null
    }
  }
}
```

For `L1+L2` decisions `auditTrail` gains a second step with `llmModel` and `llmLatencyMs`.

### Decisions export

`GET /admin/decisions/export` returns decisions as JSON (default) or CSV. Accepts the same `window`, `type`, and `userId` filters as the list endpoint. Capped at 10 000 rows.

```bash
# JSON
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/decisions/export?window=7d'

# CSV download
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/decisions/export?window=7d&format=csv' \
  -o decisions.csv
```

CSV columns: `decisionId`, `userId`, `timestamp`, `decisionType`, `score`, `riskLevel`, `action`, `engineLayer`, `llmModel`, `llmLatencyMs`, `reason`.

### Metrics

`GET /admin/metrics` returns aggregate counts and a rough cost estimate for LLM calls in the selected window.

**Query parameters**

| Parameter | Required | Description |
|---|---|---|
| `window` | yes | `1h`, `24h`, or `7d` |

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/metrics?window=24h'
```

**Response**

```json
{
  "totals": {
    "total": 142,
    "l1": 98,
    "l1plus_l2": 44,
    "by_type": {
      "LOGIN": 60,
      "TRANSFER": 40,
      "OFFER": 30,
      "NUDGE": 12
    },
    "by_action": {
      "ALLOW": 120,
      "HOLD": 15,
      "BLOCK": 7
    }
  },
  "costEstimateUsd": 0.012,
  "asOf": "2026-05-20T15:00:00Z"
}
```

| Field | Description |
|---|---|
| `totals.l1` | Decisions resolved by L1 only |
| `totals.l1plus_l2` | Decisions that escalated to the L2 LLM router |
| `costEstimateUsd` | Estimated LiteLLM proxy spend for the window |
| `asOf` | Timestamp of the snapshot |

Auth requirement: basic-auth subject must be listed in `ADMIN_USERNAMES`.

### Release decision

`POST /admin/decisions/{id}/release` clears a blocked user by writing a `DECISION_RELEASE` row and setting `UserState.isBlocked` to false.

**Path parameter**

| Parameter | Description |
|---|---|
| `id` | The `decisionId` of the HOLD or BLOCK decision to release (URL-encoded if it contains `#`) |

```bash
curl -u demoClient:demoSecret \
  -X POST \
  'https://signal.glinr.com/api/admin/decisions/DECISION%23abc123/release'
```

**Response**

```json
{
  "released": true,
  "originalDecisionId": "DECISION#abc123",
  "releasedAt": "2026-05-20T15:10:00Z"
}
```

Auth requirement: basic-auth subject must be listed in `ADMIN_USERNAMES`.

### Users list

`GET /admin/users` returns a paginated list of all users. The `passwordHash` field is stripped from every row.

**Query parameters**

| Parameter | Required | Description |
|---|---|---|
| `limit` | no | Page size (default 20) |
| `cursor` | no | Pagination cursor from a previous response |

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/users?limit=10'
```

**Response**

```json
{
  "users": [
    {
      "userId": "USER#001",
      "username": "user001",
      "email": "user001@example.com",
      "tier": "GOLD",
      "points": 12000
    }
  ],
  "nextCursor": "eyJ1c2VySWQiOiJVU0VSIzAxMCJ9"
}
```

Pass `nextCursor` as the `cursor` parameter on the next request to get the following page. When `nextCursor` is absent the list is exhausted.

Auth requirement: basic-auth subject must be listed in `ADMIN_USERNAMES`.

### User risk score

Returns the user's current risk score with exponential decay applied and a snapshot of their most recent risk-relevant decisions for a sparkline. The decay half-life defaults to 24 h (`RISK_HALF_LIFE_SEC` env var).

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/users/USER%23001/risk'
```

200 response (top-level keys):
```json
{
  "data": {
    "userId": "USER#001",
    "riskScore": 18.42,
    "storedRiskScore": 22,
    "riskUpdatedAt": 1716295800,
    "asOf": 1716299100,
    "recentDecisions": [
      {
        "decisionId": "DECISION#abc123",
        "decisionType": "FRAUD_LOGIN",
        "action": "ALLOW",
        "score": 22,
        "riskLevel": "LOW",
        "timestamp": 1716295800
      }
    ]
  }
}
```

### Sessions list

`GET /admin/sessions` lists active ACCESS sessions (bearer tokens currently valid).

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/sessions'
```

### Revoke session

`POST /admin/sessions/{sessionId}/revoke` invalidates a specific bearer session by ID.

```bash
curl -u demoClient:demoSecret \
  -X POST \
  'https://signal.glinr.com/api/admin/sessions/SESSION%23xxxxxxxx/revoke'
```

### MFA status

`GET /admin/mfa-status` returns MFA enrollment status across users.

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/mfa-status'
```

### AI config

`GET /admin/ai-config` returns the curated LLM catalog and the currently active model. Read-only in v1.

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/ai-config'
```

200 response (top-level keys):
```json
{
  "proxyConfigured": true,
  "activeModelId": "gpt-4o-mini",
  "activeModelKnown": true,
  "defaultModelId": "gpt-4o-mini",
  "models": [
    {
      "id": "gpt-4o-mini",
      "classifyCostUsd": 0.0006,
      "active": true
    }
  ]
}
```

## Demo controls

These endpoints exist to support the DemoPanel: mutating user state, tracking operator actions, and resetting data. All require admin Basic Auth.

### Mutate user

`POST /admin/demo-actions/mutate-user` applies one or more field mutations to UserProfile or UserState and returns a before/after diff. Each mutation key is applied independently.

**Supported mutation fields:**

| Field | Type | Effect |
|---|---|---|
| `tier` | string | Sets `UserProfile.tier`; writes `platinumReachedAt` to UserState when `"Platinum"` |
| `loyaltyScore` | number | Sets `UserProfile.loyaltyScore` |
| `profileCompletion` | number | Sets `UserProfile.profileCompletion`; writes `profileCompletionReachedAt` when crossing 90 |
| `mfaEnrolled` | boolean | `true`: sets a demo MFA secret. `false`: removes it |
| `flow.transfer.abandon` | true | Writes a stale transfer draft (120 s old) to UserState |
| `flow.transfer.resume` | true | Clears the transfer draft, writes `lastTransferCompletedAt` |
| `booking.trigger` | true | Writes `recentBookingAt` to UserState |

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/admin/demo-actions/mutate-user' \
  -d '{
    "userId": "USER#001",
    "mutation": { "tier": "Platinum", "loyaltyScore": 95 }
  }'
```

200 response:
```json
{
  "data": {
    "userId": "USER#001",
    "touched": {
      "tier": { "from": "GOLD", "to": "Platinum" },
      "loyaltyScore": { "from": 70, "to": 95 }
    },
    "activityId": "DEMO#xxxxxxxx",
    "mutatedAt": 1716299100
  }
}
```

### Write demo event

`POST /admin/demo-events` records an operator action from the DemoPanel. Stored as a `DEMO_EVENT` row in UserActivity.

Valid `type` values: `USER_SWITCH`, `LOCATION_OVERRIDE`, `FORCE_HIGH_RISK`, `SIGNAL_TRIGGER`, `MFA_FORCED`, `SURFACE_REEVALUATE`.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/admin/demo-events' \
  -d '{
    "type": "USER_SWITCH",
    "actor": "operator",
    "payload": { "to": "USER#002" }
  }'
```

201 response:
```json
{
  "data": {
    "activityId": "DEMO#xxxxxxxx",
    "type": "USER_SWITCH",
    "actor": "operator",
    "timestamp": 1716299100
  }
}
```

### List demo events

`GET /admin/demo-events` returns DEMO_EVENT rows from UserActivity after the `since` cursor (epoch ms). Newest first, max 50.

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/demo-events?since=1716295800000&limit=20'
```

200 response (top-level keys): `data.events`, `data.count`.

### Activity feed

`GET /admin/activity-feed` merges decisions, active sessions, and demo events into a single chronological stream. Useful for the admin live-ticker.

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/activity-feed?since=1716295800000&limit=50'
```

200 response (top-level keys):
```json
{
  "data": {
    "events": [
      {
        "kind": "DECISION",
        "timestamp": 1716299100000,
        "userId": "USER#001",
        "summary": "FRAUD_LOGIN ALLOW score=12 L1",
        "decisionId": "DECISION#abc123",
        "engineLayer": "L1"
      }
    ],
    "nextCursor": 1716299100000
  }
}
```

`kind` values: `DECISION`, `SESSION`, `DEMO_EVENT`. Pass `nextCursor` as `since` on the next poll.

### Reseed

`POST /admin/dev/reseed` restores all five DynamoDB tables from the seed_data/ JSON files. Only available when `DEMO_MODE=1` (returns `403` otherwise). Useful after destructive demo runs.

```bash
curl -u demoClient:demoSecret \
  -X POST 'https://signal.glinr.com/api/admin/dev/reseed'
```

200 response:
```json
{
  "ok": true,
  "tablesReset": ["UserProfile", "UserSession", "UserActivity", "DecisionStore", "UserState"],
  "itemsWritten": 150,
  "durationMs": 840
}
```

### Dev config

`GET /admin/dev/config` returns demo feature flags. Does not require `DEMO_MODE=1` to be active (the UI needs this to decide whether to show the Demo controls section).

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/dev/config'
```

200 response:
```json
{ "demoMode": true }
```

## Rules editor

Engagement rules are json-rules-engine definitions stored in DynamoDB. They are evaluated on every `POST /engagement/event` call and can override L1 scores when a higher score is returned.

### List rules

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/rules'
```

Filter by status: `?status=ACTIVE` (values: `ACTIVE`, `DRAFT`, `ARCHIVED`).

200 response (top-level keys): `data.rules`, `data.count`. Each rule carries `ruleId`, `name`, `status`, `definition`, `updatedAt`.

### Create rule

Body fields: `name` (required), `status` (required, one of `ACTIVE`/`DRAFT`/`ARCHIVED`), `definition` (required object with `conditions` and `event`). `ruleId` is optional; one is generated when omitted.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/admin/rules' \
  -d '{
    "name": "Rage click escalation",
    "status": "ACTIVE",
    "definition": {
      "conditions": {
        "all": [{ "fact": "signal", "operator": "equal", "value": "rage_click" }]
      },
      "event": { "params": { "action": "NUDGE", "surface": "nudge_banner", "score": 80 } }
    }
  }'
```

201 response (top-level keys): `data.rule`.

### Get rule

```bash
curl -u demoClient:demoSecret \
  'https://signal.glinr.com/api/admin/rules/RULE%23abc123'
```

200 response (top-level keys): `data.rule`. 404 when the rule is not found.

### Update rule

Same body shape as create. `ruleId` can come from the path or the body.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X PUT 'https://signal.glinr.com/api/admin/rules/RULE%23abc123' \
  -d '{
    "name": "Rage click escalation",
    "status": "ARCHIVED",
    "definition": { "..." }
  }'
```

200 response (top-level keys): `data.rule`.

### AI suggest rule

Converts a natural-language description to a draft rule via the LiteLLM proxy. The draft is returned for review and is not persisted. Submit it to `POST /admin/rules` after the operator approves it.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/admin/rules/ai-suggest' \
  -d '{ "description": "Trigger a nudge when the user stares at their points balance for more than 10 seconds" }'
```

200 response: `data` contains the draft rule object. 503 `AI_UNAVAILABLE` when the proxy is not configured or the call fails.

### Test rule

Preview how often a draft rule definition would have fired against recent ENGAGEMENT decisions. The rule is not persisted.

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://signal.glinr.com/api/admin/rules/test' \
  -d '{
    "definition": {
      "conditions": {
        "all": [{ "fact": "signal", "operator": "equal", "value": "rage_click" }]
      },
      "event": { "params": { "action": "NUDGE", "surface": "nudge_banner", "score": 80 } }
    },
    "windowSec": 3600
  }'
```

200 response (top-level keys): `data.count`, `data.samples`.

## Demo use cases verified

### UC1 - Login geo-velocity (L1 and gray-zone L2 path)

1. Log in as `user001` from `New York` with `device-abc`. Score lands below 40 and L1 resolves it as ALLOW. `engineLayer` in the response is `L1`.
2. Log in again immediately with the same credentials but change `location` to `Tokyo`. L1 detects the rapid geo jump, raises the score into the gray zone (40-70), and routes the event to L2. The LiteLLM proxy re-evaluates with full context. Depending on other signals the outcome may be ALLOW with a higher score, HOLD, or BLOCK. `engineLayer` is `L1+L2` and `llmLatencyMs` is present.
3. If the result is HOLD or BLOCK, use `POST /admin/decisions/{id}/release` to clear the user and run the scenario again.

### UC2 - Transfer velocity (L1 heuristic into L2 gray zone)

1. Transfer 500 points from `USER#001` to `USER#002` once. Score is low, L1 resolves ALLOW.
2. Repeat the transfer four more times within the same hour. On the fifth call `transferCount1h` crosses the threshold (>= 4) and L1 flags the score into the gray zone. L2 receives the event, weighs transfer history, and may escalate to HOLD or BLOCK.
3. Check `GET /admin/decisions?window=1h&userId=USER%23001&type=TRANSFER` to see the decision chain. The last row will carry `engineLayer: "L1+L2"` if L2 was invoked.
4. Release via `POST /admin/decisions/{id}/release` and confirm `UserState.isBlocked` is cleared by checking `GET /dashboard?userId=USER%23001`.

### UC3 - Profile-completeness nudge

1. Pick a user with a sparse profile, for example `user015`. Call `GET /user/profile-completeness?userId=USER%23015`.
2. Note the `missingFields` array and `nudgeText` in the response. The frontend surfaces this copy as a dismissible nudge card.
3. Call `GET /nudges?userId=USER%23015` to confirm a nudge record exists matching the text.
4. Call `POST /nudges/action` with `action: "DISMISS"` and verify the nudge no longer appears on the next `GET /nudges` call.
5. Fill in one of the missing fields via a profile update and re-run `GET /user/profile-completeness` to confirm `percent` increases and the field drops from `missingFields`.

## Postman setup tips

1. New collection, set the collection-level Authorization to Basic, username `demoClient`, password `demoSecret`. Every request inherits it.
2. Add a collection-level variable `baseUrl` = `https://signal.glinr.com/api` and use `{{baseUrl}}/auth/login` etc in the URL field. Lets you swap stages later by changing the variable.
3. For the user id query param put `USER#001` in the Params tab. Postman encodes the `#` for you. Do not paste `USER%23001` there or it double-encodes.
4. After Login, grab `data.token` from the response and store it in a `bearerToken` collection variable using a Test script:
   ```js
   pm.collectionVariables.set('bearerToken', pm.response.json().data.token);
   ```
   Then set the Authorization on bearer-auth requests to `Bearer {{bearerToken}}`.
5. If you get a 502 / 504 once after a long idle, that is a Lambda cold start. Retry once.

## Common errors decoded

| HTTP | code in body                | Meaning                                                                 |
|------|-----------------------------|-------------------------------------------------------------------------|
| 401  | (no body)                   | Missing or wrong gateway Basic Auth header. Check `demoClient:demoSecret`. |
| 401  | `INVALID_CREDENTIALS`       | Wrong username or password in the JSON body. Use `user001` / `Password1`.  |
| 400  | `MISSING_FIELD`             | A required field is missing from the body or query. Compare to the curl above. |
| 400  | `VALIDATION_ERROR`          | Field is present but the value is invalid (for example `amount <= 0`).  |
| 400  | `MFA_CHALLENGE_INVALID`     | Transfer step-up challenge not found, expired, or already consumed.     |
| 403  | `ACCOUNT_BLOCKED`           | Heuristic flagged the user. State is in `UserState`. Use `POST /admin/decisions/{id}/release` to clear. |
| 403  | `FORBIDDEN`                 | Admin endpoint called with a subject not in `ADMIN_USERNAMES`. |
| 404  | `USER_NOT_FOUND`            | The `userId` or `recipientId` does not exist in `UserProfile`.          |
| 500  | `INTERNAL_ERROR`            | Unhandled exception. Tail CloudWatch logs: `aws logs tail signal-force-runtime-ApiLambdaLogGroup3846CFFB-sSgrJbYDLaiR --follow --region us-east-1`. |

## What is verified vs not

Verified live: `POST /auth/login`, `POST /auth/mfa/verify`, `GET /dashboard`, `GET /offers`, `GET /admin/decisions`, `GET /admin/metrics`, `POST /admin/decisions/{id}/release`, `GET /admin/users`, `GET /user/profile-completeness`.

Not yet smoke-tested end-to-end: all routes added in this document. They should work but flag anything weird and we will fix.
