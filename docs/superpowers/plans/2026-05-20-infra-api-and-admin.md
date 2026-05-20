# Infra and API Implementation Plan (Codefest Demo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Lane:** Infra and API only. Frontend is owned by Julia (Google AI Studio output + cleanup) under `apps/frontend/`. This plan does NOT touch `apps/frontend/`.

**Goal:** Make the API ready for the three demo use cases (suspicious login, points transfer abuse, profile completeness) plus the admin console endpoints, then publish the API contract Julia consumes.

**Architecture:** Existing Node 18 Lambda + HTTP API + DynamoDB. Add admin endpoints (`/admin/decisions`, `/admin/metrics`, `/admin/decisions/{id}/release`, `/admin/users`) and a `/user/profile-completeness` endpoint. Tune the transfer-abuse threshold to MEDIUM-then-HIGH per the meeting. Confirm the geo-velocity decision path writes a `LOGIN_GEO` row. Keep everything on one Lambda; no new tables; no new IAM grants.

**Tech stack:** Node 18 Lambda. Jest with `aws-sdk-client-mock` for unit tests. AWS CLI for deploy and smoke. No frontend tooling in this plan.

**Spec:** `docs/superpowers/specs/2026-05-20-admin-and-signal-ui-design.md` (system design, both lanes). This plan implements only the infra slice.

---

## File Map (infra only)

- Modify `apps/backend/src/handler.js`: route table entries for admin endpoints, profile-completeness route, transfer-threshold tune.
- Create `apps/backend/src/admin.js`: `isAdmin`, `requireAdmin`, `listDecisions`, `metrics`, `releaseHold`, `listUsers`, `profileCompleteness` helpers (extract so handler.js stays under 500 lines).
- Create `apps/backend/tests/admin.test.js`: unit tests with the AWS SDK client mocked.
- Create `apps/backend/jest.config.js`: minimal jest config.
- Modify `apps/backend/package.json`: jest + aws-sdk-client-mock devDeps and `test` script.
- Modify `seed_data/UserProfile_batch_2.json`: append admin user.
- Modify `docs/api-quickstart.md`: document the four new admin endpoints and the profile-completeness endpoint, with copy-paste curl Julia can consume.

No changes to `infra/cdk/**`. No changes to `apps/frontend/**`. No changes to `serverless.yml` (env vars already cover everything needed).

---

## Task 1: Backend jest harness and seed admin user

**Files:**
- Modify: `apps/backend/package.json`
- Create: `apps/backend/jest.config.js`
- Modify: `seed_data/UserProfile_batch_2.json`

- [ ] **Step 1: Add jest and the SDK mock**

Edit `apps/backend/package.json`. Add to `devDependencies`:

```json
"jest": "^29.7.0",
"aws-sdk-client-mock": "^4.0.0"
```

Add to `scripts`:

```json
"test": "jest --colors"
```

Run from repo root: `npm install`.

- [ ] **Step 2: jest config**

Write `apps/backend/jest.config.js`:

```js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
};
```

- [ ] **Step 3: Seed the admin user**

Edit `seed_data/UserProfile_batch_2.json`. Append one more `PutRequest` inside the existing array:

```json
{
  "PutRequest": {
    "Item": {
      "userId":     { "S": "USER#ADMIN001" },
      "username":   { "S": "admin001" },
      "passwordHash": { "S": "AdminPass1" },
      "email":      { "S": "admin001@signalforce.demo" },
      "phone":      { "S": "+1-202-555-0001" },
      "tier":       { "S": "ADMIN" },
      "loyaltyScore":      { "N": "0" },
      "profileCompletion": { "N": "1.0" },
      "emailVerified":     { "BOOL": true },
      "phoneVerified":     { "BOOL": true },
      "createdAt":         { "N": "1779290000" },
      "updatedAt":         { "N": "1779290000" }
    }
  }
}
```

- [ ] **Step 4: Load the admin user**

```bash
aws dynamodb batch-write-item \
  --request-items file://seed_data/UserProfile_batch_2.json \
  --region us-east-1
aws dynamodb get-item --table-name UserProfile \
  --key '{"userId":{"S":"USER#ADMIN001"}}' --region us-east-1
```

