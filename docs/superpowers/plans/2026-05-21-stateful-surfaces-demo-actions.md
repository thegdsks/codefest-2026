# Stateful Surfaces and Demo Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace boolean eligible/hidden surfaces with a 4-state lifecycle (SHOWN/HIDDEN/PENDING/COMPLETED), add 3 new surfaces, and give DemoPanel mutation buttons so the operator can flip states live during the demo.

**Architecture:** Backend gains a pure evaluator module (`src/engine/surfaces.js`) that reads UserProfile+UserState and returns typed surface rows. A new admin endpoint (`POST /admin/demo-actions/mutate-user`) writes to UserProfile/UserState and fires a DEMO_EVENT. Frontend gets updated TypeScript types, a new API call, and action buttons in DemoPanel with an optimistic refetch.

**Tech Stack:** Node.js Lambda (CommonJS), DynamoDB via AWS SDK v3, Next.js 15 App Router, TypeScript 5, Tailwind CSS, Lucide icons, React Query (or the existing manual fetch pattern in use-surface-eligibility).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/backend/src/engine/surfaces.js` | Create | Pure surface evaluator - no HTTP, no DDB writes |
| `apps/backend/src/routes/customer.js` | Modify | Wire `surfaceEligibility` to the new evaluator |
| `apps/backend/src/routes/admin/demo-actions.js` | Create | `POST /admin/demo-actions/mutate-user` |
| `apps/backend/src/routes/admin/index.js` | Modify | Export `mutateDemoUser` |
| `apps/backend/src/handler.js` | Modify | Add route for `POST /admin/demo-actions/mutate-user` |
| `apps/backend/src/engine/surfaces.test.js` | Create | Unit tests for the evaluator |
| `apps/backend/src/routes/admin/demo-actions.test.js` | Create | Unit tests for the mutation endpoint |
| `apps/frontend/lib/hotel/surface-types.ts` | Modify | Add `SurfaceState`, `NextAction`, update `SurfaceEvaluation` |
| `apps/frontend/lib/hotel/customer-api.ts` | Modify | Add `mutateDemoUser` call |
| `apps/frontend/lib/hotel/use-surface-eligibility.ts` | No change | Already handles refetch; cache invalidation called by DemoPanel |
| `apps/frontend/components/hotel/DemoPanel.tsx` | Modify | State-colored pills, nextAction buttons, Quick Mutations row |
| `seed_data/EngagementRules_batch_1.json` | Modify | Add RULE#MFA_ENROLLMENT_GAP, RULE#POST_BOOKING_UPSELL |

---

## Task 1: Surface evaluator module (backend)

**Files:**
- Create: `apps/backend/src/engine/surfaces.js`
- Create: `apps/backend/src/engine/surfaces.test.js`

The evaluator is a pure function: takes `{ profile, state, nowSec }` and returns an array of `SurfaceResult` objects. No DDB access, no HTTP. Testable in isolation.

### Surface state semantics

- `PROPERTY_PRESTIGE_ADVANCE` and `RESULTS_PRESTIGE_ADVANCE`: SHOWN when tier < Platinum AND pointsToNextTier <= 10000. HIDDEN when already Platinum. COMPLETED when tier became Platinum within last 60s (UserState field `platinumReachedAt`).
- `PROFILE_CATALYST_ELEVATE`: SHOWN when profileCompletion < 90 AND tier != Platinum. PENDING when UserState has `profileEditInProgress: true`. COMPLETED when profileCompletion >= 90 AND UserState has `profileCompletionReachedAt` within last 60s. HIDDEN when Platinum OR completion was always >= 90.
- `MFA_ENROLLMENT_NUDGE`: SHOWN when no mfaSecret AND tier in [Gold, Platinum]. COMPLETED when UserState has `mfaEnrolledAt` within last 60s. HIDDEN otherwise.
- `TRANSFER_ABANDON_OFFER`: PENDING when UserState has `transferDraft.lastUpdatedAt > now - 60`. SHOWN when `transferDraft` exists with `lastUpdatedAt < now - 60`. COMPLETED when UserState has `lastTransferCompletedAt > now - 60`. HIDDEN when no transferDraft and no recent transfer.
- `BOOKING_CONFIRMATION_OFFER`: SHOWN when UserState has `recentBookingAt > now - 300` (5 min). COMPLETED when UserState has `bookingOfferDismissedAt > now - 300`. HIDDEN otherwise.

- [ ] **Step 1: Write the failing tests**

```javascript
// apps/backend/src/engine/surfaces.test.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSurfaces } = require('./surfaces');

function baseProfile(overrides = {}) {
  return {
    userId: 'user001',
    tier: 'Gold',
    loyaltyScore: 600,
    profileCompletion: 70,
    emailVerified: true,
    phoneVerified: false,
    mfaSecret: null,
    ...overrides,
  };
}

function baseState(overrides = {}) {
  return { userId: 'user001', ...overrides };
}

const NOW = 1716300000;

