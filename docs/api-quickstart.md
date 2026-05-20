# Signal Force API quickstart

Copy-paste curl examples for the deployed demo API. Verified working against the live stack on 2026-05-20.

## Endpoint index

All endpoints require `Authorization: Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0` (`demoClient:demoSecret`). Admin routes additionally require the basic-auth subject to be in the `ADMIN_USERNAMES` env (default `demoClient`).

| Method | Path | Purpose | Auth | Anchor |
|--------|------|---------|------|--------|
| `POST` | `/auth/login` | Customer login, returns sessionId and risk decision | Basic | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/auth/mfa/verify` | Verify the static OTP (123456) to complete login | Basic | [Auth flow](#auth-flow-run-these-two-first) |
| `POST` | `/transactions/transfer` | Points transfer with fraud scoring | Basic | [Transactions](#transactions) |
| `GET` | `/user/profile` | Fetch full loyalty profile for a user | Basic | [Customer surface](#customer-surface) |
| `GET` | `/user/profile-completeness?userId=` | Completeness percent, missing fields, and nudge text | Basic | [Profile completeness](#profile-completeness) |
| `GET` | `/offers?userId=` | Personalized offers for a user | Basic | [Customer surface](#customer-surface) |
| `POST` | `/offers/action` | Track an offer interaction (IMPRESSION, CLICK, BOOK) | Basic | [Customer surface](#customer-surface) |
| `GET` | `/nudges?userId=` | Active nudges for a user | Basic | [Customer surface](#customer-surface) |
| `POST` | `/nudges/action` | Track a nudge interaction (SHOWN, DISMISSED, COMPLETED) | Basic | [Customer surface](#customer-surface) |
| `GET` | `/dashboard?userId=` | Customer dashboard: profile, fraud status, offers, nudges, activity | Basic | [Customer surface](#customer-surface) |
| `GET` | `/admin/decisions?window=&type=&userId=&limit=` | Decision feed, sorted newest-first | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/metrics?window=` | Aggregate counts and L1 vs L1+L2 split | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `POST` | `/admin/decisions/{id}/release` | Override a HOLD or BLOCK decision | Basic + admin | [Admin endpoints](#admin-endpoints) |
| `GET` | `/admin/users?limit=&cursor=` | Paginated user list (passwordHash stripped) | Basic + admin | [Admin endpoints](#admin-endpoints) |

## Connection details

- Base URL: `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com`
- Gateway auth: HTTP Basic, `demoClient` / `demoSecret`. Goes in the `Authorization` header.
- App auth: separate. After `POST /auth/login` you get a `sessionId`. Verify with `POST /auth/mfa/verify`. The static OTP is `123456`.
- Content type for POSTs: `application/json`.

## Seeded users

30 users, ids `USER#001` through `USER#030`, usernames `user001` through `user030`. All share password `Password1`.

The user id contains a `#`. In query strings that becomes `%23`, so `USER#001` becomes `USER%23001`. Postman handles this for you when you put the value in the Params tab.

## Decision row schema

Every decision written to `DecisionStore` now carries a set of standard attributes plus optional engine-layer fields.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `decisionId` | string | yes | Partition key, format `DECISION#<uuid>` |
| `userId` | string | yes | Subject of the decision |
| `type` | string | yes | One of `LOGIN`, `TRANSFER`, `OFFER`, `NUDGE` |
| `action` | string | yes | Outcome: `ALLOW`, `HOLD`, `BLOCK`, `RELEASE` |
| `score` | number | yes | Risk score 0-100 from the engine |
| `reason` | string | yes | Human-readable explanation |
| `engineLayer` | string | yes | `L1` or `L1+L2` (see below) |
| `llmLatencyMs` | number | no | Round-trip time to the L2 LLM router in milliseconds. Present only when `engineLayer` is `L1+L2`. |
| `llmModel` | string | no | Model identifier returned by the LiteLLM proxy. Present only when `engineLayer` is `L1+L2`. |
| `createdAt` | string | yes | ISO 8601 timestamp |
| `ttl` | number | no | DynamoDB TTL epoch, set on non-critical rows |

**L1 vs L1+L2.** L1 is a fast, rule-based heuristic layer that runs on every request (velocity checks, device fingerprint, transfer count). When L1 produces a score in the gray zone (40 to 70 inclusive) the request escalates to L2, which sends the event to the LiteLLM proxy for a more nuanced assessment. L2 may revise the score up or down before a final action is written. Decisions that never leave L1 carry `engineLayer: "L1"` and no LLM fields. Decisions that hit L2 carry `engineLayer: "L1+L2"` plus `llmLatencyMs` and `llmModel`.

## Auth flow (run these two first)

### 1. Login

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/auth/login' \
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
    "decision": {
      "action": "ALLOW",
      "score": 12,
      "engineLayer": "L1",
      "reason": "Low-risk login from known device"
    }
  }
}
```

200 response (L2 invoked, score was in gray zone 40-70):
```json
{
  "data": {
    "status": "SUCCESS",
    "userId": "USER#001",
    "sessionId": "SESSION#xxxxxxxx",
    "decision": {
      "action": "ALLOW",
      "score": 48,
      "engineLayer": "L1+L2",
      "llmLatencyMs": 320,
      "llmModel": "gpt-4o-mini",
      "reason": "L2 reviewed geo change; context acceptable"
    }
  }
}
```

Copy the `sessionId` for the next call. Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### 2. MFA verify

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/auth/mfa/verify' \
  -d '{
    "sessionId": "SESSION#xxxxxxxx",
    "otp": "123456"
  }'
```