Expected: the admin row prints.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/package.json apps/backend/jest.config.js seed_data/UserProfile_batch_2.json package-lock.json
git commit -m "test(backend): add jest harness and seed admin user"
```

---

## Task 2: isAdmin helper (TDD)

**Files:**
- Create: `apps/backend/tests/admin.test.js`
- Create: `apps/backend/src/admin.js`

- [ ] **Step 1: Failing test**

Write `apps/backend/tests/admin.test.js`:

```js
const { isAdmin } = require('../src/admin');

describe('isAdmin', () => {
  test('true when tier is ADMIN', () => expect(isAdmin({ tier: 'ADMIN' })).toBe(true));
  test('false for other tier', () => expect(isAdmin({ tier: 'Gold' })).toBe(false));
  test('false when profile is null', () => expect(isAdmin(null)).toBe(false));
  test('false when profile has no tier', () => expect(isAdmin({})).toBe(false));
});
```

Run: `cd apps/backend && npx jest`. Expect FAIL on missing module.

- [ ] **Step 2: Implement**

Write `apps/backend/src/admin.js`:

```js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CFG = {
  tUserProfile: process.env.TABLE_USER_PROFILE || 'UserProfile',
  tDecision: process.env.TABLE_DECISION_STORE || 'DecisionStore',
  tUserState: process.env.TABLE_USER_STATE || 'UserState',
};

function isAdmin(profile) {
  return Boolean(profile && profile.tier === 'ADMIN');
}

function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
function err(statusCode, code, message) {
  return json(statusCode, { correlationId: '', error: { code, message } });
}

async function requireAdmin(sessionUserId) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserProfile, Key: { userId: sessionUserId } }));
  return isAdmin(r.Item) ? r.Item : null;
}

module.exports = { isAdmin, requireAdmin, json, err, ddb, CFG, ScanCommand, GetCommand, PutCommand, UpdateCommand, randomUUID };
```

Run: `cd apps/backend && npx jest`. Expect PASS, 4 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add isAdmin and requireAdmin helpers"
```

---

## Task 3: GET /admin/decisions (TDD + wire route)

**Files:**
- Modify: `apps/backend/tests/admin.test.js`
- Modify: `apps/backend/src/admin.js`
- Modify: `apps/backend/src/handler.js`

- [ ] **Step 1: Failing test**

Append to `apps/backend/tests/admin.test.js`:

```js
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { listDecisions } = require('../src/admin');

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

function adminMock() {
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'USER#ADMIN001', tier: 'ADMIN' } });
}

describe('listDecisions', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { tier: 'Gold' } });
    const res = await listDecisions({ sessionUserId: 'USER#001', query: {} });
    expect(res.statusCode).toBe(403);
  });

  test('returns newest first, capped by limit', async () => {
    adminMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { decisionId: 'D1', timestamp: 100, type: 'FRAUD_TRANSFER' },
        { decisionId: 'D2', timestamp: 300, type: 'OFFER' },
        { decisionId: 'D3', timestamp: 200, type: 'NUDGE' },
      ],
    });
    const res = await listDecisions({ sessionUserId: 'USER#ADMIN001', query: { limit: '2' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.decisions.map((d) => d.decisionId)).toEqual(['D2', 'D3']);
  });

  test('filters by type', async () => {
    adminMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { decisionId: 'D1', timestamp: 100, type: 'FRAUD_TRANSFER' },
        { decisionId: 'D2', timestamp: 200, type: 'OFFER' },
      ],
    });
    const res = await listDecisions({ sessionUserId: 'USER#ADMIN001', query: { type: 'FRAUD_TRANSFER' } });
    expect(JSON.parse(res.body).data.decisions).toHaveLength(1);
  });
});
```

Run jest. Expect FAIL on `listDecisions is not a function`.

- [ ] **Step 2: Implement**

Append to `apps/backend/src/admin.js` (before `module.exports`):

```js
const WINDOW_SECONDS = { '5m': 300, '1h': 3600, '24h': 86400 };

async function listDecisions({ sessionUserId, query }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');

  const windowKey = query?.window ?? '1h';
  const windowSec = WINDOW_SECONDS[windowKey] ?? 3600;
  const cutoff = Math.floor(Date.now() / 1000) - windowSec;
  const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50)));

  const r = await ddb.send(
    new ScanCommand({
      TableName: CFG.tDecision,
      FilterExpression: '#ts >= :cutoff',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':cutoff': cutoff },
    })
  );
  let items = r.Items ?? [];
  if (query?.type) items = items.filter((it) => it.type === query.type);
  if (query?.userId) items = items.filter((it) => it.userId === query.userId);
  items.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  items = items.slice(0, limit);

  return json(200, { correlationId: '', data: { decisions: items, window: windowKey } });
}
```

