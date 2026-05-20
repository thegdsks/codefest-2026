# Admin Console and Customer Signal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a customer-side ambient "Signal" assistant plus inline banners and a `/admin` console with KPI tiles, decision feed, drill-down, and a Release-hold write action, so the suspicious-transfer demo loop closes end to end.

**Architecture:** One Vite + React + TS bundle, three routes (`/login`, `/dashboard`, `/admin`). Admin gated by `tier=ADMIN` on the session owner's profile, enforced on every admin endpoint. Backend adds three admin endpoints to the existing single-handler Lambda. Customer and admin surfaces both short-poll the API (3s focused, 15s blurred). No new tables, no new infra; reuses `DecisionStore` (GSI `userId-timestamp-index`), `UserProfile`, `UserState`.

**Tech Stack:** Node 18 Lambda + DynamoDB on the backend. React 18 + Vite + Tailwind + Lucide on the frontend. Jest with mocked AWS SDK clients for backend tests. Vitest + React Testing Library for frontend tests.

**Spec:** `docs/superpowers/specs/2026-05-20-admin-and-signal-ui-design.md`

**Wireframes:** `docs/wireframes/2026-05-20-customer-admin-side-by-side-v1.png`, `docs/wireframes/2026-05-20-admin-hierarchy-v2.png`

---

## File Map

**Backend (`apps/backend`)**

- Modify `src/handler.js`: add `isAdmin(profile)` helper, three admin route handlers, route table entries.
- Create `src/admin.js`: extract `listDecisions`, `metrics`, `releaseHold` handlers (handler.js will grow > 800 lines otherwise; keep it under 500 per CLAUDE.md).
- Create `tests/admin.test.js`: unit tests against the new admin handlers with the AWS SDK client mocked.
- Create `jest.config.js`: minimal jest config for the backend workspace.
- Modify `package.json`: add jest + aws-sdk-client-mock devDeps and a `test` script.
- Modify `seed_data/UserProfile_batch_2.json`: append the admin user.

**Frontend (`apps/frontend`)**