describe('evaluateSurfaces', () => {
  test('PROPERTY_PRESTIGE_ADVANCE is SHOWN when tier=Gold and close to threshold', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'SHOWN');
    assert.ok(s.copy !== null);
    assert.ok(s.nextAction !== null);
    assert.equal(s.nextAction.target, 'tier');
  });

  test('PROPERTY_PRESTIGE_ADVANCE is HIDDEN when already Platinum', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum' }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'HIDDEN');
    assert.equal(s.copy, null);
  });

  test('PROPERTY_PRESTIGE_ADVANCE is COMPLETED when platinumReachedAt within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Platinum' }),
      state: baseState({ platinumReachedAt: NOW - 30 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROPERTY_PRESTIGE_ADVANCE');
    assert.equal(s.state, 'COMPLETED');
  });

  test('PROFILE_CATALYST_ELEVATE is SHOWN when incomplete and not Platinum', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'SHOWN');
  });

  test('PROFILE_CATALYST_ELEVATE is PENDING when profileEditInProgress', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ profileEditInProgress: true }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert.equal(s.state, 'PENDING');
    assert.equal(s.copy, null);
  });

  test('MFA_ENROLLMENT_NUDGE is SHOWN when Gold with no mfaSecret', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'SHOWN');
    assert.equal(s.ruleId, 'RULE#MFA_ENROLLMENT_GAP');
  });

  test('MFA_ENROLLMENT_NUDGE is HIDDEN when Silver', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ tier: 'Silver' }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'HIDDEN');
  });

  test('MFA_ENROLLMENT_NUDGE is HIDDEN when already has mfaSecret', () => {
    const result = evaluateSurfaces({
      profile: baseProfile({ mfaSecret: 'BASE32SECRET' }),
      state: baseState(),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'MFA_ENROLLMENT_NUDGE');
    assert.equal(s.state, 'HIDDEN');
  });

  test('TRANSFER_ABANDON_OFFER is PENDING when draft updated within 60s', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ transferDraft: { lastUpdatedAt: NOW - 30 } }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'PENDING');
  });

  test('TRANSFER_ABANDON_OFFER is SHOWN when draft is stale', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ transferDraft: { lastUpdatedAt: NOW - 120 } }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert.equal(s.state, 'SHOWN');
  });

  test('BOOKING_CONFIRMATION_OFFER is SHOWN when recentBookingAt within 5 min', () => {
    const result = evaluateSurfaces({
      profile: baseProfile(),
      state: baseState({ recentBookingAt: NOW - 60 }),
      nowSec: NOW,
    });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'SHOWN');
  });

  test('BOOKING_CONFIRMATION_OFFER is HIDDEN when no recent booking', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    const s = result.find((r) => r.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert.equal(s.state, 'HIDDEN');
  });

  test('returns all 5 surfaces in every call', () => {
    const result = evaluateSurfaces({ profile: baseProfile(), state: baseState(), nowSec: NOW });
    assert.equal(result.length, 5);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd apps/backend && node --test src/engine/surfaces.test.js 2>&1 | head -20
```

Expected: `Error: Cannot find module './surfaces'`

- [ ] **Step 3: Implement the evaluator**

```javascript
// apps/backend/src/engine/surfaces.js
'use strict';

const PLATINUM_THRESHOLD = 1000;
const PLAT_TIER = 'platinum';
const GOLD_TIER = 'gold';
const RECENT_WINDOW_SEC = 60;
const BOOKING_WINDOW_SEC = 300;

/**
 * @typedef {'SHOWN'|'HIDDEN'|'PENDING'|'COMPLETED'} SurfaceState
 *
 * @typedef {Object} NextAction
 * @property {string} label
 * @property {'profileCompletion'|'tier'|'mfaEnrolled'|'flow.transfer'|'booking'} target
 * @property {object} [delta]
 *
 * @typedef {Object} SurfaceResult
 * @property {string} surfaceId
 * @property {SurfaceState} state
 * @property {string|null} ruleId
 * @property {string} reason
 * @property {object} context
 * @property {{headline:string,body:string}|null} copy
 * @property {NextAction|null} nextAction
 */

/**
 * Evaluate all surfaces for a user. Pure function - no DDB access, no HTTP.
 *
 * @param {{ profile: object, state: object, nowSec: number }} params
 * @returns {SurfaceResult[]}
 */
function evaluateSurfaces({ profile, state, nowSec }) {
  const st = state || {};
  const tier = String(profile.tier || '').toLowerCase();
  const isPlat = tier === PLAT_TIER;
  const loyaltyScore = Number(profile.loyaltyScore || 0);
  const pointsToNextTier = isPlat ? 0 : Math.max(PLATINUM_THRESHOLD - loyaltyScore, 0);
  const displayTier = profile.tier || '';
  const nextTier = 'Platinum';

  return [
    prestigeAdvance('PROPERTY_PRESTIGE_ADVANCE', { isPlat, pointsToNextTier, displayTier, nextTier, st, nowSec }),
    prestigeAdvance('RESULTS_PRESTIGE_ADVANCE', { isPlat, pointsToNextTier, displayTier, nextTier, st, nowSec }),
    profileCatalyst({ profile, isPlat, st, pointsToNextTier, displayTier, nextTier }),
    mfaEnrollmentNudge({ profile, tier, isPlat, st, nowSec }),
    transferAbandonOffer({ st, nowSec }),
    bookingConfirmationOffer({ st, nowSec }),
  ];
}

function prestigeAdvance(surfaceId, { isPlat, pointsToNextTier, displayTier, nextTier, st, nowSec }) {
  const platinumReachedAt = st.platinumReachedAt ? Number(st.platinumReachedAt) : null;
  const justReachedPlat = platinumReachedAt && nowSec - platinumReachedAt <= RECENT_WINDOW_SEC;

  if (justReachedPlat) {
    return {
      surfaceId,
      state: 'COMPLETED',
      ruleId: 'RULE#TIER_GAP_NUDGE',
      reason: 'User just reached Platinum',
      context: { pointsToNextTier, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (isPlat) {
    return {
      surfaceId,
      state: 'HIDDEN',
      ruleId: null,
      reason: 'User is at top tier already',
      context: { pointsToNextTier: 0, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (pointsToNextTier <= 10000) {
    return {
      surfaceId,
      state: 'SHOWN',
      ruleId: 'RULE#TIER_GAP_NUDGE',
      reason: `Within ${pointsToNextTier.toLocaleString()} pts of ${nextTier}`,
      context: { pointsToNextTier, currentTier: displayTier, nextTier },
      copy: {
        headline: 'Prestige Advance Benefit',
        body: `You are only ${pointsToNextTier.toLocaleString()} points away from ${nextTier}. Book 4 nights in the next 3 hours to get double points and reach ${nextTier} tier.`,
      },
      nextAction: {
        label: 'Book 4 nights to reach Platinum',
        target: 'tier',
        delta: { tier: 'Platinum' },
      },
    };
  }

  return {
    surfaceId,
    state: 'HIDDEN',
    ruleId: null,
    reason: `More than 10000 pts from ${nextTier}`,
    context: { pointsToNextTier, currentTier: displayTier, nextTier },
    copy: null,
    nextAction: null,
  };
}

function profileCatalyst({ profile, isPlat, st, pointsToNextTier, displayTier, nextTier }) {
  const completion = Number(profile.profileCompletion || 0);
  const profileCompletionReachedAt = st.profileCompletionReachedAt
    ? Number(st.profileCompletionReachedAt)
    : null;

  if (profileCompletionReachedAt && !isPlat) {
    // Recently completed - COMPLETED state
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'COMPLETED',
      ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
      reason: 'Profile completion just reached 90%',
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (isPlat || completion >= 90) {
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'HIDDEN',
      ruleId: null,
      reason: isPlat ? 'Already Platinum - card hidden' : `Profile already ${completion}% complete - card hidden`,
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  if (st.profileEditInProgress) {
    return {
      surfaceId: 'PROFILE_CATALYST_ELEVATE',
      state: 'PENDING',
      ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
      reason: 'Profile update in progress',
      context: { profileCompletion: completion, currentTier: displayTier, nextTier },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'PROFILE_CATALYST_ELEVATE',
    state: 'SHOWN',
    ruleId: 'RULE#PROFILE_INCOMPLETE_TIER_GAP',
    reason: `Profile ${completion}% complete and user is below Platinum`,
    context: { profileCompletion: completion, currentTier: displayTier, nextTier },
    copy: {
      headline: 'Catalyst Elevate Benefit',
      body: `As a valued ${displayTier} Status member, you are only ${pointsToNextTier.toLocaleString()} SFC points away from ${nextTier}. Update your details to increase your ${completion}% Registry Completeness.`,
    },
    nextAction: {
      label: 'Update mobile phone',
      target: 'profileCompletion',
      delta: { profileCompletion: 90 },
    },
  };
}

function mfaEnrollmentNudge({ profile, tier, isPlat, st, nowSec }) {
  const hasMfa = !!(profile.mfaSecret);
  const mfaEnrolledAt = st.mfaEnrolledAt ? Number(st.mfaEnrolledAt) : null;
  const justEnrolled = mfaEnrolledAt && nowSec - mfaEnrolledAt <= RECENT_WINDOW_SEC;

  if (justEnrolled) {
    return {
      surfaceId: 'MFA_ENROLLMENT_NUDGE',
      state: 'COMPLETED',
      ruleId: 'RULE#MFA_ENROLLMENT_GAP',
      reason: 'MFA just enrolled',
      context: { hasMfa: true, currentTier: profile.tier || '' },
      copy: null,
      nextAction: null,
    };
  }

  const eligibleTier = isPlat || tier === GOLD_TIER;

  if (!eligibleTier || hasMfa) {
    return {
      surfaceId: 'MFA_ENROLLMENT_NUDGE',
      state: 'HIDDEN',
      ruleId: null,
      reason: hasMfa ? 'MFA already enrolled' : 'Tier not eligible for MFA nudge',
      context: { hasMfa, currentTier: profile.tier || '' },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'MFA_ENROLLMENT_NUDGE',
    state: 'SHOWN',
    ruleId: 'RULE#MFA_ENROLLMENT_GAP',
    reason: `${profile.tier} member without MFA enrolled`,
    context: { hasMfa: false, currentTier: profile.tier || '' },
    copy: {
      headline: 'Secure Your Account',
      body: `As a ${profile.tier} Status member, protect your points with two-factor authentication.`,
    },
    nextAction: {
      label: 'Enroll MFA',
      target: 'mfaEnrolled',
      delta: { mfaEnrolled: true },
    },
  };
}

function transferAbandonOffer({ st, nowSec }) {
  const draft = st.transferDraft;
  const lastTransferCompletedAt = st.lastTransferCompletedAt
    ? Number(st.lastTransferCompletedAt)
    : null;
  const justCompleted = lastTransferCompletedAt && nowSec - lastTransferCompletedAt <= RECENT_WINDOW_SEC;

  if (justCompleted) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'COMPLETED',
      ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
      reason: 'Transfer just completed',
      context: { hasDraft: false },
      copy: null,
      nextAction: null,
    };
  }

  if (!draft) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'HIDDEN',
      ruleId: null,
      reason: 'No transfer draft',
      context: { hasDraft: false },
      copy: null,
      nextAction: null,
    };
  }

  const lastUpdatedAt = Number(draft.lastUpdatedAt || 0);
  const isPending = nowSec - lastUpdatedAt <= RECENT_WINDOW_SEC;

  if (isPending) {
    return {
      surfaceId: 'TRANSFER_ABANDON_OFFER',
      state: 'PENDING',
      ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
      reason: 'Transfer draft active within last 60s',
      context: { hasDraft: true, lastUpdatedAt },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'TRANSFER_ABANDON_OFFER',
    state: 'SHOWN',
    ruleId: 'RULE#TRANSFER_ABANDON_OFFER',
    reason: 'Abandoned transfer draft detected',
    context: { hasDraft: true, lastUpdatedAt },
    copy: {
      headline: 'Pick Up Where You Left Off',
      body: 'Complete your transfer in the next 5 minutes and earn 2x bonus points.',
    },
    nextAction: {
      label: 'Continue transfer with 2x points bonus',
      target: 'flow.transfer',
      delta: { resume: true },
    },
  };
}

function bookingConfirmationOffer({ st, nowSec }) {
  const recentBookingAt = st.recentBookingAt ? Number(st.recentBookingAt) : null;
  const bookingOfferDismissedAt = st.bookingOfferDismissedAt
    ? Number(st.bookingOfferDismissedAt)
    : null;

  if (!recentBookingAt || nowSec - recentBookingAt > BOOKING_WINDOW_SEC) {
    return {
      surfaceId: 'BOOKING_CONFIRMATION_OFFER',
      state: 'HIDDEN',
      ruleId: null,
      reason: 'No recent booking',
      context: { hasRecentBooking: false },
      copy: null,
      nextAction: {
        label: 'Complete a booking',
        target: 'booking',
        delta: { trigger: true },
      },
    };
  }

  if (bookingOfferDismissedAt && bookingOfferDismissedAt > recentBookingAt) {
    return {
      surfaceId: 'BOOKING_CONFIRMATION_OFFER',
      state: 'COMPLETED',
      ruleId: 'RULE#POST_BOOKING_UPSELL',
      reason: 'Booking offer was dismissed',
      context: { hasRecentBooking: true },
      copy: null,
      nextAction: null,
    };
  }

  return {
    surfaceId: 'BOOKING_CONFIRMATION_OFFER',
    state: 'SHOWN',
    ruleId: 'RULE#POST_BOOKING_UPSELL',
    reason: 'Recent booking detected',
    context: { hasRecentBooking: true, recentBookingAt },
    copy: {
      headline: 'Thank You for Your Booking',
      body: 'Your stay is confirmed. Earn 500 bonus points when you add breakfast to your reservation.',
    },
    nextAction: null,
  };
}

module.exports = { evaluateSurfaces };
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd apps/backend && node --test src/engine/surfaces.test.js 2>&1
```

Expected: all tests pass with `ok` lines.

- [ ] **Step 5: Commit**

```bash
cd apps/backend && git add src/engine/surfaces.js src/engine/surfaces.test.js
git commit -m "feat(surfaces): add stateful surface evaluator engine module"
```

---

## Task 2: Wire evaluator into surfaceEligibility route (backend)

**Files:**
- Modify: `apps/backend/src/routes/customer.js`

Replace the inline evaluation in `surfaceEligibility` with a call to `evaluateSurfaces`. Keep the DDB reads; pass profile + state to the evaluator.

- [ ] **Step 1: Update the surfaceEligibility function**

In `apps/backend/src/routes/customer.js`, add the require at the top:

```javascript
const { evaluateSurfaces } = require('../engine/surfaces');
```

Replace the `surfaceEligibility` function body from after the `await requireBearer` call through to the return:

```javascript
async function surfaceEligibility(event, correlationId) {
  const userId = qparam(event, 'userId');
  await requireBearer(event, userId);
  const profile = await getUserById(userId);
  if (!profile) return err(404, correlationId, 'USER_NOT_FOUND', 'User not found');

  const state = (await getState(userId)) || {};
  const now = nowSec();

  const surfaces = evaluateSurfaces({ profile, state, nowSec: now });

  return json(200, correlationId, { data: { userId, surfaces } });
}
```

- [ ] **Step 2: Run backend tests to make sure nothing regressed**

```bash
cd apps/backend && npm test 2>&1
```

Expected: all existing tests pass. No new failures.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/routes/customer.js
git commit -m "refactor(surfaces): wire surfaceEligibility to the new evaluator"
```

---

## Task 3: Demo mutation endpoint (backend)

**Files:**
- Create: `apps/backend/src/routes/admin/demo-actions.js`
- Create: `apps/backend/src/routes/admin/demo-actions.test.js`
- Modify: `apps/backend/src/routes/admin/index.js`
- Modify: `apps/backend/src/handler.js`

The endpoint reads the incoming mutation, applies each field to UserProfile or UserState via UpdateCommand, then returns the post-mutation snapshot and writes a DEMO_EVENT.

Mutation field -> DDB mapping:
- `profileCompletion` -> UserProfile.profileCompletion (number) + write `profileCompletionReachedAt = nowSec` to UserState if new value >= 90 AND old value < 90 (also set `profileEditInProgress = false`)
- `tier` -> UserProfile.tier (string) + write `platinumReachedAt = nowSec` to UserState if new value == 'Platinum'
- `mfaEnrolled: true` -> UserProfile.mfaSecret = 'DEMO_MFA_SECRET' + write `mfaEnrolledAt = nowSec` to UserState
- `mfaEnrolled: false` -> UserProfile.mfaSecret = null (DELETE attribute)
- `loyaltyScore` -> UserProfile.loyaltyScore (number)
- `flow.transfer.abandon: true` -> UserState.transferDraft = { lastUpdatedAt: nowSec - 120 } (stale draft)
- `flow.transfer.resume: true` -> UserState.lastTransferCompletedAt = nowSec (clears draft too)
- `booking.trigger: true` -> UserState.recentBookingAt = nowSec

- [ ] **Step 1: Write failing tests**

```javascript
// apps/backend/src/routes/admin/demo-actions.test.js
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const VALID_ADMIN = Buffer.from('demoClient:demoSecret').toString('base64');
const VALID_AUTH = `Basic ${VALID_ADMIN}`;

function makeEvent(body, overrides = {}) {
  return {
    headers: { authorization: VALID_AUTH },
    body: JSON.stringify(body),
    queryStringParameters: null,
    requestContext: { http: { method: 'POST', path: '/admin/demo-actions/mutate-user' } },
    ...overrides,
  };
}

function fakeDdb() {
  const calls = [];
  const items = {
    UserProfile: {},
    UserState: {},
  };
  const client = {
    send: async (cmd) => {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === 'GetCommand') {
        const table = cmd.input.TableName;
        const key = Object.values(cmd.input.Key)[0];
        return { Item: items[table]?.[key] || null };
      }
      if (name === 'UpdateCommand' || name === 'PutCommand') {
        return {};
      }
      return {};
    },
    _items: items,
    _calls: calls,
  };
  return client;
}

describe('POST /admin/demo-actions/mutate-user', () => {
  let demoActions;
  let ddb;

  beforeEach(() => {
    ddb = fakeDdb();
    demoActions = (() => {
      // Clear module cache so setDdb is fresh per test.
      delete require.cache[require.resolve('./demo-actions')];
      delete require.cache[require.resolve('./shared')];
      const mod = require('./demo-actions');
      mod._setDdb(ddb);
      return mod;
    })();
  });

  test('returns 403 when no admin auth', async () => {
    const event = makeEvent(
      { userId: 'user001', mutation: { tier: 'Platinum' } },
      { headers: { authorization: 'Basic aGFja2VyOndyb25n' } }
    );
    const res = await demoActions.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 403);
  });

  test('returns 400 when userId missing', async () => {
    const event = makeEvent({ mutation: { tier: 'Platinum' } });
    const res = await demoActions.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 400);
  });

  test('returns 400 when mutation missing', async () => {
    const event = makeEvent({ userId: 'user001' });
    const res = await demoActions.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 400);
  });

  test('returns 200 with touched fields on valid mutation', async () => {
    ddb._items.UserProfile['user001'] = { userId: 'user001', tier: 'Gold', profileCompletion: 60 };
    ddb._items.UserState['user001'] = { userId: 'user001' };
    const event = makeEvent({ userId: 'user001', mutation: { tier: 'Platinum' } });
    const res = await demoActions.mutateDemoUser(event, 'cid');
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.touched);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd apps/backend && node --test src/routes/admin/demo-actions.test.js 2>&1 | head -10
```

Expected: `Error: Cannot find module './demo-actions'`

- [ ] **Step 3: Implement demo-actions.js**

```javascript
// apps/backend/src/routes/admin/demo-actions.js
'use strict';

const { UpdateCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');
const { getDdb, setDdb, nowSec, json, err, requireAdmin, CFG } = require('./shared');

function _setDdb(client) {
  setDdb(client);
}

/**
 * POST /admin/demo-actions/mutate-user
 *
 * Applies a mutation object to UserProfile and/or UserState, then returns
 * the post-mutation snapshot of touched fields and fires a DEMO_EVENT.
 *
 * Body: { userId: string, mutation: { ... } }
 */
async function mutateDemoUser(event, correlationId) {
  const authCheck = requireAdmin(event, correlationId);
  if (!authCheck.ok) return authCheck.response;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return err(400, correlationId, 'VALIDATION_ERROR', 'Invalid JSON body');
  }

  const { userId, mutation } = body;
  if (!userId || typeof userId !== 'string') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'userId is required');
  }
  if (!mutation || typeof mutation !== 'object') {
    return err(400, correlationId, 'VALIDATION_ERROR', 'mutation is required');
  }

  const ddb = getDdb();
  const now = nowSec();

  // Fetch current profile for before-state
  const profileRes = await ddb.send(
    new GetCommand({ TableName: CFG.tUserProfile, Key: { userId } })
  );
  const profile = profileRes.Item;
  if (!profile) {
    return err(404, correlationId, 'USER_NOT_FOUND', `User ${userId} not found`);
  }

  const stateRes = await ddb.send(
    new GetCommand({ TableName: CFG.tUserState, Key: { userId } })
  );
  const state = stateRes.Item || { userId };

  const touched = {};

  // Apply tier mutation
  if (mutation.tier !== undefined) {
    const oldTier = profile.tier;
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET #tier = :tier, updatedAt = :now',
        ExpressionAttributeNames: { '#tier': 'tier' },
        ExpressionAttributeValues: { ':tier': mutation.tier, ':now': now },
      })
    );
    touched.tier = { from: oldTier, to: mutation.tier };

    if (mutation.tier === 'Platinum') {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET platinumReachedAt = :t, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
    } else {
      // Reset platinumReachedAt when demoting away from Platinum
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'REMOVE platinumReachedAt SET updatedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      );
    }
  }

  // Apply loyaltyScore mutation
  if (mutation.loyaltyScore !== undefined) {
    const oldScore = profile.loyaltyScore || 0;
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET loyaltyScore = :score, updatedAt = :now',
        ExpressionAttributeValues: { ':score': Number(mutation.loyaltyScore), ':now': now },
      })
    );
    touched.loyaltyScore = { from: oldScore, to: Number(mutation.loyaltyScore) };
  }

  // Apply profileCompletion mutation
  if (mutation.profileCompletion !== undefined) {
    const oldCompletion = profile.profileCompletion || 0;
    const newCompletion = Number(mutation.profileCompletion);
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserProfile,
        Key: { userId },
        UpdateExpression: 'SET profileCompletion = :pc, updatedAt = :now',
        ExpressionAttributeValues: { ':pc': newCompletion, ':now': now },
      })
    );
    touched.profileCompletion = { from: oldCompletion, to: newCompletion };

    // Write profileCompletionReachedAt to UserState if crossing the 90% threshold
    if (newCompletion >= 90 && oldCompletion < 90) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression:
            'SET profileCompletionReachedAt = :t, profileEditInProgress = :false, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':false': false, ':now': now },
        })
      );
    } else {
      // Not crossing threshold - just clear edit-in-progress
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET profileEditInProgress = :false, updatedAt = :now',
          ExpressionAttributeValues: { ':false': false, ':now': now },
        })
      );
    }
  }

  // Apply mfaEnrolled mutation
  if (mutation.mfaEnrolled !== undefined) {
    if (mutation.mfaEnrolled === true) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserProfile,
          Key: { userId },
          UpdateExpression: 'SET mfaSecret = :secret, updatedAt = :now',
          ExpressionAttributeValues: { ':secret': 'DEMO_MFA_SECRET', ':now': now },
        })
      );
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET mfaEnrolledAt = :t, updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
      touched.mfaEnrolled = { from: !!profile.mfaSecret, to: true };
    } else {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserProfile,
          Key: { userId },
          UpdateExpression: 'REMOVE mfaSecret SET updatedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      );
      touched.mfaEnrolled = { from: !!profile.mfaSecret, to: false };
    }
  }

  // Apply flow.transfer mutations
  if (mutation.flow?.transfer) {
    const tf = mutation.flow.transfer;
    if (tf.abandon === true) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression: 'SET transferDraft = :draft, updatedAt = :now',
          ExpressionAttributeValues: {
            ':draft': { lastUpdatedAt: now - 120 },
            ':now': now,
          },
        })
      );
      touched.transferDraft = { from: state.transferDraft || null, to: 'stale_draft' };
    }
    if (tf.resume === true) {
      await ddb.send(
        new UpdateCommand({
          TableName: CFG.tUserState,
          Key: { userId },
          UpdateExpression:
            'SET lastTransferCompletedAt = :t REMOVE transferDraft SET updatedAt = :now',
          ExpressionAttributeValues: { ':t': now, ':now': now },
        })
      );
      touched.transferCompleted = { from: null, to: now };
    }
  }

  // Apply booking.trigger mutation
  if (mutation.booking?.trigger === true) {
    await ddb.send(
      new UpdateCommand({
        TableName: CFG.tUserState,
        Key: { userId },
        UpdateExpression: 'SET recentBookingAt = :t REMOVE bookingOfferDismissedAt SET updatedAt = :now',
        ExpressionAttributeValues: { ':t': now, ':now': now },
      })
    );
    touched.recentBooking = { from: null, to: now };
  }

  // Publish DEMO_EVENT to UserActivity
  const activityId = `DEMO#${randomUUID()}`;
  await ddb.send(
    new PutCommand({
      TableName: CFG.tUserActivity,
      Item: {
        activityId,
        activityType: 'DEMO_EVENT',
        type: 'USER_MUTATION',
        actor: 'demo-panel',
        payload: { userId, mutation, touched },
        timestamp: now,
        createdAt: now,
      },
    })
  );

  return json(200, correlationId, {
    data: { userId, touched, activityId, mutatedAt: now },
  });
}

module.exports = { mutateDemoUser, _setDdb };
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && node --test src/routes/admin/demo-actions.test.js 2>&1
```

Expected: all tests pass.

- [ ] **Step 5: Export from admin barrel and wire into handler**

In `apps/backend/src/routes/admin/index.js`, add:

```javascript
const { mutateDemoUser } = require('./demo-actions');
```

And in module.exports add: `mutateDemoUser`.

In `apps/backend/src/handler.js`, add the import at the top:

```javascript
// after existing admin import
```

In the route table, add after the `writeDemoEvent` lines:

```javascript
if (method === 'POST' && p === '/admin/demo-actions/mutate-user')
  return admin.mutateDemoUser(event, correlationId);
```

- [ ] **Step 6: Run all backend tests**

```bash
cd apps/backend && npm test 2>&1
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/admin/demo-actions.js apps/backend/src/routes/admin/demo-actions.test.js apps/backend/src/routes/admin/index.js apps/backend/src/handler.js
git commit -m "feat(admin): add demo mutation endpoint for live state flipping"
```

---

## Task 4: TypeScript types (frontend)

**Files:**
- Modify: `apps/frontend/lib/hotel/surface-types.ts`

Replace `eligible: boolean` with the new state/nextAction fields. Keep `SurfaceMap` keyed by surfaceId.

- [ ] **Step 1: Update surface-types.ts**

```typescript
export interface SurfaceCopy {
  headline: string;
  body: string;
}

export type SurfaceState = 'SHOWN' | 'HIDDEN' | 'PENDING' | 'COMPLETED';

export type NextActionTarget =
  | 'profileCompletion'
  | 'tier'
  | 'mfaEnrolled'
  | 'flow.transfer'
  | 'booking';

export interface NextAction {
  label: string;
  target: NextActionTarget;
  delta?: Record<string, unknown>;
}

export interface PrestigeAdvanceContext {
  pointsToNextTier: number;
  currentTier: string;
  nextTier: string;
}

export interface CatalystElevateContext {
  profileCompletion: number;
  currentTier: string;
  nextTier: string;
}

export interface MfaEnrollmentContext {
  hasMfa: boolean;
  currentTier: string;
}

export interface TransferAbandonContext {
  hasDraft: boolean;
  lastUpdatedAt?: number;
}

export interface BookingContext {
  hasRecentBooking: boolean;
  recentBookingAt?: number;
}

export type SurfaceContext =
  | PrestigeAdvanceContext
  | CatalystElevateContext
  | MfaEnrollmentContext
  | TransferAbandonContext
  | BookingContext;

export interface SurfaceEvaluation {
  surfaceId: string;
  state: SurfaceState;
  ruleId: string | null;
  context: SurfaceContext;
  copy: SurfaceCopy | null;
  reason: string;
  nextAction: NextAction | null;
}

export interface SurfaceEligibilityResponse {
  userId: string;
  surfaces: SurfaceEvaluation[];
}

/** Keyed lookup returned by useSurfaceEligibility */
export type SurfaceMap = Record<string, SurfaceEvaluation>;
```

- [ ] **Step 2: Run frontend typecheck**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1
```

Expected: errors referencing `s.eligible` in DemoPanel.tsx and any card components. These will be fixed in Task 5.

- [ ] **Step 3: Do not commit yet** - wait for Task 5 so the commit includes type + UI fixes together.

---

## Task 5: Frontend API call and DemoPanel (frontend)

**Files:**
- Modify: `apps/frontend/lib/hotel/customer-api.ts`
- Modify: `apps/frontend/components/hotel/DemoPanel.tsx`

### Part A: customer-api.ts addition

Add after the existing `fetchSurfaceEligibility` function:

```typescript
export interface UserMutation {
  profileCompletion?: number;
  tier?: 'Silver' | 'Gold' | 'Platinum';
  mfaEnrolled?: boolean;
  loyaltyScore?: number;
  flow?: { transfer?: { resume?: boolean; abandon?: boolean } };
  booking?: { trigger?: boolean };
}

export interface MutateUserResult {
  userId: string;
  touched: Record<string, { from: unknown; to: unknown }>;
  activityId: string;
  mutatedAt: number;
}

export function mutateDemoUser(
  userId: string,
  mutation: UserMutation
): Promise<ApiResult<MutateUserResult>> {
  return apiFetch<MutateUserResult>('/admin/demo-actions/mutate-user', {
    method: 'POST',
    body: JSON.stringify({ userId, mutation }),
  });
}
```

Note: `apiFetch` already adds Basic Auth via `buildAuthHeader`, so no token param needed for admin calls.

### Part B: DemoPanel.tsx changes

Key changes to DemoPanel:

1. Import `mutateDemoUser` and `UserMutation` from customer-api.
2. Add `mutating` state: `const [mutating, setMutating] = useState<string | null>(null)`.
3. Add `mutateAndRefetch` helper function.
4. Replace the `s.eligible ? 'SHOWN' : 'HIDDEN'` pill with a state-based color pill.
5. Add nextAction button per surface.
6. Add Quick Mutations row above the surface list.

State to pill color mapping:
- SHOWN: `bg-emerald-100 text-emerald-700`
- HIDDEN: `bg-gray-100 text-gray-500`
- PENDING: `bg-amber-100 text-amber-700`
- COMPLETED: `bg-blue-100 text-blue-700`

- [ ] **Step 1: Add mutateDemoUser to customer-api.ts**

Find the end of `customer-api.ts` and append the `UserMutation`, `MutateUserResult` interfaces and the `mutateDemoUser` function shown above.

- [ ] **Step 2: Update DemoPanel.tsx**

Replace the Surface Eligibility section (lines 462-522 in the current file) with the new implementation below. Also add the `mutating` state and `mutateAndRefetch` helper near the top of the component.

Add these near the other state declarations (around line 66):

```typescript
const [mutating, setMutating] = useState<string | null>(null);
```

Add this helper function after `handleResetAll`:

```typescript
async function mutateAndRefetch(key: string, mutation: UserMutation) {
  if (!session?.userId) return;
  setMutating(key);
  try {
    await mutateDemoUser(session.userId, mutation);
  } finally {
    setMutating(null);
    refetchSurfaces();
  }
}
```

Replace the entire Surface Eligibility section with:

```tsx
{isLoggedIn && (
  <section className="border-t border-gray-100 pt-3">
    <button
      type="button"
      onClick={() => setEligibilityOpen((v) => !v)}
      className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#775a19] mb-2 font-sans"
    >
      <span>Surface Eligibility</span>
      {eligibilityOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </button>

    {eligibilityOpen && (
      <div className="space-y-2">
        {/* Quick Mutations */}
        <div className="bg-[#ffdea5]/20 border border-[#ffdea5] p-2 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#775a19] font-sans">
            Quick Mutations
          </p>
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={mutating !== null}
              onClick={() => mutateAndRefetch('platinum', { tier: 'Platinum', loyaltyScore: 1000 })}
              className="text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] px-2 py-1 hover:bg-[#775a19] hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutating === 'platinum' ? '...' : 'Make Platinum'}
            </button>
            <button
              type="button"
              disabled={mutating !== null}
              onClick={() => mutateAndRefetch('complete-profile', { profileCompletion: 95 })}
              className="text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] px-2 py-1 hover:bg-[#775a19] hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutating === 'complete-profile' ? '...' : 'Complete Profile'}
            </button>
            <button
              type="button"
              disabled={mutating !== null}
              onClick={() =>
                mutateAndRefetch('reset-gold', { tier: 'Gold', profileCompletion: 50, loyaltyScore: 500 })
              }
              className="text-[9px] font-bold uppercase tracking-wider border border-black text-black px-2 py-1 hover:bg-black hover:text-white transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutating === 'reset-gold' ? '...' : 'Reset Gold + 50%'}
            </button>
          </div>
        </div>

        {Object.keys(surfaces).length === 0 && !surfacesLoading && (
          <p className="text-[9px] text-gray-400 font-sans">
            No data yet. Log in to evaluate surfaces.
          </p>
        )}
        {surfacesLoading && (
          <p className="text-[9px] text-gray-400 font-sans">Loading...</p>
        )}
        {Object.values(surfaces).map((s) => {
          const statePill: Record<string, string> = {
            SHOWN: 'bg-emerald-100 text-emerald-700',
            HIDDEN: 'bg-gray-100 text-gray-500',
            PENDING: 'bg-amber-100 text-amber-700',
            COMPLETED: 'bg-blue-100 text-blue-700',
          };
          const pillClass = statePill[s.state] ?? 'bg-gray-100 text-gray-500';
          return (
            <div
              key={s.surfaceId}
              className="bg-white border border-gray-100 p-2.5 text-[10px] font-sans space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-gray-600 break-all">
                  {s.surfaceId}
                </span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-wider ${pillClass}`}
                >
                  {s.state}
                </span>
              </div>
              <p className="text-gray-500 text-[9px]">
                rule:{' '}
                <span className="font-mono text-gray-700">
                  {s.ruleId ?? 'no rule matched'}
                </span>
              </p>
              <p className="text-gray-400 text-[9px] leading-snug">{s.reason}</p>
              {s.nextAction && (
                <button
                  type="button"
                  disabled={mutating !== null}
                  onClick={() =>
                    mutateAndRefetch(
                      `${s.surfaceId}-action`,
                      s.nextAction!.delta as UserMutation ?? {}
                    )
                  }
                  className="w-full text-[9px] font-bold uppercase tracking-wider border border-[#775a19] text-[#775a19] py-1 hover:bg-[#ffdea5]/30 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mutating === `${s.surfaceId}-action` ? '...' : s.nextAction.label}
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          disabled={surfacesLoading}
          onClick={refetchSurfaces}
          className="w-full text-[10px] font-bold uppercase tracking-widest border border-[#775a19] text-[#775a19] py-1.5 hover:bg-[#ffdea5]/30 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {surfacesLoading ? 'Evaluating...' : 'Re-evaluate'}
        </button>
      </div>
    )}
  </section>
)}
```

- [ ] **Step 3: Fix any remaining TypeScript errors from `eligible` references**

Search for `s.eligible` in the codebase:

```bash
grep -r "\.eligible" apps/frontend/src apps/frontend/components apps/frontend/app 2>/dev/null
```

For each card component that checks `eligible`, change `eligible` to `state === 'SHOWN'`.

- [ ] **Step 4: Run typecheck**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 5: Run frontend build**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: build completes without error.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/hotel/surface-types.ts apps/frontend/lib/hotel/customer-api.ts apps/frontend/components/hotel/DemoPanel.tsx
git commit -m "feat(demo-panel): stateful surface pills, nextAction buttons, quick mutations"
```

---

## Task 6: Seed the new engagement rules

**Files:**
- Modify: `seed_data/EngagementRules_batch_1.json`

Add two new PutRequest objects to the `EngagementRules` array.

- [ ] **Step 1: Append to EngagementRules_batch_1.json**

Add before the closing `]` of the `EngagementRules` array:

```json
,
{
  "PutRequest": {
    "Item": {
      "ruleId": { "S": "RULE#MFA_ENROLLMENT_GAP" },
      "version": { "S": "latest" },
      "status": { "S": "ACTIVE" },
      "name": { "S": "MFA not enrolled for high-tier member" },
      "definition": {
        "M": {
          "conditions": {
            "M": {
              "all": {
                "L": [
                  { "M": { "fact": { "S": "signal" }, "operator": { "S": "equal" }, "value": { "S": "mfa_gap" } } },
                  { "M": { "fact": { "S": "mfaSecret" }, "operator": { "S": "equal" }, "value": { "S": "null" } } },
                  { "M": { "fact": { "S": "tier" }, "operator": { "S": "in" }, "value": { "S": "Gold,Platinum" } } }
                ]
              }
            }
          },
          "event": {
            "M": {
              "type": { "S": "MFA_ENROLLMENT_GAP" },
              "params": {
                "M": {
                  "action": { "S": "NUDGE" },
                  "surface": { "S": "inline_card" },
                  "score": { "N": "65" },
                  "copy": { "S": "Protect your points balance with two-factor authentication." }
                }
              }
            }
          }
        }
      },
      "createdAt": { "N": "1748500000" },
      "updatedAt": { "N": "1748500000" }
    }
  }
},
{
  "PutRequest": {
    "Item": {
      "ruleId": { "S": "RULE#POST_BOOKING_UPSELL" },
      "version": { "S": "latest" },
      "status": { "S": "ACTIVE" },
      "name": { "S": "Post-booking upsell offer" },
      "definition": {
        "M": {
          "conditions": {
            "M": {
              "all": {
                "L": [
                  { "M": { "fact": { "S": "signal" }, "operator": { "S": "equal" }, "value": { "S": "booking_confirmed" } } }
                ]
              }
            }
          },
          "event": {
            "M": {
              "type": { "S": "POST_BOOKING_UPSELL" },
              "params": {
                "M": {
                  "action": { "S": "OFFER" },
                  "surface": { "S": "offer_modal" },
                  "score": { "N": "60" },
                  "copy": { "S": "Earn 500 bonus points when you add breakfast to your reservation." }
                }
              }
            }
          }
        }
      },
      "createdAt": { "N": "1748500001" },
      "updatedAt": { "N": "1748500001" }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add seed_data/EngagementRules_batch_1.json
git commit -m "feat(seed): add MFA_ENROLLMENT_GAP and POST_BOOKING_UPSELL rules"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/backend && npm test 2>&1
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend typecheck**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Run frontend build**

```bash
cd apps/frontend && npm run build 2>&1 | tail -20
```

Expected: zero errors, build completes.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/stateful-surfaces-and-demo-actions
gh pr create --title "feat: stateful surfaces and demo mutation actions" --body "..."
```

---

## Self-review

### Spec coverage check

- Part A: surface evaluator with SHOWN/HIDDEN/PENDING/COMPLETED - covered in Tasks 1+2.
- Part A: 5 surfaces with correct state semantics - covered in Task 1 evaluator with all branches tested.
- Part B: `POST /admin/demo-actions/mutate-user` - covered in Task 3.
- Part B: Publish DEMO_EVENT - covered in demo-actions.js implementation.
- Part C: DemoPanel state pills with 4 colors - covered in Task 5.
- Part C: nextAction buttons - covered in Task 5.
- Part C: Quick Mutations row (3 presets) - covered in Task 5.
- Part D: Updated surface-types.ts - covered in Task 4.
- Part D: `use-surface-eligibility.ts` - no changes needed; hook already calls refetch correctly.
- Part D: Cards updated to check `state === 'SHOWN'` - covered in Task 5 step 3.
- Part E: 2 new seed rules - covered in Task 6.

### Placeholder scan

No TBDs. All code is complete in each step.

### Type consistency

- `SurfaceEvaluation.state: SurfaceState` defined in Task 4, used in Task 5.
- `NextAction.delta` typed as `Record<string, unknown>` in types; cast via `as UserMutation` at call site in DemoPanel.
- `evaluateSurfaces` returns `SurfaceResult[]` (backend JS) mapping to `SurfaceEvaluation[]` (frontend TS) - fields match: `surfaceId`, `state`, `ruleId`, `reason`, `context`, `copy`, `nextAction`.
- `mutateDemoUser` in customer-api.ts accepts `UserMutation` which matches the server body shape.