Update `module.exports` to include `listDecisions`.

Run jest. Expect PASS, 7 tests total.

- [ ] **Step 3: Wire the route**

Edit `apps/backend/src/handler.js`. Add near the other requires:

```js
const { listDecisions } = require('./admin');
```

In the `route()` function, add before the 404 fallback:

```js
if (method === 'GET' && p === '/admin/decisions') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return listDecisions({ sessionUserId, query: event.queryStringParameters ?? {} });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /admin/decisions with admin gate"
```

---

## Task 4: GET /admin/metrics (TDD + wire route)

Same shape as Task 3.

- [ ] **Step 1: Failing test (append)**

```js
const { metrics } = require('../src/admin');

describe('metrics', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { tier: 'Gold' } });
    const res = await metrics({ sessionUserId: 'USER#001', query: {} });
    expect(res.statusCode).toBe(403);
  });
  test('aggregates by type and action', async () => {
    adminMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { type: 'FRAUD_TRANSFER', action: 'BLOCK', timestamp: 1 },
        { type: 'FRAUD_TRANSFER', action: 'BLOCK', timestamp: 2 },
        { type: 'OFFER', action: 'SHOW', timestamp: 3 },
        { type: 'OFFER', action: 'CONVERT', timestamp: 4 },
        { type: 'NUDGE', action: 'SHOW', timestamp: 5 },
        { type: 'NUDGE', action: 'DISMISS', timestamp: 6 },
      ],
    });
    const res = await metrics({ sessionUserId: 'USER#ADMIN001', query: { window: '1h' } });
    expect(JSON.parse(res.body).data).toEqual({
      window: '1h',
      decisionsCount: 6,
      heldCount: 2,
      offersShown: 2,
      offersConverted: 1,
      nudgesSent: 2,
      nudgesDismissed: 1,
      bedrockLatencyP95Ms: null,
    });
  });
});
```

- [ ] **Step 2: Implement**

Append to `apps/backend/src/admin.js`:

```js
async function metrics({ sessionUserId, query }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');
  const windowKey = query?.window ?? '1h';
  const windowSec = WINDOW_SECONDS[windowKey] ?? 3600;
  const cutoff = Math.floor(Date.now() / 1000) - windowSec;
  const r = await ddb.send(
    new ScanCommand({
      TableName: CFG.tDecision,
      FilterExpression: '#ts >= :cutoff',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':cutoff': cutoff },
    })
  );
  const items = r.Items ?? [];
  return json(200, {
    correlationId: '',
    data: {
      window: windowKey,
      decisionsCount: items.length,
      heldCount: items.filter((it) => it.action === 'BLOCK').length,
      offersShown: items.filter((it) => it.type === 'OFFER').length,
      offersConverted: items.filter((it) => it.type === 'OFFER' && it.action === 'CONVERT').length,
      nudgesSent: items.filter((it) => it.type === 'NUDGE').length,
      nudgesDismissed: items.filter((it) => it.type === 'NUDGE' && it.action === 'DISMISS').length,
      bedrockLatencyP95Ms: null,
    },
  });
}
```

Update `module.exports`. Run jest. Expect PASS.

- [ ] **Step 3: Wire route**

In `handler.js`, change the import:

```js
const { listDecisions, metrics } = require('./admin');
```

Add route:

```js
if (method === 'GET' && p === '/admin/metrics') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return metrics({ sessionUserId, query: event.queryStringParameters ?? {} });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /admin/metrics endpoint"
```

---

## Task 5: POST /admin/decisions/{id}/release (TDD + wire route)

- [ ] **Step 1: Failing test (append)**