200 response:
```json
{ "data": { "status": "SUCCESS", "message": "MFA verified" } }
```

## Customer surface

### Dashboard (aggregate view)

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/dashboard?userId=USER%23001'
```

Returns the user, fraud status, current offers and nudges, plus recent activity. Verified 200.

### Get user profile

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/user/profile?userId=USER%23001'
```

### Get offers

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/offers?userId=USER%23001'
```

204 (no content) means the user has no live offers right now. Trigger a fresh evaluate to seed one.

Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### Track offer action

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/offers/action' \
  -d '{
    "userId": "USER#001",
    "offerId": "OFFER#001",
    "action": "CLICK"
  }'
```

Valid actions: `CLICK`, `DISMISS`, `CONVERT`.

### Get nudges

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/nudges?userId=USER%23001'
```

Response objects include hints about which engine layer decided this; see [Decision row schema](#decision-row-schema).

### Track nudge action

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/nudges/action' \
  -d '{
    "userId": "USER#001",
    "nudgeId": "NUDGE#PROFILE",
    "action": "DISMISS"
  }'
```

## Profile completeness

`GET /user/profile-completeness` returns a percentage score, a list of missing fields, and a suggested nudge message for the user.

**Request**

| Parameter | In | Required | Description |
|---|---|---|---|
| `userId` | query | yes | e.g. `USER%23001` |

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/user/profile-completeness?userId=USER%23001'
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
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/transactions/transfer' \
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
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/decisions?window=24h&type=LOGIN&limit=10'
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

### Metrics

`GET /admin/metrics` returns aggregate counts and a rough cost estimate for LLM calls in the selected window.

**Query parameters**

| Parameter | Required | Description |
|---|---|---|
| `window` | yes | `1h`, `24h`, or `7d` |

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/metrics?window=24h'
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
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/decisions/DECISION%23abc123/release'
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
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/users?limit=10'
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
2. Add a collection-level variable `baseUrl` = `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com` and use `{{baseUrl}}/auth/login` etc in the URL field. Lets you swap stages later by changing the variable.
3. For the user id query param put `USER#001` in the Params tab. Postman encodes the `#` for you. Do not paste `USER%23001` there or it double-encodes.
4. After Login, grab `data.sessionId` from the response and store it in a `sessionId` collection variable using a Test script:
   ```js
   pm.collectionVariables.set('sessionId', pm.response.json().data.sessionId);
   ```
   Then in MFA Verify body use `{{sessionId}}`.
5. If you get a 502 / 504 once after a long idle, that is a Lambda cold start. Retry once.

## Common errors decoded

| HTTP | code in body                | Meaning                                                                 |
|------|-----------------------------|-------------------------------------------------------------------------|
| 401  | (no body)                   | Missing or wrong gateway Basic Auth header. Check `demoClient:demoSecret`. |
| 401  | `INVALID_CREDENTIALS`       | Wrong username or password in the JSON body. Use `user001` / `Password1`.  |
| 400  | `MISSING_FIELD`             | A required field is missing from the body or query. Compare to the curl above. |
| 400  | `VALIDATION_ERROR`          | Field is present but the value is invalid (for example `amount <= 0`).  |
| 403  | `ACCOUNT_BLOCKED`           | Heuristic flagged the user. State is in `UserState`. Use `POST /admin/decisions/{id}/release` to clear. |
| 403  | `FORBIDDEN`                 | Admin endpoint called with a subject not in `ADMIN_USERNAMES`. |
| 404  | `USER_NOT_FOUND`            | The `userId` or `recipientId` does not exist in `UserProfile`.          |
| 500  | `INTERNAL_ERROR`            | Unhandled exception. Tail CloudWatch logs: `aws logs tail signal-force-runtime-ApiLambdaLogGroup3846CFFB-sSgrJbYDLaiR --follow --region us-east-1`. |

## What is verified vs not

Verified live: `POST /auth/login`, `POST /auth/mfa/verify`, `GET /dashboard`, `GET /offers`, `GET /admin/decisions`, `GET /admin/metrics`, `POST /admin/decisions/{id}/release`, `GET /admin/users`, `GET /user/profile-completeness`.

Not yet smoke-tested end-to-end: `GET /user/profile`, `POST /offers/action`, `GET /nudges`, `POST /nudges/action`, `POST /transactions/transfer`. They should work but flag anything weird and we will fix.