- Create `src/lib/useDecisionStream.ts`: poll hook with visibility-aware cadence.
- Create `src/lib/adminApi.ts`: typed wrappers for the three admin endpoints.
- Create `src/lib/sessionStore.ts`: holds the current session id + user profile in module state; read by route guards.
- Create `src/lib/types.ts` additions: `Decision`, `Metrics`, `AdminProfile` types (append, don't replace existing).
- Create `src/components/SignalCard.tsx`: bottom-right ambient assistant.
- Create `src/components/InlineBanner.tsx`: contextual banner with `type` prop.
- Create `src/components/RoleGate.tsx`: route wrapper that checks admin tier.
- Create `src/pages/Admin.tsx`: composes the admin layout.
- Create `src/pages/admin/AdminHeader.tsx`: top header strip with search.
- Create `src/pages/admin/KpiStrip.tsx`: 5 KPI tiles.
- Create `src/pages/admin/EntityTabs.tsx`: Decisions / Users tabs.
- Create `src/pages/admin/FilterChips.tsx`: type filters + time window.
- Create `src/pages/admin/DecisionFeed.tsx`: scrolling feed list.
- Create `src/pages/admin/DecisionDetail.tsx`: drill-down with Release hold action.
- Create `src/pages/admin/UsersTab.tsx`: read-only user list.
- Modify `src/App.tsx`: add `/admin` route wrapped in `<RoleGate role="ADMIN">`.
- Modify `src/components/Layout.tsx`: render `<SignalCard />` on customer routes only.
- Modify `src/pages/Dashboard.tsx`: use `useDecisionStream`; render `<InlineBanner />` when the latest decision is HELD.
- Modify `src/pages/Login.tsx`: store the session id + profile in `sessionStore` on success.
- Create `vitest.config.ts`: minimal vitest config.
- Create `src/test/setup.ts`: jest-dom + global mocks for `import.meta.env`.
- Create `src/**/__tests__/*.test.tsx`: one test file per non-trivial component / hook.
- Modify `package.json`: add vitest + testing-library devDeps and a `test` script.

---

## Task 1: Backend test scaffold and admin user seed

**Files:**
- Modify: `apps/backend/package.json`
- Create: `apps/backend/jest.config.js`
- Modify: `seed_data/UserProfile_batch_2.json`

- [ ] **Step 1: Add jest and aws-sdk-client-mock**

Edit `apps/backend/package.json` and add to `devDependencies`:

```json
"jest": "^29.7.0",
"aws-sdk-client-mock": "^4.0.0"
```

Add to `scripts`:

```json
"test": "jest --colors"
```

Run from repo root: `npm install` (workspaces).

- [ ] **Step 2: Create jest config**

Write `apps/backend/jest.config.js`:

```js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
};
```

- [ ] **Step 3: Verify jest runs**

Run: `cd apps/backend && npm test`
Expected: "No tests found" exit 1, but jest itself executes (proves install). That is acceptable for this step.

- [ ] **Step 4: Seed the admin user**

Edit `seed_data/UserProfile_batch_2.json`. Append one more `PutRequest` inside the existing array, matching the existing schema. Use this object exactly:

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

- [ ] **Step 5: Load the admin user into the live DDB table**

From repo root:

```bash
aws dynamodb batch-write-item \
  --request-items file://seed_data/UserProfile_batch_2.json \
  --region us-east-1
```

Verify:

```bash
aws dynamodb get-item --table-name UserProfile \
  --key '{"userId":{"S":"USER#ADMIN001"}}' --region us-east-1
```

Expected: returns the admin row.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json apps/backend/jest.config.js \
        seed_data/UserProfile_batch_2.json package-lock.json
git commit -m "test(backend): add jest harness and seed admin user"
```

---

## Task 2: Backend isAdmin auth helper (TDD)

**Files:**
- Create: `apps/backend/tests/admin.test.js`
- Create: `apps/backend/src/admin.js`
- Modify: `apps/backend/src/handler.js`

- [ ] **Step 1: Write the failing test**

Write `apps/backend/tests/admin.test.js`:

```js
const { isAdmin } = require('../src/admin');

describe('isAdmin', () => {
  test('returns true when tier is ADMIN', () => {
    expect(isAdmin({ tier: 'ADMIN' })).toBe(true);
  });
  test('returns false when tier is Gold', () => {
    expect(isAdmin({ tier: 'Gold' })).toBe(false);
  });
  test('returns false when profile is null', () => {
    expect(isAdmin(null)).toBe(false);
  });
  test('returns false when profile has no tier', () => {
    expect(isAdmin({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: FAIL with "Cannot find module '../src/admin'".

- [ ] **Step 3: Implement isAdmin**

Write `apps/backend/src/admin.js`:

```js
function isAdmin(profile) {
  return Boolean(profile && profile.tier === 'ADMIN');
}

module.exports = { isAdmin };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add isAdmin helper for tier check"
```

---

## Task 3: Backend GET /admin/decisions endpoint (TDD)

**Files:**
- Modify: `apps/backend/tests/admin.test.js`
- Modify: `apps/backend/src/admin.js`
- Modify: `apps/backend/src/handler.js`

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/tests/admin.test.js`:

```js
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { listDecisions } = require('../src/admin');

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

function adminProfileMock() {
  ddbMock.on(GetCommand).resolves({ Item: { userId: 'USER#ADMIN001', tier: 'ADMIN' } });
}

describe('listDecisions', () => {
  test('rejects non-admin with 403', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { userId: 'USER#001', tier: 'Gold' } });
    const res = await listDecisions({
      sessionUserId: 'USER#001',
      query: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  test('returns decisions sorted newest first, capped by limit', async () => {
    adminProfileMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { decisionId: 'D1', timestamp: 100, type: 'FRAUD_TRANSFER', severity: 'HIGH' },
        { decisionId: 'D2', timestamp: 300, type: 'OFFER', severity: 'LOW' },
        { decisionId: 'D3', timestamp: 200, type: 'NUDGE', severity: 'LOW' },
      ],
    });
    const res = await listDecisions({
      sessionUserId: 'USER#ADMIN001',
      query: { window: '1h', limit: '2' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.decisions.map((d) => d.decisionId)).toEqual(['D2', 'D3']);
  });

  test('filters by type when type query is set', async () => {
    adminProfileMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { decisionId: 'D1', timestamp: 100, type: 'FRAUD_TRANSFER', severity: 'HIGH' },
        { decisionId: 'D2', timestamp: 200, type: 'OFFER', severity: 'LOW' },
      ],
    });
    const res = await listDecisions({
      sessionUserId: 'USER#ADMIN001',
      query: { type: 'FRAUD_TRANSFER' },
    });
    const body = JSON.parse(res.body);
    expect(body.data.decisions).toHaveLength(1);
    expect(body.data.decisions[0].type).toBe('FRAUD_TRANSFER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: FAIL with "listDecisions is not a function".

- [ ] **Step 3: Implement listDecisions**

Edit `apps/backend/src/admin.js` to be:

```js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CFG = {
  tUserProfile: process.env.TABLE_USER_PROFILE || 'UserProfile',
  tDecision: process.env.TABLE_DECISION_STORE || 'DecisionStore',
  tUserState: process.env.TABLE_USER_STATE || 'UserState',
};

const WINDOW_SECONDS = { '5m': 300, '1h': 3600, '24h': 86400 };

function isAdmin(profile) {
  return Boolean(profile && profile.tier === 'ADMIN');
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function err(statusCode, code, message) {
  return json(statusCode, { correlationId: '', error: { code, message } });
}

async function requireAdmin(sessionUserId) {
  const r = await ddb.send(new GetCommand({ TableName: CFG.tUserProfile, Key: { userId: sessionUserId } }));
  return isAdmin(r.Item) ? r.Item : null;
}

async function listDecisions({ sessionUserId, query }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');

  const windowKey = query?.window ?? '1h';
  const windowSec = WINDOW_SECONDS[windowKey] ?? 3600;
  const cutoff = Math.floor(Date.now() / 1000) - windowSec;
  const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50)));
  const typeFilter = query?.type;
  const userFilter = query?.userId;

  const r = await ddb.send(
    new ScanCommand({
      TableName: CFG.tDecision,
      FilterExpression: '#ts >= :cutoff',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':cutoff': cutoff },
    })
  );

  let items = r.Items ?? [];
  if (typeFilter) items = items.filter((it) => it.type === typeFilter);
  if (userFilter) items = items.filter((it) => it.userId === userFilter);
  items.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  items = items.slice(0, limit);

  return json(200, { correlationId: '', data: { decisions: items, window: windowKey } });
}

module.exports = { isAdmin, requireAdmin, listDecisions, json, err };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire route into handler.js**

Edit `apps/backend/src/handler.js`. Near the top, add the import:

```js
const { listDecisions } = require('./admin');
```

Add the route in `async function route(event, correlationId)` next to the existing route table (after the existing route lines, before the 404 fallback):

```js
if (method === 'GET' && p === '/admin/decisions') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return listDecisions({
    sessionUserId,
    query: event.queryStringParameters ?? {},
  });
}
```

Note: the demo passes `X-User-Id` as a simple session marker until proper session-token plumbing is added (out of scope, see spec Open Questions).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /admin/decisions with admin gate"
```

---

## Task 4: Backend GET /admin/metrics endpoint (TDD)

**Files:**
- Modify: `apps/backend/tests/admin.test.js`
- Modify: `apps/backend/src/admin.js`
- Modify: `apps/backend/src/handler.js`

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/tests/admin.test.js`:

```js
const { metrics } = require('../src/admin');

describe('metrics', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { userId: 'USER#001', tier: 'Gold' } });
    const res = await metrics({ sessionUserId: 'USER#001', query: {} });
    expect(res.statusCode).toBe(403);
  });

  test('aggregates counts by type and severity', async () => {
    adminProfileMock();
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { decisionId: 'D1', timestamp: 100, type: 'FRAUD_TRANSFER', severity: 'HIGH', action: 'BLOCK' },
        { decisionId: 'D2', timestamp: 110, type: 'FRAUD_TRANSFER', severity: 'HIGH', action: 'BLOCK' },
        { decisionId: 'D3', timestamp: 120, type: 'OFFER', severity: 'LOW', action: 'SHOW' },
        { decisionId: 'D4', timestamp: 130, type: 'OFFER', severity: 'LOW', action: 'CONVERT' },
        { decisionId: 'D5', timestamp: 140, type: 'NUDGE', severity: 'LOW', action: 'SHOW' },
        { decisionId: 'D6', timestamp: 150, type: 'NUDGE', severity: 'LOW', action: 'DISMISS' },
      ],
    });
    const res = await metrics({ sessionUserId: 'USER#ADMIN001', query: { window: '1h' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual({
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

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: FAIL on `metrics is not a function`.

- [ ] **Step 3: Implement metrics**

Append to `apps/backend/src/admin.js` before `module.exports`:

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

  const counts = {
    decisionsCount: items.length,
    heldCount: items.filter((it) => it.action === 'BLOCK').length,
    offersShown: items.filter((it) => it.type === 'OFFER').length,
    offersConverted: items.filter((it) => it.type === 'OFFER' && it.action === 'CONVERT').length,
    nudgesSent: items.filter((it) => it.type === 'NUDGE').length,
    nudgesDismissed: items.filter((it) => it.type === 'NUDGE' && it.action === 'DISMISS').length,
  };

  return json(200, {
    correlationId: '',
    data: {
      window: windowKey,
      ...counts,
      bedrockLatencyP95Ms: null,
    },
  });
}
```

Add to the `module.exports` line:

```js
module.exports = { isAdmin, requireAdmin, listDecisions, metrics, json, err };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Wire route**

In `apps/backend/src/handler.js`, change the `./admin` import to:

```js
const { listDecisions, metrics } = require('./admin');
```

Add the route:

```js
if (method === 'GET' && p === '/admin/metrics') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return metrics({ sessionUserId, query: event.queryStringParameters ?? {} });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add GET /admin/metrics aggregation endpoint"
```

---

## Task 5: Backend POST /admin/decisions/{id}/release (TDD)

**Files:**
- Modify: `apps/backend/tests/admin.test.js`
- Modify: `apps/backend/src/admin.js`
- Modify: `apps/backend/src/handler.js`

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/tests/admin.test.js`:

```js
const { releaseHold } = require('../src/admin');
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

describe('releaseHold', () => {
  test('rejects non-admin', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { tier: 'Gold' } });
    const res = await releaseHold({
      sessionUserId: 'USER#001',
      decisionId: 'DEC#abc',
    });
    expect(res.statusCode).toBe(403);
  });

  test('returns 404 if the decision does not exist', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'UserProfile', Key: { userId: 'USER#ADMIN001' } })
      .resolves({ Item: { tier: 'ADMIN' } })
      .on(GetCommand, { TableName: 'DecisionStore', Key: { decisionId: 'DEC#missing' } })
      .resolves({ Item: undefined });
    const res = await releaseHold({
      sessionUserId: 'USER#ADMIN001',
      decisionId: 'DEC#missing',
    });
    expect(res.statusCode).toBe(404);
  });

  test('writes a DECISION_RELEASE row and unblocks the user', async () => {
    ddbMock
      .on(GetCommand, { TableName: 'UserProfile', Key: { userId: 'USER#ADMIN001' } })
      .resolves({ Item: { tier: 'ADMIN' } })
      .on(GetCommand, { TableName: 'DecisionStore', Key: { decisionId: 'DEC#abc' } })
      .resolves({ Item: { decisionId: 'DEC#abc', userId: 'USER#001', type: 'FRAUD_TRANSFER', action: 'BLOCK' } })
      .on(PutCommand)
      .resolves({})
      .on(UpdateCommand)
      .resolves({});

    const res = await releaseHold({
      sessionUserId: 'USER#ADMIN001',
      decisionId: 'DEC#abc',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.decision.type).toBe('DECISION_RELEASE');
    expect(body.data.decision.parentDecisionId).toBe('DEC#abc');
    expect(body.data.decision.userId).toBe('USER#001');

    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input.Item.action).toBe('ALLOW');

    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].args[0].input.TableName).toBe('UserState');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: FAIL on `releaseHold is not a function`.

- [ ] **Step 3: Implement releaseHold**

Append to `apps/backend/src/admin.js` before `module.exports`:

```js
const { randomUUID } = require('node:crypto');

async function releaseHold({ sessionUserId, decisionId }) {
  const admin = await requireAdmin(sessionUserId);
  if (!admin) return err(403, 'FORBIDDEN', 'Admin role required');

  const original = await ddb.send(new GetCommand({ TableName: CFG.tDecision, Key: { decisionId } }));
  if (!original.Item) return err(404, 'DECISION_NOT_FOUND', `No decision with id ${decisionId}`);

  const now = Math.floor(Date.now() / 1000);
  const releaseDecision = {
    decisionId: `DEC#${randomUUID().slice(0, 8)}`,
    parentDecisionId: decisionId,
    userId: original.Item.userId,
    timestamp: now,
    type: 'DECISION_RELEASE',
    action: 'ALLOW',
    severity: 'LOW',
    reason: 'Manual release by admin',
    releasedBy: sessionUserId,
  };

  await ddb.send(new PutCommand({ TableName: CFG.tDecision, Item: releaseDecision }));

  await ddb.send(
    new UpdateCommand({
      TableName: CFG.tUserState,
      Key: { userId: original.Item.userId },
      UpdateExpression: 'SET isBlocked = :f, updatedAt = :u',
      ExpressionAttributeValues: { ':f': false, ':u': now },
    })
  );

  return json(200, { correlationId: '', data: { decision: releaseDecision } });
}
```

Update the `module.exports`:

```js
module.exports = { isAdmin, requireAdmin, listDecisions, metrics, releaseHold, json, err };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/backend && npx jest tests/admin.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Wire route**

Update `apps/backend/src/handler.js` import:

```js
const { listDecisions, metrics, releaseHold } = require('./admin');
```

Add the route. The path is `/admin/decisions/{decisionId}/release` so we match by prefix:

```js
if (method === 'POST' && p.startsWith('/admin/decisions/') && p.endsWith('/release')) {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  const decisionId = decodeURIComponent(p.slice('/admin/decisions/'.length, -'/release'.length));
  return releaseHold({ sessionUserId, decisionId });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/admin.js apps/backend/src/handler.js apps/backend/tests/admin.test.js
git commit -m "feat(backend): add POST /admin/decisions/{id}/release"
```

---

## Task 6: Deploy backend and smoke test the three endpoints

**Files:** (no source changes)

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

Expected output: `InProgress`.

- [ ] **Step 2: Wait for the deploy**

```bash
until aws lambda get-function-configuration \
  --function-name signal-force-runtime-ApiLambda91D2282D-tv45G7vAnQvP \
  --region us-east-1 --query 'LastUpdateStatus' --output text \
  | grep -q Successful; do sleep 1; done && echo READY
```

Expected: `READY`.

- [ ] **Step 3: Smoke test the three endpoints**

```bash
API=https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com

# GET /admin/decisions as admin
curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/decisions?window=1h&limit=10" | jq '.data.decisions | length'

# GET /admin/metrics as admin
curl -sS -u demoClient:demoSecret -H 'X-User-Id: USER#ADMIN001' \
  "$API/admin/metrics?window=1h" | jq

# Non-admin gets 403
curl -sS -w '\nHTTP %{http_code}\n' \
  -u demoClient:demoSecret -H 'X-User-Id: USER#001' \
  "$API/admin/decisions?window=1h"
```

Expected: first two return 200 JSON, third returns HTTP 403.

- [ ] **Step 4: Commit nothing (deploy is out-of-tree)**

No commit. If anything broke, tail logs:

```bash
aws logs tail signal-force-runtime-ApiLambdaLogGroup3846CFFB-sSgrJbYDLaiR \
  --since 2m --region us-east-1 | tail -40
```

Fix and redeploy via Step 1 before moving on.

---

## Task 7: Frontend test scaffold (vitest + RTL)

**Files:**
- Modify: `apps/frontend/package.json`
- Create: `apps/frontend/vitest.config.ts`
- Create: `apps/frontend/src/test/setup.ts`

- [ ] **Step 1: Add devDeps**

Edit `apps/frontend/package.json`. Add to `devDependencies`:

```json
"vitest": "^2.1.1",
"@vitest/ui": "^2.1.1",
"@testing-library/react": "^16.0.1",
"@testing-library/jest-dom": "^6.5.0",
"@testing-library/user-event": "^14.5.2",
"jsdom": "^25.0.0"
```

Add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Run from repo root: `npm install`.

- [ ] **Step 2: Create vitest config**

Write `apps/frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 3: Create test setup**

Write `apps/frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Verify vitest runs**

Run: `cd apps/frontend && npm test`
Expected: "No test files found" exit code is acceptable; the runner itself executes.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vitest.config.ts \
        apps/frontend/src/test/setup.ts package-lock.json
git commit -m "test(frontend): add vitest + react testing library harness"
```

---

## Task 8: sessionStore + Login captures user profile

**Files:**
- Create: `apps/frontend/src/lib/sessionStore.ts`
- Create: `apps/frontend/src/lib/__tests__/sessionStore.test.ts`
- Modify: `apps/frontend/src/lib/types.ts`
- Modify: `apps/frontend/src/pages/Login.tsx`

- [ ] **Step 1: Add session and profile types**

Append to `apps/frontend/src/lib/types.ts`:

```ts
export type AdminProfile = {
  userId: string;
  username: string;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'ADMIN';
  sessionId: string;
};
```

- [ ] **Step 2: Write the failing test**

Write `apps/frontend/src/lib/__tests__/sessionStore.test.ts`:

```ts
import { describe, test, expect, beforeEach } from 'vitest';
import { sessionStore } from '../sessionStore';

describe('sessionStore', () => {
  beforeEach(() => sessionStore.clear());

  test('starts empty', () => {
    expect(sessionStore.get()).toBeNull();
  });

  test('set then get returns the same profile', () => {
    const profile = { userId: 'USER#001', username: 'user001', tier: 'Gold' as const, sessionId: 'S#1' };
    sessionStore.set(profile);
    expect(sessionStore.get()).toEqual(profile);
  });

  test('clear empties the store', () => {
    sessionStore.set({ userId: 'X', username: 'x', tier: 'Gold', sessionId: 'S' });
    sessionStore.clear();
    expect(sessionStore.get()).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `cd apps/frontend && npm test sessionStore`
Expected: FAIL on missing import.

- [ ] **Step 4: Implement sessionStore**

Write `apps/frontend/src/lib/sessionStore.ts`:

```ts
import type { AdminProfile } from './types';

let current: AdminProfile | null = null;
const subscribers = new Set<() => void>();

export const sessionStore = {
  get(): AdminProfile | null {
    return current;
  },
  set(profile: AdminProfile): void {
    current = profile;
    subscribers.forEach((fn) => fn());
  },
  clear(): void {
    current = null;
    subscribers.forEach((fn) => fn());
  },
  subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/frontend && npm test sessionStore`
Expected: PASS, 3 tests.

- [ ] **Step 6: Wire into Login**

Read `apps/frontend/src/pages/Login.tsx` and identify the success branch (after MFA verify succeeds). Replace the success block so it also calls `sessionStore.set(...)` with the returned userId, the form's username, and the tier from the login response (or fall back to fetching `/user/profile?userId=...` if tier is not in the login response). Add the import:

```ts
import { sessionStore } from '../lib/sessionStore';
```

Inside the success branch after MFA verify succeeds, add:

```ts
sessionStore.set({
  userId: loginData.userId,
  username: form.username,
  tier: profileTier,
  sessionId: loginData.sessionId,
});
```

If `profileTier` is not directly returned, fetch it once:

```ts
const profileRes = await apiFetch<{ tier: AdminProfile['tier'] }>(
  `/user/profile?userId=${encodeURIComponent(loginData.userId)}`
);
const profileTier = profileRes.error === null ? profileRes.data.tier : 'Gold';
```

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/lib/sessionStore.ts \
        apps/frontend/src/lib/__tests__/sessionStore.test.ts \
        apps/frontend/src/lib/types.ts \
        apps/frontend/src/pages/Login.tsx
git commit -m "feat(frontend): add sessionStore and capture profile on login"
```

---

## Task 9: useDecisionStream hook (TDD)

**Files:**
- Create: `apps/frontend/src/lib/useDecisionStream.ts`
- Create: `apps/frontend/src/lib/__tests__/useDecisionStream.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/lib/__tests__/useDecisionStream.test.tsx`:

```tsx
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDecisionStream } from '../useDecisionStream';

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          correlationId: '',
          data: {
            user: { userId: 'USER#001', tier: 'Gold' },
            fraudStatus: { isBlocked: false, transferCount1h: 0, lastLoginLocation: 'NY' },
            offers: [],
            nudges: [{ nudgeId: 'NUDGE#PROFILE', message: 'Complete profile', reason: 'PROFILE_INCOMPLETE' }],
            recentActivity: [],
          },
        }),
    } as Response)
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useDecisionStream', () => {
  test('polls /dashboard immediately and exposes the response', async () => {
    const { result } = renderHook(() => useDecisionStream('USER#001'));
    await waitFor(() => expect(result.current.nudges).toHaveLength(1));
    expect(result.current.fraudStatus?.isBlocked).toBe(false);
  });

  test('polls again after the focused interval', async () => {
    renderHook(() => useDecisionStream('USER#001'));
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    const initialCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    vi.advanceTimersByTime(3000);
    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCalls)
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test useDecisionStream`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement the hook**

Write `apps/frontend/src/lib/useDecisionStream.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import type { DashboardResponse } from './types';

const FOCUSED_MS = 3000;
const BLURRED_MS = 15000;

type Snapshot = DashboardResponse | null;

export function useDecisionStream(userId: string | null): {
  data: Snapshot;
  fraudStatus: DashboardResponse['fraudStatus'] | null;
  offers: DashboardResponse['offers'];
  nudges: DashboardResponse['nudges'];
  recentActivity: DashboardResponse['recentActivity'];
  loading: boolean;
} {
  const [data, setData] = useState<Snapshot>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function tick(): Promise<void> {
      const res = await apiFetch<DashboardResponse>(
        `/dashboard?userId=${encodeURIComponent(userId as string)}`
      );
      if (cancelled) return;
      if (res.error === null) setData(res.data);
      setLoading(false);
      const next = document.visibilityState === 'visible' ? FOCUSED_MS : BLURRED_MS;
      timer.current = setTimeout(tick, next);
    }

    tick();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId]);

  return {
    data,
    fraudStatus: data?.fraudStatus ?? null,
    offers: data?.offers ?? [],
    nudges: data?.nudges ?? [],
    recentActivity: data?.recentActivity ?? [],
    loading,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test useDecisionStream`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/useDecisionStream.ts \
        apps/frontend/src/lib/__tests__/useDecisionStream.test.tsx
git commit -m "feat(frontend): add useDecisionStream polling hook"
```

---

## Task 10: SignalCard component

**Files:**
- Create: `apps/frontend/src/components/SignalCard.tsx`
- Create: `apps/frontend/src/components/__tests__/SignalCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/components/__tests__/SignalCard.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignalCard from '../SignalCard';

describe('SignalCard', () => {
  test('renders nothing when there are no signals', () => {
    const { container } = render(<SignalCard signals={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders the latest 3 signals newest first', () => {
    const signals = [
      { id: '1', timestamp: 100, headline: 'oldest' },
      { id: '2', timestamp: 200, headline: 'middle' },
      { id: '3', timestamp: 300, headline: 'newest' },
      { id: '4', timestamp: 400, headline: 'extra' },
    ];
    render(<SignalCard signals={signals} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('extra');
    expect(items[1]).toHaveTextContent('newest');
    expect(items[2]).toHaveTextContent('middle');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test SignalCard`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/components/SignalCard.tsx`:

```tsx
import { Sparkles } from 'lucide-react';

export type Signal = { id: string; timestamp: number; headline: string };

export default function SignalCard({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  const top = [...signals].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);

  return (
    <aside
      aria-label="Signal Force assistant"
      className="fixed right-4 bottom-4 w-64 rounded-xl bg-gray-900 text-gray-100 shadow-xl border border-gray-800 p-3"
    >
      <header className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles size={12} aria-hidden="true" />
          Signal
        </span>
        <span className="text-[10px] text-gray-400">live</span>
      </header>
      <ul className="text-xs text-gray-200 space-y-1.5">
        {top.map((s, i) => (
          <li
            key={s.id}
            className={i === 0 ? 'pb-1.5 border-b border-gray-800' : ''}
          >
            {s.headline}
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test SignalCard`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/SignalCard.tsx \
        apps/frontend/src/components/__tests__/SignalCard.test.tsx
git commit -m "feat(frontend): add SignalCard ambient assistant component"
```

---

## Task 11: InlineBanner component

**Files:**
- Create: `apps/frontend/src/components/InlineBanner.tsx`
- Create: `apps/frontend/src/components/__tests__/InlineBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/components/__tests__/InlineBanner.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InlineBanner from '../InlineBanner';

describe('InlineBanner', () => {
  test('HELD banner has role alert', () => {
    render(<InlineBanner type="HELD" title="Transfer paused" body="Unusual velocity" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Transfer paused/);
  });

  test('INFO banner has role status', () => {
    render(<InlineBanner type="INFO" title="Welcome" body="Glad you are back" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('APPROVED banner renders green styling token', () => {
    render(<InlineBanner type="APPROVED" title="Transfer approved" body="" />);
    const banner = screen.getByText(/Transfer approved/).closest('div');
    expect(banner?.className).toMatch(/emerald/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test InlineBanner`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/components/InlineBanner.tsx`:

```tsx
import type { ReactNode } from 'react';

type BannerType = 'HELD' | 'REVIEW' | 'APPROVED' | 'INFO';

const STYLE: Record<BannerType, string> = {
  HELD: 'bg-red-50 border-red-200 text-red-900',
  REVIEW: 'bg-amber-50 border-amber-200 text-amber-900',
  APPROVED: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  INFO: 'bg-white border-gray-200 text-gray-900',
};

export default function InlineBanner({
  type,
  title,
  body,
  children,
}: {
  type: BannerType;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
}) {
  const role = type === 'HELD' ? 'alert' : 'status';
  return (
    <div role={role} className={`${STYLE[type]} border rounded-md px-3 py-2 text-sm`}>
      <div className="font-semibold text-xs">{title}</div>
      {body ? <div className="text-xs mt-0.5">{body}</div> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test InlineBanner`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/InlineBanner.tsx \
        apps/frontend/src/components/__tests__/InlineBanner.test.tsx
git commit -m "feat(frontend): add InlineBanner contextual banner component"
```

---

## Task 12: RoleGate component + /admin route

**Files:**
- Create: `apps/frontend/src/components/RoleGate.tsx`
- Create: `apps/frontend/src/components/__tests__/RoleGate.test.tsx`
- Create: `apps/frontend/src/pages/Admin.tsx` (placeholder; filled in later tasks)
- Modify: `apps/frontend/src/App.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/components/__tests__/RoleGate.test.tsx`:

```tsx
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoleGate from '../RoleGate';
import { sessionStore } from '../../lib/sessionStore';

describe('RoleGate', () => {
  beforeEach(() => sessionStore.clear());

  test('renders fallback when not signed in', () => {
    render(
      <RoleGate role="ADMIN">
        <p>secret</p>
      </RoleGate>
    );
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  test('renders fallback for non-matching role', () => {
    sessionStore.set({ userId: 'USER#001', username: 'user001', tier: 'Gold', sessionId: 'S' });
    render(
      <RoleGate role="ADMIN">
        <p>secret</p>
      </RoleGate>
    );
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
  });

  test('renders children when role matches', () => {
    sessionStore.set({ userId: 'USER#ADMIN001', username: 'admin001', tier: 'ADMIN', sessionId: 'S' });
    render(
      <RoleGate role="ADMIN">
        <p>secret</p>
      </RoleGate>
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test RoleGate`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/components/RoleGate.tsx`:

```tsx
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { sessionStore } from '../lib/sessionStore';
import type { AdminProfile } from '../lib/types';

export default function RoleGate({
  role,
  children,
}: {
  role: AdminProfile['tier'];
  children: ReactNode;
}) {
  const profile = useSyncExternalStore(
    (cb) => sessionStore.subscribe(cb),
    () => sessionStore.get()
  );

  if (!profile) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white border border-gray-200 rounded-lg text-center">
        <p className="text-sm text-gray-700">Please sign in to continue.</p>
      </div>
    );
  }
  if (profile.tier !== role) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white border border-amber-200 rounded-lg text-center">
        <p className="text-sm text-amber-900">Admin access required for this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test RoleGate`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add placeholder Admin page and route**

Write `apps/frontend/src/pages/Admin.tsx`:

```tsx
export default function Admin() {
  return <div className="text-sm text-gray-500">Admin console loading...</div>;
}
```

Modify `apps/frontend/src/App.tsx`. Add imports:

```tsx
import Admin from './pages/Admin';
import RoleGate from './components/RoleGate';
```

Add the route inside the existing `<Route element={<Layout />}>` block:

```tsx
<Route
  path="/admin"
  element={
    <RoleGate role="ADMIN">
      <Admin />
    </RoleGate>
  }
/>
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/RoleGate.tsx \
        apps/frontend/src/components/__tests__/RoleGate.test.tsx \
        apps/frontend/src/pages/Admin.tsx \
        apps/frontend/src/App.tsx
git commit -m "feat(frontend): add RoleGate guard and /admin route placeholder"
```

---

## Task 13: adminApi typed wrappers (TDD)

**Files:**
- Create: `apps/frontend/src/lib/adminApi.ts`
- Create: `apps/frontend/src/lib/__tests__/adminApi.test.ts`
- Modify: `apps/frontend/src/lib/types.ts`

- [ ] **Step 1: Add types**

Append to `apps/frontend/src/lib/types.ts`:

```ts
export type Decision = {
  decisionId: string;
  parentDecisionId?: string;
  userId: string;
  timestamp: number;
  type: 'FRAUD_TRANSFER' | 'OFFER' | 'NUDGE' | 'DECISION_RELEASE' | string;
  action: string;
  severity: string;
  reason: string;
};

export type DecisionsResponse = {
  decisions: Decision[];
  window: '5m' | '1h' | '24h';
};

export type Metrics = {
  window: '5m' | '1h' | '24h';
  decisionsCount: number;
  heldCount: number;
  offersShown: number;
  offersConverted: number;
  nudgesSent: number;
  nudgesDismissed: number;
  bedrockLatencyP95Ms: number | null;
};
```

- [ ] **Step 2: Write the failing test**

Write `apps/frontend/src/lib/__tests__/adminApi.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDecisions, fetchMetrics, releaseHold } from '../adminApi';
import { sessionStore } from '../sessionStore';

beforeEach(() => {
  sessionStore.set({ userId: 'USER#ADMIN001', username: 'admin001', tier: 'ADMIN', sessionId: 'S' });
});
afterEach(() => {
  sessionStore.clear();
  vi.restoreAllMocks();
});

function mockJson(payload: unknown, ok = true): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(payload) } as Response)
  );
}

describe('adminApi', () => {
  test('fetchDecisions sends window and type query and X-User-Id header', async () => {
    mockJson({ correlationId: '', data: { decisions: [], window: '1h' } });
    const res = await fetchDecisions({ window: '1h', type: 'FRAUD_TRANSFER' });
    expect(res.error).toBeNull();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/admin/decisions?');
    expect(call[0]).toContain('window=1h');
    expect(call[0]).toContain('type=FRAUD_TRANSFER');
    expect(call[1].headers['X-User-Id']).toBe('USER#ADMIN001');
  });

  test('fetchMetrics returns the metrics payload', async () => {
    mockJson({
      correlationId: '',
      data: { window: '1h', decisionsCount: 5, heldCount: 1, offersShown: 2, offersConverted: 0, nudgesSent: 2, nudgesDismissed: 0, bedrockLatencyP95Ms: null },
    });
    const res = await fetchMetrics({ window: '1h' });
    expect(res.error).toBeNull();
    expect(res.data?.decisionsCount).toBe(5);
  });

  test('releaseHold POSTs to /admin/decisions/{id}/release', async () => {
    mockJson({ correlationId: '', data: { decision: { decisionId: 'DEC#new', type: 'DECISION_RELEASE' } } });
    const res = await releaseHold('DEC#abc');
    expect(res.error).toBeNull();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/admin/decisions/DEC%23abc/release');
    expect(call[1].method).toBe('POST');
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `cd apps/frontend && npm test adminApi`
Expected: FAIL on missing module.

- [ ] **Step 4: Implement**

Write `apps/frontend/src/lib/adminApi.ts`:

```ts
import { apiFetch } from './api';
import { sessionStore } from './sessionStore';
import type { ApiResult, DecisionsResponse, Metrics, Decision } from './types';

function adminHeaders(): Record<string, string> {
  const profile = sessionStore.get();
  if (!profile) return {};
  return { 'X-User-Id': profile.userId };
}

export async function fetchDecisions(params: {
  window?: '5m' | '1h' | '24h';
  type?: string;
  userId?: string;
  limit?: number;
}): Promise<ApiResult<DecisionsResponse>> {
  const q = new URLSearchParams();
  if (params.window) q.set('window', params.window);
  if (params.type) q.set('type', params.type);
  if (params.userId) q.set('userId', params.userId);
  if (params.limit) q.set('limit', String(params.limit));
  return apiFetch<DecisionsResponse>(`/admin/decisions?${q.toString()}`, {
    headers: adminHeaders(),
  });
}

export async function fetchMetrics(params: {
  window?: '5m' | '1h' | '24h';
}): Promise<ApiResult<Metrics>> {
  const q = new URLSearchParams();
  if (params.window) q.set('window', params.window);
  return apiFetch<Metrics>(`/admin/metrics?${q.toString()}`, {
    headers: adminHeaders(),
  });
}

export async function releaseHold(decisionId: string): Promise<ApiResult<{ decision: Decision }>> {
  return apiFetch<{ decision: Decision }>(
    `/admin/decisions/${encodeURIComponent(decisionId)}/release`,
    { method: 'POST', headers: adminHeaders() }
  );
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/frontend && npm test adminApi`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/lib/adminApi.ts \
        apps/frontend/src/lib/__tests__/adminApi.test.ts \
        apps/frontend/src/lib/types.ts
git commit -m "feat(frontend): add typed admin API wrappers"
```

---

## Task 14: KpiStrip component

**Files:**
- Create: `apps/frontend/src/pages/admin/KpiStrip.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/KpiStrip.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/pages/admin/__tests__/KpiStrip.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiStrip from '../KpiStrip';

describe('KpiStrip', () => {
  test('renders five tiles with values', () => {
    render(
      <KpiStrip
        metrics={{
          window: '1h',
          decisionsCount: 142,
          heldCount: 3,
          offersShown: 61,
          offersConverted: 7,
          nudgesSent: 78,
          nudgesDismissed: 23,
          bedrockLatencyP95Ms: 1800,
        }}
      />
    );
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText(/1\.8s/)).toBeInTheDocument();
  });

  test('shows n/a when bedrock latency is null', () => {
    render(
      <KpiStrip
        metrics={{
          window: '1h',
          decisionsCount: 0,
          heldCount: 0,
          offersShown: 0,
          offersConverted: 0,
          nudgesSent: 0,
          nudgesDismissed: 0,
          bedrockLatencyP95Ms: null,
        }}
      />
    );
    expect(screen.getByText(/n\/a/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test KpiStrip`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/pages/admin/KpiStrip.tsx`:

```tsx
import type { Metrics } from '../../lib/types';

function formatLatency(ms: number | null): string {
  if (ms === null) return 'n/a';
  return `${(ms / 1000).toFixed(1)}s`;
}

function Tile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'danger';
}) {
  const wrap =
    tone === 'danger'
      ? 'bg-white border-red-200'
      : 'bg-white border-gray-200';
  const valueColor = tone === 'danger' ? 'text-red-900' : 'text-gray-900';
  return (
    <div className={`${wrap} border rounded-lg p-3`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${valueColor}`}>{value}</div>
      {sub ? <div className="text-[10px] text-gray-500">{sub}</div> : null}
    </div>
  );
}

export default function KpiStrip({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-5 gap-2 mb-3">
      <Tile label={`Decisions / ${metrics.window}`} value={String(metrics.decisionsCount)} />
      <Tile
        label="Held"
        value={String(metrics.heldCount)}
        tone={metrics.heldCount > 0 ? 'danger' : 'neutral'}
        sub={metrics.heldCount > 0 ? `${metrics.heldCount} unresolved` : undefined}
      />
      <Tile
        label="Offers shown"
        value={String(metrics.offersShown)}
        sub={`${metrics.offersConverted} converted`}
      />
      <Tile
        label="Nudges sent"
        value={String(metrics.nudgesSent)}
        sub={`${metrics.nudgesDismissed} dismissed`}
      />
      <Tile
        label="Bedrock latency"
        value={formatLatency(metrics.bedrockLatencyP95Ms)}
        sub="p95"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test KpiStrip`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/admin/KpiStrip.tsx \
        apps/frontend/src/pages/admin/__tests__/KpiStrip.test.tsx
git commit -m "feat(frontend): add admin KPI strip component"
```

---

## Task 15: FilterChips component

**Files:**
- Create: `apps/frontend/src/pages/admin/FilterChips.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/FilterChips.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/pages/admin/__tests__/FilterChips.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterChips from '../FilterChips';

describe('FilterChips', () => {
  test('renders type chips with counts and current window pill', () => {
    render(
      <FilterChips
        type=""
        window="1h"
        counts={{ ALL: 142, FRAUD_TRANSFER: 3, OFFER: 61, NUDGE: 78 }}
        onType={() => {}}
        onWindow={() => {}}
      />
    );
    expect(screen.getByText(/All 142/)).toBeInTheDocument();
    expect(screen.getByText(/Fraud 3/)).toBeInTheDocument();
    expect(screen.getByText(/Offers 61/)).toBeInTheDocument();
    expect(screen.getByText(/Nudges 78/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking Fraud calls onType with FRAUD_TRANSFER', async () => {
    const onType = vi.fn();
    render(
      <FilterChips
        type=""
        window="1h"
        counts={{ ALL: 0, FRAUD_TRANSFER: 0, OFFER: 0, NUDGE: 0 }}
        onType={onType}
        onWindow={() => {}}
      />
    );
    await userEvent.click(screen.getByText(/Fraud/));
    expect(onType).toHaveBeenCalledWith('FRAUD_TRANSFER');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test FilterChips`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/pages/admin/FilterChips.tsx`:

```tsx
const WINDOWS = ['5m', '1h', '24h'] as const;

export type WindowKey = (typeof WINDOWS)[number];

type Counts = {
  ALL: number;
  FRAUD_TRANSFER: number;
  OFFER: number;
  NUDGE: number;
};

export default function FilterChips({
  type,
  window,
  counts,
  onType,
  onWindow,
}: {
  type: string;
  window: WindowKey;
  counts: Counts;
  onType: (next: string) => void;
  onWindow: (next: WindowKey) => void;
}) {
  function chip(active: boolean, danger = false): string {
    if (active) return 'bg-gray-900 text-white';
    if (danger) return 'bg-white border border-red-200 text-red-900';
    return 'bg-white border border-gray-200 text-gray-700';
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <button
        type="button"
        className={`text-xs rounded-full px-2.5 py-1 ${chip(type === '')}`}
        onClick={() => onType('')}
      >
        All {counts.ALL}
      </button>
      <button
        type="button"
        className={`text-xs rounded-full px-2.5 py-1 ${chip(type === 'FRAUD_TRANSFER', true)}`}
        onClick={() => onType('FRAUD_TRANSFER')}
      >
        Fraud {counts.FRAUD_TRANSFER}
      </button>
      <button
        type="button"
        className={`text-xs rounded-full px-2.5 py-1 ${chip(type === 'OFFER')}`}
        onClick={() => onType('OFFER')}
      >
        Offers {counts.OFFER}
      </button>
      <button
        type="button"
        className={`text-xs rounded-full px-2.5 py-1 ${chip(type === 'NUDGE')}`}
        onClick={() => onType('NUDGE')}
      >
        Nudges {counts.NUDGE}
      </button>
      <span className="ml-auto text-xs text-gray-500">Window</span>
      {WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          aria-pressed={window === w}
          className={`text-xs rounded-full px-2.5 py-1 ${chip(window === w)}`}
          onClick={() => onWindow(w)}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test FilterChips`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/admin/FilterChips.tsx \
        apps/frontend/src/pages/admin/__tests__/FilterChips.test.tsx
git commit -m "feat(frontend): add admin FilterChips component"
```

---

## Task 16: DecisionFeed component

**Files:**
- Create: `apps/frontend/src/pages/admin/DecisionFeed.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/DecisionFeed.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/pages/admin/__tests__/DecisionFeed.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionFeed from '../DecisionFeed';

const decisions = [
  { decisionId: 'D1', userId: 'USER#001', timestamp: 1000, type: 'FRAUD_TRANSFER', action: 'BLOCK', severity: 'HIGH', reason: 'High velocity' },
  { decisionId: 'D2', userId: 'USER#002', timestamp: 990, type: 'OFFER', action: 'SHOW', severity: 'LOW', reason: 'Promo eligibility' },
];

describe('DecisionFeed', () => {
  test('renders one card per decision', () => {
    render(<DecisionFeed decisions={decisions} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/FRAUD_TRANSFER/)).toBeInTheDocument();
    expect(screen.getByText(/OFFER/)).toBeInTheDocument();
  });

  test('clicking a card calls onSelect with the id', async () => {
    const onSelect = vi.fn();
    render(<DecisionFeed decisions={decisions} selectedId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText(/OFFER/));
    expect(onSelect).toHaveBeenCalledWith('D2');
  });

  test('selected card has aria-selected', () => {
    render(<DecisionFeed decisions={decisions} selectedId="D1" onSelect={() => {}} />);
    const card = screen.getByText(/FRAUD_TRANSFER/).closest('[role="option"]');
    expect(card).toHaveAttribute('aria-selected', 'true');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test DecisionFeed`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/pages/admin/DecisionFeed.tsx`:

```tsx
import type { Decision } from '../../lib/types';

function relativeAge(now: number, ts: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function toneFor(d: Decision): string {
  if (d.action === 'BLOCK' || d.type === 'FRAUD_TRANSFER') return 'bg-red-50 border-red-200';
  if (d.severity === 'MEDIUM') return 'bg-amber-50 border-amber-200';
  return 'bg-white border-gray-200';
}

export default function DecisionFeed({
  decisions,
  selectedId,
  onSelect,
}: {
  decisions: Decision[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  return (
    <ul role="listbox" aria-label="Decision feed" className="flex flex-col gap-1.5">
      {decisions.map((d) => (
        <li
          key={d.decisionId}
          role="option"
          aria-selected={selectedId === d.decisionId}
          tabIndex={0}
          onClick={() => onSelect(d.decisionId)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(d.decisionId);
            }
          }}
          className={`${toneFor(d)} border rounded-md px-2.5 py-2 cursor-pointer hover:ring-1 hover:ring-gray-300`}
        >
          <div className="flex items-center justify-between">
            <strong className="text-[11px] text-gray-900">
              {d.action} &middot; {d.type}
            </strong>
            <span className="text-[10px] text-gray-500">{relativeAge(now, d.timestamp)}</span>
          </div>
          <div className="text-[11px] text-gray-700">
            {d.userId} &middot; {d.reason}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test DecisionFeed`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/admin/DecisionFeed.tsx \
        apps/frontend/src/pages/admin/__tests__/DecisionFeed.test.tsx
git commit -m "feat(frontend): add admin DecisionFeed component"
```

---

## Task 17: DecisionDetail component with Release action

**Files:**
- Create: `apps/frontend/src/pages/admin/DecisionDetail.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/DecisionDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `apps/frontend/src/pages/admin/__tests__/DecisionDetail.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionDetail from '../DecisionDetail';

const decision = {
  decisionId: 'DEC#abc',
  userId: 'USER#001',
  timestamp: 1000,
  type: 'FRAUD_TRANSFER',
  action: 'BLOCK',
  severity: 'HIGH',
  reason: 'High velocity transfer',
};

describe('DecisionDetail', () => {
  test('renders placeholder when nothing is selected', () => {
    render(<DecisionDetail decision={null} onRelease={vi.fn()} releasing={false} />);
    expect(screen.getByText(/select a decision/i)).toBeInTheDocument();
  });

  test('shows release button for BLOCK decisions', () => {
    render(<DecisionDetail decision={decision} onRelease={vi.fn()} releasing={false} />);
    expect(screen.getByRole('button', { name: /release hold/i })).toBeInTheDocument();
  });

  test('hides release button for non-BLOCK decisions', () => {
    render(
      <DecisionDetail
        decision={{ ...decision, action: 'SHOW', type: 'OFFER' }}
        onRelease={vi.fn()}
        releasing={false}
      />
    );
    expect(screen.queryByRole('button', { name: /release hold/i })).toBeNull();
  });

  test('clicking release calls onRelease with the decision id', async () => {
    const onRelease = vi.fn();
    render(<DecisionDetail decision={decision} onRelease={onRelease} releasing={false} />);
    await userEvent.click(screen.getByRole('button', { name: /release hold/i }));
    expect(onRelease).toHaveBeenCalledWith('DEC#abc');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd apps/frontend && npm test DecisionDetail`
Expected: FAIL on missing module.

- [ ] **Step 3: Implement**

Write `apps/frontend/src/pages/admin/DecisionDetail.tsx`:

```tsx
import type { Decision } from '../../lib/types';

export default function DecisionDetail({
  decision,
  onRelease,
  releasing,
}: {
  decision: Decision | null;
  onRelease: (decisionId: string) => void;
  releasing: boolean;
}) {
  if (!decision) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        Select a decision from the feed to see details.
      </div>
    );
  }

  const isHeld = decision.action === 'BLOCK';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex justify-between items-center">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">
          {isHeld ? 'Selected (HELD)' : 'Selected'}
        </div>
        <span className="text-[10px] text-gray-500">{decision.decisionId}</span>
      </div>
      <div className="text-sm font-semibold text-gray-900 mt-1">{decision.type}</div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-800 mt-2">
        <dt className="text-gray-500">User</dt>
        <dd>{decision.userId}</dd>
        <dt className="text-gray-500">Action</dt>
        <dd>{decision.action}</dd>
        <dt className="text-gray-500">Severity</dt>
        <dd>{decision.severity}</dd>
        <dt className="text-gray-500">Reason</dt>
        <dd>{decision.reason}</dd>
      </dl>

      {isHeld ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={releasing}
            onClick={() => onRelease(decision.decisionId)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold rounded-md px-3 py-2"
          >
            {releasing ? 'Releasing...' : 'Release hold'}
          </button>
          <button
            type="button"
            className="flex-1 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-md px-3 py-2"
          >
            Mark fraud
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npm test DecisionDetail`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/admin/DecisionDetail.tsx \
        apps/frontend/src/pages/admin/__tests__/DecisionDetail.test.tsx
git commit -m "feat(frontend): add admin DecisionDetail panel with release action"
```

---

## Task 17b: EntityTabs and UsersTab

**Files:**
- Create: `apps/frontend/src/pages/admin/EntityTabs.tsx`
- Create: `apps/frontend/src/pages/admin/UsersTab.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/EntityTabs.test.tsx`
- Create: `apps/frontend/src/pages/admin/__tests__/UsersTab.test.tsx`

- [ ] **Step 1: Write the EntityTabs test**

Write `apps/frontend/src/pages/admin/__tests__/EntityTabs.test.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntityTabs from '../EntityTabs';

describe('EntityTabs', () => {
  test('marks the active tab with aria-current', () => {
    render(<EntityTabs active="decisions" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /decisions/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('tab', { name: /users/i })).not.toHaveAttribute('aria-current');
  });

  test('clicking Users calls onChange with users', async () => {
    const onChange = vi.fn();
    render(<EntityTabs active="decisions" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /users/i }));
    expect(onChange).toHaveBeenCalledWith('users');
  });
});
```

- [ ] **Step 2: Implement EntityTabs**

Write `apps/frontend/src/pages/admin/EntityTabs.tsx`:

```tsx
export type AdminTab = 'decisions' | 'users';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'decisions', label: 'Decisions' },
  { id: 'users', label: 'Users' },
];

export default function EntityTabs({
  active,
  onChange,
}: {
  active: AdminTab;
  onChange: (next: AdminTab) => void;
}) {
  return (
    <div role="tablist" className="flex border-b border-gray-200 mb-3">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-current={active === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
          className={`px-3.5 py-2 text-xs ${
            active === t.id
              ? 'border-b-2 border-gray-900 text-gray-900 font-semibold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the UsersTab test**

Write `apps/frontend/src/pages/admin/__tests__/UsersTab.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UsersTab from '../UsersTab';

describe('UsersTab', () => {
  test('renders one row per user with tier badge', () => {
    render(
      <UsersTab
        users={[
          { userId: 'USER#001', username: 'user001', tier: 'Gold', loyaltyScore: 510 },
          { userId: 'USER#002', username: 'user002', tier: 'Platinum', loyaltyScore: 520 },
        ]}
      />
    );
    expect(screen.getByText('user001')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Platinum')).toBeInTheDocument();
  });

  test('renders empty state when no users', () => {
    render(<UsersTab users={[]} />);
    expect(screen.getByText(/no users/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Implement UsersTab**

Write `apps/frontend/src/pages/admin/UsersTab.tsx`:

```tsx
export type UserRow = {
  userId: string;
  username: string;
  tier: string;
  loyaltyScore: number;
};

function tierTone(tier: string): string {
  if (tier === 'ADMIN') return 'bg-gray-900 text-white';
  if (tier === 'Platinum') return 'bg-purple-50 text-purple-900 border-purple-200 border';
  if (tier === 'Gold') return 'bg-amber-50 text-amber-900 border-amber-200 border';
  return 'bg-gray-50 text-gray-700 border-gray-200 border';
}

export default function UsersTab({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        No users in the current view.
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">User</th>
            <th className="text-left px-3 py-2">Username</th>
            <th className="text-left px-3 py-2">Tier</th>
            <th className="text-right px-3 py-2">Loyalty score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            <tr key={u.userId}>
              <td className="px-3 py-2 text-gray-700">{u.userId}</td>
              <td className="px-3 py-2 text-gray-900 font-medium">{u.username}</td>
              <td className="px-3 py-2">
                <span className={`text-[10px] rounded-full px-2 py-0.5 ${tierTone(u.tier)}`}>
                  {u.tier}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-gray-700">{u.loyaltyScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Add the GET /admin/users endpoint to the backend**

Edit `apps/backend/src/admin.js`. Append before `module.exports`:

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

Update `module.exports`:

```js
module.exports = { isAdmin, requireAdmin, listDecisions, metrics, releaseHold, listUsers, json, err };
```

Edit `apps/backend/src/handler.js` import:

```js
const { listDecisions, metrics, releaseHold, listUsers } = require('./admin');
```

Add the route:

```js
if (method === 'GET' && p === '/admin/users') {
  const sessionUserId = getHeader(event.headers, 'x-user-id');
  if (!sessionUserId) return err(401, correlationId, 'UNAUTHENTICATED', 'Missing X-User-Id header');
  return listUsers({ sessionUserId, query: event.queryStringParameters ?? {} });
}
```

- [ ] **Step 6: Add a `fetchUsers` frontend wrapper**

Append to `apps/frontend/src/lib/adminApi.ts`:

```ts
import type { UserRow } from '../pages/admin/UsersTab';

export async function fetchUsers(): Promise<ApiResult<{ users: UserRow[] }>> {
  return apiFetch<{ users: UserRow[] }>('/admin/users', {
    headers: adminHeaders(),
  });
}
```

- [ ] **Step 7: Run tests**

Run: `cd apps/frontend && npm test EntityTabs UsersTab`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/admin/EntityTabs.tsx \
        apps/frontend/src/pages/admin/UsersTab.tsx \
        apps/frontend/src/pages/admin/__tests__/EntityTabs.test.tsx \
        apps/frontend/src/pages/admin/__tests__/UsersTab.test.tsx \
        apps/frontend/src/lib/adminApi.ts \
        apps/backend/src/admin.js apps/backend/src/handler.js
git commit -m "feat(admin): add Users tab and GET /admin/users endpoint"
```

---

## Task 18: Compose the Admin page

**Files:**
- Modify: `apps/frontend/src/pages/Admin.tsx`

- [ ] **Step 1: Implement the page composition**

Replace `apps/frontend/src/pages/Admin.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import KpiStrip from './admin/KpiStrip';
import FilterChips from './admin/FilterChips';
import type { WindowKey } from './admin/FilterChips';
import DecisionFeed from './admin/DecisionFeed';
import DecisionDetail from './admin/DecisionDetail';
import EntityTabs from './admin/EntityTabs';
import type { AdminTab } from './admin/EntityTabs';
import UsersTab from './admin/UsersTab';
import type { UserRow } from './admin/UsersTab';
import { fetchDecisions, fetchMetrics, releaseHold, fetchUsers } from '../lib/adminApi';
import type { Decision, Metrics } from '../lib/types';

const POLL_FOCUSED_MS = 3000;
const POLL_BLURRED_MS = 15000;

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>('decisions');
  const [windowKey, setWindowKey] = useState<WindowKey>('1h');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick(): Promise<void> {
      const calls: Promise<unknown>[] = [
        fetchDecisions({ window: windowKey, type: typeFilter || undefined, limit: 50 }).then(
          (r) => {
            if (!cancelled && r.error === null) setDecisions(r.data.decisions);
          }
        ),
        fetchMetrics({ window: windowKey }).then((r) => {
          if (!cancelled && r.error === null) setMetrics(r.data);
        }),
      ];
      if (tab === 'users') {
        calls.push(
          fetchUsers().then((r) => {
            if (!cancelled && r.error === null) setUsers(r.data.users);
          })
        );
      }
      await Promise.all(calls);
      if (cancelled) return;
      const next =
        document.visibilityState === 'visible' ? POLL_FOCUSED_MS : POLL_BLURRED_MS;
      timer = setTimeout(tick, next);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [windowKey, typeFilter, tab]);

  const counts = useMemo(() => {
    return {
      ALL: metrics?.decisionsCount ?? decisions.length,
      FRAUD_TRANSFER: decisions.filter((d) => d.type === 'FRAUD_TRANSFER').length,
      OFFER: metrics?.offersShown ?? decisions.filter((d) => d.type === 'OFFER').length,
      NUDGE: metrics?.nudgesSent ?? decisions.filter((d) => d.type === 'NUDGE').length,
    };
  }, [decisions, metrics]);

  const selected = decisions.find((d) => d.decisionId === selectedId) ?? null;

  async function handleRelease(id: string): Promise<void> {
    setReleasing(true);
    await releaseHold(id);
    setReleasing(false);
  }

  return (
    <div>
      <header className="flex justify-between items-center mb-3">
        <div>
          <strong className="text-gray-900 text-base">Signal Force admin</strong>
          <span className="text-xs text-gray-500 ml-2">us-east-1 &middot; live</span>
        </div>
      </header>

      {metrics ? <KpiStrip metrics={metrics} /> : null}

      <EntityTabs active={tab} onChange={setTab} />

      {tab === 'decisions' ? (
        <>
          <FilterChips
            type={typeFilter}
            window={windowKey}
            counts={counts}
            onType={setTypeFilter}
            onWindow={setWindowKey}
          />
          <div className="grid grid-cols-[1.3fr_1fr] gap-3">
            <DecisionFeed
              decisions={decisions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <DecisionDetail decision={selected} onRelease={handleRelease} releasing={releasing} />
          </div>
        </>
      ) : (
        <UsersTab users={users} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/Admin.tsx
git commit -m "feat(frontend): compose Admin page with polling and release"
```

---

## Task 19: Wire SignalCard into Layout and InlineBanner into Dashboard

**Files:**
- Modify: `apps/frontend/src/components/Layout.tsx`
- Modify: `apps/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Show SignalCard only on customer routes**

Replace `apps/frontend/src/components/Layout.tsx`:

```tsx
import { LayoutDashboard, LogIn, Shield } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import SignalCard from './SignalCard';
import { sessionStore } from '../lib/sessionStore';
import { useDecisionStream } from '../lib/useDecisionStream';

export default function Layout() {
  const location = useLocation();
  const profile = useSyncExternalStore(
    (cb) => sessionStore.subscribe(cb),
    () => sessionStore.get()
  );
  const isAdminRoute = location.pathname.startsWith('/admin');
  const stream = useDecisionStream(!isAdminRoute && profile ? profile.userId : null);

  const signals =
    !isAdminRoute && profile
      ? stream.nudges.map((n, i) => ({
          id: `${n.nudgeId}-${i}`,
          timestamp: Math.floor(Date.now() / 1000) - i,
          headline: n.message,
        }))
      : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-lg">Signal Force</span>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              <LogIn size={15} />
              Login
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              <LayoutDashboard size={15} />
              Dashboard
            </NavLink>
            {profile?.tier === 'ADMIN' ? (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                <Shield size={15} />
                Admin
              </NavLink>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      {!isAdminRoute ? <SignalCard signals={signals} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Use stream + show banner on Dashboard**

Replace `apps/frontend/src/pages/Dashboard.tsx`:

```tsx
import { useSyncExternalStore } from 'react';
import InlineBanner from '../components/InlineBanner';
import { useDecisionStream } from '../lib/useDecisionStream';
import { sessionStore } from '../lib/sessionStore';

export default function Dashboard() {
  const profile = useSyncExternalStore(
    (cb) => sessionStore.subscribe(cb),
    () => sessionStore.get()
  );
  const userId = profile?.userId ?? 'USER#001';
  const stream = useDecisionStream(userId);

  if (stream.loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const blocked = stream.fraudStatus?.isBlocked ?? false;

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {blocked ? (
        <InlineBanner
          type="HELD"
          title="Transfer paused for review"
          body="Unusually high velocity from a new device. Confirm or wait for release."
        />
      ) : null}

      {stream.nudges.length > 0 ? (
        <div className="space-y-2">
          {stream.nudges.map((n) => (
            <InlineBanner key={n.nudgeId} type="INFO" title={n.message} body={n.reason} />
          ))}
        </div>
      ) : null}

      <pre className="bg-white border border-gray-200 rounded-lg p-4 text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap break-words">
        {JSON.stringify(stream.data, null, 2)}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Smoke test in the browser**

```bash
cd apps/frontend && npm run dev
```

Open `http://localhost:5173/login`. Sign in as `user001` / `Password1`, location `New York`, deviceId `device-abc`. After MFA verify, navigate to `/dashboard`. Expect: SignalCard appears bottom-right with the profile nudge. Banner is hidden when not blocked.

Sign out (clear local storage / refresh), sign in as `admin001` / `AdminPass1`. Navigate to `/admin`. Expect: KPI strip, filter chips, decision feed loaded from live data, click any HELD card to see Release hold.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/Layout.tsx apps/frontend/src/pages/Dashboard.tsx
git commit -m "feat(frontend): wire signal card and inline banners into customer surface"
```

---

## Task 20: Run all tests, build, push, PR

**Files:** (no source changes)

- [ ] **Step 1: Run all frontend tests**

Run: `cd apps/frontend && npm test`
Expected: All suites pass.

- [ ] **Step 2: Run all backend tests**

Run: `cd apps/backend && npm test`
Expected: All suites pass.

- [ ] **Step 3: Run CDK tests (regression guard)**

Run: `cd infra/cdk && npm test`
Expected: 33 tests pass (no snapshot changes expected since CDK was not touched).

- [ ] **Step 4: Build frontend**

Run: `cd apps/frontend && npm run build`
Expected: bundle in `dist/`.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/admin-signal-ui
gh pr create \
  --title "feat: admin console and customer signal ui" \
  --body-file docs/superpowers/specs/2026-05-20-admin-and-signal-ui-design.md
```

- [ ] **Step 6: Verify hooks pass on pre-push**

If the pre-push hook fails, fix the reported error (lint, typecheck, synth) and push again. Do not bypass with `--no-verify`.

- [ ] **Step 7: Merge once green**

```bash
gh pr merge --merge --delete-branch
```

- [ ] **Step 8: Deploy frontend (CloudFront / S3 from `signal-force-frontend` stack)**

```bash
cd infra/cdk && npx cdk deploy signal-force-frontend --require-approval never
```

The frontend stack reads `apps/frontend/dist`. Confirm in the CDK output that `BucketDeployment` ran. Visit the CloudFront URL printed in the stack output, sign in, and walk the demo flow on two laptops (or two browser windows) end to end:

1. Customer logs in (user001), dashboard polls, SignalCard greets.
2. Customer attempts five rapid transfers; the fifth comes back HELD; banner appears.
3. Admin (admin001 in another window) sees the FRAUD card at top within 3s.
4. Admin clicks Release hold.
5. Customer's next poll shows the banner cleared.

If anything breaks the loop, tail the Lambda logs and patch on a follow-up branch. Do not patch on `main` directly.

---

## Out of scope (carry to a separate plan)

- Users tab profile drill-down (the list view is in scope per Task 17b; clicking through to a per-user history is not).
- Rules and Activity tabs.
- Bedrock latency real metric ingestion.
- Mark-fraud follow-through (writes a row today, no downstream effect).
- WCAG audit beyond `role` / `aria-` attributes already in components.
- Mobile / tablet layouts.

## Risk log

- **Single-handler Lambda growing past 500 lines.** Mitigated by Task 3 splitting admin logic into `src/admin.js`. If `handler.js` still creeps past 500, follow-up plan should extract `auth.js`, `transfer.js`, `decisions.js` the same way.
- **Polling cost.** At 3s with two open tabs that is ~28k Lambda invokes per 24h, well within the $80 kill-switch. No action required for demo; flag if the team runs the demo continuously for > 6h.
- **Session cookie / X-User-Id header.** Demo uses `X-User-Id` header verbatim. This is not real auth and is documented as such in the spec. Do not let it leave the demo branch.