```js
const { releaseHold } = require('../src/admin');
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

describe('releaseHold', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { tier: 'Gold' } });
    const res = await releaseHold({ sessionUserId: 'USER#001', decisionId: 'DEC#x' });
    expect(res.statusCode).toBe(403);
  });
  test('404 when decision missing', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'UserProfile', Key: { userId: 'USER#ADMIN001' } })
      .resolves({ Item: { tier: 'ADMIN' } })
      .on(GetCommand, { TableName: 'DecisionStore', Key: { decisionId: 'DEC#missing' } })
      .resolves({ Item: undefined });
    const res = await releaseHold({ sessionUserId: 'USER#ADMIN001', decisionId: 'DEC#missing' });
    expect(res.statusCode).toBe(404);
  });
  test('writes a DECISION_RELEASE row and clears block', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'UserProfile', Key: { userId: 'USER#ADMIN001' } })
      .resolves({ Item: { tier: 'ADMIN' } })
      .on(GetCommand, { TableName: 'DecisionStore', Key: { decisionId: 'DEC#abc' } })
      .resolves({ Item: { decisionId: 'DEC#abc', userId: 'USER#001', type: 'FRAUD_TRANSFER' } })
      .on(PutCommand)
      .resolves({})
      .on(UpdateCommand)
      .resolves({});
    const res = await releaseHold({ sessionUserId: 'USER#ADMIN001', decisionId: 'DEC#abc' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.decision.type).toBe('DECISION_RELEASE');
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

Append to `apps/backend/src/admin.js`:

```js
async function releaseHold({ sessionUserId, decisionId }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');
  const orig = await ddb.send(new GetCommand({ TableName: CFG.tDecision, Key: { decisionId } }));
  if (!orig.Item) return err(404, 'DECISION_NOT_FOUND', `No decision with id ${decisionId}`);
  const now = Math.floor(Date.now() / 1000);
  const release = {
    decisionId: `DEC#${randomUUID().slice(0, 8)}`,
    parentDecisionId: decisionId,
    userId: orig.Item.userId,
    timestamp: now,
    type: 'DECISION_RELEASE',
    action: 'ALLOW',
    severity: 'LOW',
    reason: 'Manual release by admin',
    releasedBy: sessionUserId,
  };
  await ddb.send(new PutCommand({ TableName: CFG.tDecision, Item: release }));
  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId: orig.Item.userId },
      UpdateExpression: 'SET isBlocked = :f, updatedAt = :u',
      ExpressionAttributeValues: { ':f': false, ':u': now },
    })
  );
  return json(200, { correlationId: '', data: { decision: release } });
}
```

Update `module.exports`. Run jest. Expect PASS.

- [ ] **Step 3: Wire route**

```js
const { listDecisions, metrics, releaseHold } = require('./admin');
```

```js
if (method === 'POST' && p.startsWith('/admin/decisions/') && p.endsWith('/release')) {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  const decisionId = decodeURIComponent(p.slice('/admin/decisions/'.length, -'/release'.length));
  return releaseHold({ sessionUserId, decisionId });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add POST /admin/decisions/{id}/release"
```

---

## Task 6: GET /admin/users (TDD + wire route)

- [ ] **Step 1: Failing test (append)**

```js
const { listUsers } = require('../src/admin');

describe('listUsers', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { tier: 'Gold' } });
    const res = await listUsers({ sessionUserId: 'USER#001', query: {} });
    expect(res.statusCode).toBe(403);
  });
  test('returns user rows with tier and score', async () => {
    adminMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { userId: 'USER#001', username: 'user001', tier: 'Gold', loyaltyScore: 510 },
        { userId: 'USER#002', username: 'user002', tier: 'Platinum', loyaltyScore: 520 },
      ],
    });
    const res = await listUsers({ sessionUserId: 'USER#ADMIN001', query: {} });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.users).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement**

Append to `apps/backend/src/admin.js`:

```js
async function listUsers({ sessionUserId, query }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');
  const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 100)));
  const r = await ddb.send(new ScanCommand({ TableName: CFG.tUserProfile, Limit: limit }));
  const users = (r.Items ?? []).map((u) => ({
    userId: u.userId,
    username: u.username,
    tier: u.tier,
    loyaltyScore: u.loyaltyScore ?? 0,
  }));
  return json(200, { correlationId: '', data: { users } });
}
```

Update `module.exports`. Run jest. Expect PASS.

- [ ] **Step 3: Wire route**

```js
const { listDecisions, metrics, releaseHold, listUsers } = require('./admin');
```

```js
if (method === 'GET' && p === '/admin/users') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return listUsers({ sessionUserId, query: event.queryStringParameters ?? {} });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /admin/users endpoint"
```

---

## Task 7: GET /user/profile-completeness (TDD + wire route)

UC3 backing endpoint. Returns the user's completion percentage and the missing fields the frontend can prompt for.

- [ ] **Step 1: Failing test (append)**

```js
const { profileCompleteness } = require('../src/admin');

describe('profileCompleteness', () => {
  test('returns missing fields and completion percent', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        userId: 'USER#001',
        username: 'user001',
        email: 'user001@example.com',
        phone: '',
        emailVerified: true,
        phoneVerified: false,
        profileCompletion: 0.45,
      },
    });
    const res = await profileCompleteness({ userId: 'USER#001' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body).data;
    expect(body.userId).toBe('USER#001');
    expect(body.percent).toBeGreaterThan(0);
    expect(body.missingFields).toContain('phone');
    expect(body.missingFields).toContain('phoneVerified');
  });
  test('404 when user does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const res = await profileCompleteness({ userId: 'USER#missing' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Implement**

Append to `apps/backend/src/admin.js`:

```js
const TRACKED_FIELDS = ['email', 'phone', 'emailVerified', 'phoneVerified', 'preferences', 'travelPreferences'];

async function profileCompleteness({ userId }) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserProfile, Key: { userId } }));
  if (!r.Item) return err(404, 'USER_NOT_FOUND', `No user with id ${userId}`);
  const u = r.Item;
  const missing = TRACKED_FIELDS.filter((f) => {
    const v = u[f];
    if (typeof v === 'boolean') return v === false;
    if (typeof v === 'string') return v.trim() === '';
    return v === undefined || v === null;
  });
  const percent = Math.round(((TRACKED_FIELDS.length - missing.length) / TRACKED_FIELDS.length) * 100);
  return json(200, {
    correlationId: '',
    data: {
      userId,
      percent,
      missingFields: missing,
      score: u.profileCompletion ?? null,
    },
  });
}
```

Update `module.exports`. Run jest. Expect PASS.

- [ ] **Step 3: Wire route**

```js
const { listDecisions, metrics, releaseHold, listUsers, profileCompleteness } = require('./admin');
```

```js
if (method === 'GET' && p === '/user/profile-completeness') {
  const userId = qparam(event, 'userId');
  return profileCompleteness({ userId });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /user/profile-completeness for UC3"
```

---

## Task 8: Tune transfer-abuse thresholds to MEDIUM-then-HIGH (UC2)

Per the meeting: first transfer scores MEDIUM, repeated within an hour escalates to HIGH. Today the handler only writes a HIGH decision once `transferCount1h >= 4`. We want a MEDIUM at >= 2 and the HIGH path unchanged.

**Files:**
- Modify: `apps/backend/src/handler.js` (the `transfer` function block around the `tc1h >= 4` check)

- [ ] **Step 1: Locate the existing escalation**

Read `apps/backend/src/handler.js` and find the block in `async function transfer` starting around `if (tc1h >= 4)` (the FRAUD_TRANSFER decision write).

- [ ] **Step 2: Add a MEDIUM branch above the HIGH branch**

Before the existing `if (tc1h >= 4)` block, insert:

```js
if (tc1h === 2 || tc1h === 3) {
  await putDecision(
    decision(
      userId,
      'FRAUD_TRANSFER',
      0.6,
      'MEDIUM',
      'REVIEW',
      'ELEVATED_VELOCITY',
      'Elevated transfer velocity for this user',
      'EARN_REDEEM',
      correlationId
    )
  );
}
```

The HIGH branch (`tc1h >= 4`) stays as-is. This gives the admin feed a MEDIUM amber card on the second transfer and the existing red HELD card on the fifth.

- [ ] **Step 3: Verify by smoke (after Task 9 deploys)**

Recorded as part of Task 9 smoke checklist.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/handler.js
git commit -m "feat(backend): tune transfer abuse to MEDIUM-then-HIGH escalation"
```

---

## Task 9: Deploy and smoke-test all five new endpoints

**Files:** none

- [ ] **Step 1: Bundle and update Lambda**

From repo root:

```bash
cd apps/backend && rm -f /tmp/sf-handler.zip && \
  zip -q -r /tmp/sf-handler.zip src/handler.js src/admin.js && \
  aws lambda update-function-code \
    --function-name signal-force-runtime-ApiLambda91D2282D-tv45G7vAnQvP \
    --zip-file fileb:///tmp/sf-handler.zip \
    --region us-east-1 \
    --output text --query 'LastUpdateStatus'
```

Expect `InProgress`.

- [ ] **Step 2: Wait for deploy**

```bash
until aws lambda get-function-configuration \
  --function-name signal-force-runtime-ApiLambda91D2282D-tv45G7vAnQvP \
  --region us-east-1 --query 'LastUpdateStatus' --output text | grep -q Successful; do sleep 1; done && echo READY
```

- [ ] **Step 3: Smoke each endpoint**

```bash
API=https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com

curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/decisions?window=1h&limit=5" | jq '.data.decisions | length'

curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/metrics?window=1h" | jq

curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/users?limit=5" | jq '.data.users | length'

curl -sS -u demoClient:demoSecret \
  "$API/user/profile-completeness?userId=USER%23001" | jq

# Non-admin gets 403 on every admin endpoint
curl -sS -w '\nHTTP %{http_code}\n' -u demoClient:demoSecret -H 'X-User-Id: USER#001' \
  "$API/admin/decisions?window=1h" | tail -1
```

Expected: first four return 200 JSON, last returns `HTTP 403`.

- [ ] **Step 4: Walk the three demo use cases via curl**

```bash
# UC1: login + impossible-travel second login triggers LOGIN_GEO decision
curl -sS -u demoClient:demoSecret -H 'Content-Type: application/json' \
  -X POST "$API/auth/login" \
  -d '{"username":"user001","password":"Password1","location":"New York","deviceId":"d1"}' | jq
# Wait < 5 minutes, then login from far-away location
curl -sS -u demoClient:demoSecret -H 'Content-Type: application/json' \
  -X POST "$API/auth/login" \
  -d '{"username":"user001","password":"Password1","location":"Singapore","deviceId":"d2"}' | jq
# Admin feed should now contain a LOGIN_GEO decision
curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/decisions?window=5m" | jq '.data.decisions[] | {type, severity, reason}'

# UC2: 5 rapid transfers escalating to HIGH (HELD). Run quickly.
for i in 1 2 3 4 5; do
  curl -sS -u demoClient:demoSecret -H 'Content-Type: application/json' \
    -X POST "$API/transactions/transfer" \
    -d '{"userId":"USER#001","recipientId":"USER#002","amount":500}' | jq -c '.data // .error'
done
# Expect at least one MEDIUM (REVIEW) decision after transfer 2, HIGH (BLOCK) after transfer 5.

# UC3: profile completeness
curl -sS -u demoClient:demoSecret \
  "$API/user/profile-completeness?userId=USER%23001" | jq
```

Expected:
- UC1: admin feed shows a `LOGIN_GEO` entry with severity at least MEDIUM.
- UC2: admin feed shows a MEDIUM `ELEVATED_VELOCITY` and a HIGH `FRAUD_TRANSFER` (BLOCK). `UserState.isBlocked = true` for `USER#001`.
- UC3: returns `{percent, missingFields, score}` shape Julia can render.

- [ ] **Step 5: If anything failed, tail logs**

```bash
aws logs tail signal-force-runtime-ApiLambdaLogGroup3846CFFB-sSgrJbYDLaiR \
  --since 2m --region us-east-1 | tail -60
```

Fix and re-run Step 1. No commit needed; deploy is out of tree.

---

## Task 10: Publish API contract doc Julia consumes

**Files:**
- Modify: `docs/api-quickstart.md`

- [ ] **Step 1: Append the five new endpoints**

Add a new section to `docs/api-quickstart.md` (after the existing route docs, before "Postman setup tips"):

```markdown
## Admin endpoints (require admin session)

All admin endpoints require the `X-User-Id` header set to the active admin session's userId (`USER#ADMIN001` for the demo). Non-admin sessions get HTTP 403.

### GET /admin/decisions

Query params: `window` (5m / 1h / 24h, default 1h), `type` (FRAUD_TRANSFER / OFFER / NUDGE / DECISION_RELEASE), `userId`, `limit` (default 50, max 200).

```bash
curl -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/decisions?window=1h&limit=20'
```

Returns `{ data: { decisions: [...], window } }`. Each decision has `decisionId`, `userId`, `timestamp`, `type`, `action`, `severity`, `reason`.

### GET /admin/metrics

Query param: `window` (5m / 1h / 24h, default 1h).

```bash
curl -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/metrics?window=1h'
```

Returns `{ data: { window, decisionsCount, heldCount, offersShown, offersConverted, nudgesSent, nudgesDismissed, bedrockLatencyP95Ms } }`. `bedrockLatencyP95Ms` is `null` until CloudWatch metric ingest is wired post-event.

### POST /admin/decisions/{decisionId}/release

```bash
curl -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' -X POST \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/decisions/DEC%23abc12345/release'
```

Writes a new `DECISION_RELEASE` row referencing the original and clears `UserState.isBlocked`. Returns the new decision.

### GET /admin/users

```bash
curl -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/admin/users?limit=50'
```

Returns `{ data: { users: [{userId, username, tier, loyaltyScore}] } }`.

## User endpoints used by Julia's screens

### GET /user/profile-completeness?userId=...

Returns `{ data: { userId, percent, missingFields, score } }` where `percent` is 0-100 and `missingFields` is an array of field names the user has not filled. Use this in the profile-completeness nudge card.

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/user/profile-completeness?userId=USER%23001'
```
```

- [ ] **Step 2: Add a short "demo use cases" subsection**

Append to `docs/api-quickstart.md`:

```markdown
## Demo use cases (verified end-to-end on 2026-05-20)

1. **Suspicious login (geo-velocity)**: `POST /auth/login` from a distant location within 10 minutes of a previous login writes a decision visible on `GET /admin/decisions?window=5m`. Use locations `New York` then `Singapore` for the demo.
2. **Points transfer abuse**: 5 rapid `POST /transactions/transfer` calls from the same sender escalate from ALLOW → MEDIUM REVIEW (transfer 2) → HIGH BLOCK + HELD (transfer 5). Admin can clear with `POST /admin/decisions/{id}/release`.
3. **Profile completeness**: `GET /user/profile-completeness?userId=USER%23001` returns the percent + missing fields. Update a missing field via the existing user-update path (TBD: this is an endpoint Julia may need; if she does, file an issue and we add it).
```

- [ ] **Step 3: Commit**

```bash
git add docs/api-quickstart.md
git commit -m "docs(api): document admin endpoints and profile-completeness for fe lane"
```

---

## Task 11: Open PR, merge, hand off

**Files:** none

- [ ] **Step 1: Final test pass**

```bash
cd apps/backend && npm test
cd ../../infra/cdk && npm test
```

Both should be green.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/infra-admin-and-uc-support
gh pr create \
  --title "feat(infra): admin endpoints and demo use case support" \
  --body-file docs/superpowers/specs/2026-05-20-admin-and-signal-ui-design.md
```

- [ ] **Step 3: Merge when hooks pass**

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull --ff-only
```

- [ ] **Step 4: Ping Julia in the team channel**

> "Backend ready for the three demo use cases. New endpoints documented in `docs/api-quickstart.md` (Admin section + GET /user/profile-completeness). API URL unchanged. Seeded admin user is `admin001` / `AdminPass1`. Let me know if your screens need any field that is not on the response shapes."

No code, just the message. End of plan.

---

## Out of scope (for the frontend lane to own)

- `apps/frontend/**` of any kind.
- Component-level styling, accessibility, animations.
- Login form fields beyond what backend already accepts.
- MFA page risk-message UI (the backend already writes the `LOGIN_GEO` decision; Julia reads it).

## Risks

- **Concurrent edits to `handler.js`.** Julia may not need to touch it but the AI Studio output sometimes generates server stubs. Coordinate before either lane touches it after this plan lands.
- **API contract drift.** Any new shape the frontend needs must be added here and reflected in `docs/api-quickstart.md` in the same PR. No silent additions.
- **Polling cost.** If both customer and admin frontends short-poll at 3s, expect ~30k Lambda invocations / 24h with two open tabs. Still well under the $80 kill switch. Flag if continuous demo run exceeds 6h.
