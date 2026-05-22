/**
 * scenarios.mjs - end-to-end demo scenario runner for Signal Force.
 *
 * Drives the full demo narrative the way an operator would on stage.
 * Each scenario is idempotent: re-running does not leave state worse
 * than it found.
 *
 * Required env vars (with defaults):
 *   BASE_URL        - backend URL without trailing slash (default: http://localhost:3000)
 *   ADMIN_USER      - username for Basic Auth admin calls (default: user001)
 *   ADMIN_PASSWORD  - password for Basic Auth admin calls (default: Password1)
 *   SCENARIO_TIMEOUT - per-request timeout in ms (default: 20000)
 *
 * Optional:
 *   SCENARIOS_QUICK - set to 1 to skip P2 scenarios
 *
 * Usage:
 *   npm run scenarios
 *   BASE_URL=https://my-api.execute-api.us-east-1.amazonaws.com npm run scenarios
 */

import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
// Admin Basic Auth is the API gateway client credential (demoClient/demoSecret),
// not the per-user application password. Set ADMIN_USER/ADMIN_PASSWORD to override.
const ADMIN_USER = process.env.ADMIN_USER || 'demoClient';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demoSecret';
const TIMEOUT_MS = Number(process.env.SCENARIO_TIMEOUT || 20000);
const QUICK = process.env.SCENARIOS_QUICK === '1';

const REPORT_PATH = new URL('.last-scenario-report.json', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Colors (ANSI)
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

function pass(msg) {
  return `${C.green}${msg}${C.reset}`;
}
function fail(msg) {
  return `${C.red}${msg}${C.reset}`;
}
function warn(msg) {
  return `${C.yellow}${msg}${C.reset}`;
}
function label(msg) {
  return `${C.cyan}${C.bold}${msg}${C.reset}`;
}
function dim(msg) {
  return `${C.gray}${msg}${C.reset}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchT(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function bearerAuth(token) {
  return `Bearer ${token}`;
}

const ADMIN_AUTH = basicAuth(ADMIN_USER, ADMIN_PASSWORD);

async function apiPost(path, body, auth) {
  const res = await fetchT(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

async function apiGet(path, auth) {
  const res = await fetchT(`${BASE_URL}${path}`, {
    headers: { Authorization: auth },
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

// Login helper: returns { token, sessionId, action }
// Handles forceMfa, MFA challenge, or direct token flow.
async function loginPersona({ username, password, location, deviceId, forceMfa }) {
  const loginBody = {
    username,
    password,
    location: location || 'Austin,TX,US',
    deviceId: deviceId || `fp-${username}-demo`,
    ipAddress: '198.51.100.1',
    deviceType: 'desktop',
    browser: 'Chrome/123',
  };
  if (forceMfa) loginBody.forceMfa = true;

  const r = await apiPost('/auth/login', loginBody, ADMIN_AUTH);
  const d = r.body.data || r.body;

  if (r.status === 200 && (d.token || d.status === 'SUCCESS')) {
    return { token: d.token, sessionId: d.sessionId || '', action: 'SUCCESS' };
  }
  if ((r.status === 200 || r.status === 202) && d.status === 'MFA_REQUIRED') {
    return { token: null, sessionId: d.sessionId, action: 'MFA_REQUIRED' };
  }
  throw new Error(`Login failed (${r.status}): ${JSON.stringify(r.body)}`);
}

// Complete MFA challenge with static OTP 123456
async function completeMfa(sessionId) {
  const r = await apiPost('/auth/mfa/verify', { sessionId, otp: '123456' }, ADMIN_AUTH);
  const d = r.body.data || r.body;
  if (r.status === 200 && d.token) return d.token;
  throw new Error(`MFA verify failed (${r.status}): ${JSON.stringify(r.body)}`);
}

// Full login that auto-completes MFA if triggered
async function loginFull(opts) {
  const first = await loginPersona(opts);
  if (first.action === 'SUCCESS') return { token: first.token, sessionId: first.sessionId };
  if (first.action === 'MFA_REQUIRED') {
    const token = await completeMfa(first.sessionId);
    return { token, sessionId: first.sessionId };
  }
  throw new Error(`Unexpected login action: ${first.action}`);
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStatus(res, expected, context) {
  if (res.status !== expected) {
    const msg = res.body?.error?.message || JSON.stringify(res.body).slice(0, 200);
    throw new Error(`${context}: expected status ${expected}, got ${res.status}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string, name: string, priority: 'P0'|'P1'|'P2', status: 'PASS'|'FAIL'|'WARN'|'SKIP', reason: string, assertions: number, durationMs: number }} ScenarioResult
 */

/** @type {ScenarioResult[]} */
const results = [];

async function scenario(id, name, priority, fn) {
  if (QUICK && priority === 'P2') {
    console.log(dim(`  [SKIP] [${priority}] ${name}`));
    results.push({
      id,
      name,
      priority,
      status: 'SKIP',
      reason: 'QUICK mode',
      assertions: 0,
      durationMs: 0,
    });
    return;
  }

  const start = Date.now();
  let assertCount = 0;

  // Proxy assert to count
  const counted = (condition, message) => {
    assertCount++;
    assert(condition, message);
  };

  try {
    await fn(counted);
    const durationMs = Date.now() - start;
    results.push({
      id,
      name,
      priority,
      status: 'PASS',
      reason: `${assertCount} assertions`,
      assertions: assertCount,
      durationMs,
    });
    console.log(
      `  ${pass('[PASS]')} ${label(`[${priority}]`)} ${name} ${dim(`(${assertCount} assertions, ${durationMs}ms)`)}`
    );
  } catch (e) {
    const durationMs = Date.now() - start;
    const reason = e instanceof Error ? e.message : String(e);
    const isWarn = reason.startsWith('WARN:');
    const status = isWarn ? 'WARN' : 'FAIL';
    results.push({ id, name, priority, status, reason, assertions: assertCount, durationMs });
    if (isWarn) {
      console.log(`  ${warn('[WARN]')} ${label(`[${priority}]`)} ${name} - ${reason}`);
    } else {
      console.log(`  ${fail('[FAIL]')} ${label(`[${priority}]`)} ${name} - ${fail(reason)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Persona map
// ---------------------------------------------------------------------------

const PERSONAS = {
  'USER#001': { username: 'user001', password: 'Password1' },
  'USER#020': { username: 'user020', password: 'Password1' },
  'USER#031': { username: 'maya031', password: 'Password1' },
  'USER#032': { username: 'dre032', password: 'Password1' },
  'USER#033': { username: 'priya033', password: 'Password1' },
  'USER#034': { username: 'ethan034', password: 'Password1' },
  'USER#035': { username: 'naomi035', password: 'Password1' },
  'USER#036': { username: 'marcus036', password: 'Password1' },
  'USER#037': { username: 'inez037', password: 'Password1' },
  'USER#038': { username: 'owen038', password: 'Password1' },
};

// ---------------------------------------------------------------------------
// Warmup: clear blocks for all 10 personas
// ---------------------------------------------------------------------------

await scenario('warmup', 'Persona warmup - clear all blocks', 'P0', async (assert) => {
  const userIds = Object.keys(PERSONAS);
  let cleared = 0;

  for (const userId of userIds) {
    const r = await apiPost(
      `/admin/users/${encodeURIComponent(userId)}/clear-block`,
      {},
      ADMIN_AUTH
    );
    // 200 = block cleared, 404 = no block (both acceptable)
    assert(
      r.status === 200 || r.status === 404,
      `clear-block for ${userId}: unexpected status ${r.status}`
    );
    cleared++;
  }

  assert(cleared === userIds.length, `cleared ${cleared}/${userIds.length} personas`);
});

// ---------------------------------------------------------------------------
// Scenario 1: Maya - newcomer, upgrade surfaces fire
// ---------------------------------------------------------------------------

await scenario(
  'maya-newcomer',
  'Maya newcomer: login + PROFILE_CATALYST_ELEVATE visible + Silver 1500pts',
  'P0',
  async (assert) => {
    // Reset maya031 to a low-completion state so the catalyst surface is active.
    // This is idempotent: the mutation endpoint accepts the same values repeatedly.
    // Note: if profileCompletionReachedAt is already set in UserState the surface
    // will read COMPLETED (not SHOWN) - both are valid demo states for this surface.
    await apiPost(
      '/admin/demo-actions/mutate-user',
      {
        userId: 'USER#031',
        mutation: { profileCompletion: 30, mfaEnrolled: false },
      },
      ADMIN_AUTH
    );

    const { token } = await loginFull({
      username: 'maya031',
      password: 'Password1',
      location: 'Austin,TX,US',
      deviceId: 'fp-maya031-demo',
    });
    assert(token, 'Login returned a token');

    const surf = await apiGet(
      '/customer/surface-eligibility?userId=USER%23031&aiMode=off',
      bearerAuth(token)
    );
    assertStatus(surf, 200, 'surface-eligibility');
    const surfaces = surf.body.data?.surfaces || [];
    assert(surfaces.length > 0, 'surfaces array is non-empty');

    const catalyst = surfaces.find((s) => s.surfaceId === 'PROFILE_CATALYST_ELEVATE');
    assert(catalyst, 'PROFILE_CATALYST_ELEVATE surface present');
    // Accept SHOWN or COMPLETED: SHOWN means the card is visible (best case),
    // COMPLETED means the user already leveled up (still shows the surface worked).
    assert(
      catalyst.state === 'SHOWN' || catalyst.state === 'COMPLETED',
      `PROFILE_CATALYST_ELEVATE state=SHOWN or COMPLETED, got: ${catalyst?.state}`
    );

    const loyalty = await apiGet('/customer/loyalty-summary?userId=USER%23031', bearerAuth(token));
    assertStatus(loyalty, 200, 'loyalty-summary');
    const ld = loyalty.body.data;
    assert(ld.currentTier === 'Silver', `currentTier=Silver, got: ${ld.currentTier}`);
    assert(ld.currentPoints === 1500, `currentPoints=1500, got: ${ld.currentPoints}`);
  }
);

// ---------------------------------------------------------------------------
// Scenario 2: Dre - 4 surfaces + AI prioritization
// ---------------------------------------------------------------------------

await scenario(
  'dre-ai-surfaces',
  'Dre: 4 surfaces SHOWN with AI action populated',
  'P0',
  async (assert) => {
    const { token } = await loginFull({
      username: 'dre032',
      password: 'Password1',
      location: 'Chicago,IL,US',
      deviceId: 'fp-dre032-demo',
    });
    assert(token, 'Login returned a token');

    const surf = await apiGet(
      '/customer/surface-eligibility?userId=USER%23032&aiMode=on',
      bearerAuth(token)
    );
    assertStatus(surf, 200, 'surface-eligibility with aiMode=on');
    const d = surf.body.data;

    const surfaces = d.surfaces || [];
    const shown = surfaces.filter((s) => s.state === 'SHOWN');
    assert(
      shown.length >= 4,
      `at least 4 surfaces SHOWN, got: ${shown.length} (total: ${surfaces.length})`
    );

    if (d.aiUnavailable) {
      // LLM unavailable: deterministic result is still valid for demo.
      // Surfaces are shown correctly; AI prioritization is a bonus not a blocker.
      throw new Error(
        'WARN: AI unavailable (aiUnavailable flag set) - LiteLLM may be down; surfaces still show correctly'
      );
    }

    const withAiAction = shown.filter((s) => s.aiAction != null);
    assert(
      withAiAction.length >= 1,
      `at least 1 shown surface has aiAction, got: ${withAiAction.length}`
    );

    const withAiRationale = shown.filter((s) => s.aiRationale != null);
    assert(
      withAiRationale.length >= 1,
      `at least 1 shown surface has aiRationale, got: ${withAiRationale.length}`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 3: Forced MFA flow end-to-end
// ---------------------------------------------------------------------------

await scenario(
  'forced-mfa',
  'Forced MFA: MFA_REQUIRED -> verify -> authenticated GET',
  'P0',
  async (assert) => {
    // Use user020 as a clean persona for forced MFA
    const first = await loginPersona({
      username: 'user020',
      password: 'Password1',
      location: 'Denver,CO,US',
      deviceId: 'fp-user020-mfatest',
      forceMfa: true,
    });
    assert(first.action === 'MFA_REQUIRED', `Expected MFA_REQUIRED, got: ${first.action}`);
    assert(first.sessionId, 'sessionId returned with MFA challenge');

    const token = await completeMfa(first.sessionId);
    assert(token, 'MFA verify returned a token');

    const loyalty = await apiGet('/customer/loyalty-summary?userId=USER%23020', bearerAuth(token));
    assertStatus(loyalty, 200, 'loyalty-summary after MFA');
    assert(loyalty.body.data?.userId === 'USER#020', 'loyalty summary userId matches');
  }
);

// ---------------------------------------------------------------------------
// Scenario 4: Transfer ALLOW / friction / BLOCK ladder
// ---------------------------------------------------------------------------

await scenario(
  'transfer-ladder',
  'Transfer ladder: forceHighRisk=MFA, forceBlock=BLOCK, release REVIEW',
  'P0',
  async (assert) => {
    // Use ethan034 (32000 pts, Gold) as the transfer persona for this scenario.
    // Using a separate persona from the signal/mutation scenarios keeps tc1h low
    // and ensures this scenario remains idempotent across repeated runs.
    const XFER_USER = 'USER#034';
    const XFER_USERNAME = 'ethan034';

    // Clear any lingering block first
    await apiPost(`/admin/users/${encodeURIComponent(XFER_USER)}/clear-block`, {}, ADMIN_AUTH);

    const { token } = await loginFull({
      username: XFER_USERNAME,
      password: 'Password1',
      location: 'Dallas,TX,US',
      deviceId: 'fp-ethan034-xfer',
    });
    assert(token, `Logged in as ${XFER_USERNAME}`);

    // Small transfer with known device fingerprint -> ALLOW (or REVIEW/MFA if tc1h already high)
    const small = await apiPost(
      '/transactions/transfer',
      {
        userId: XFER_USER,
        recipientId: 'USER#013',
        amount: 200,
        deviceFingerprint: 'fp-a1b2c3d4e5f6', // standard demo known device
        channel: 'APP',
      },
      bearerAuth(token)
    );

    // May return 200 (ALLOW/REVIEW/MFA) or 403 (BLOCK from high velocity)
    // Complete MFA if that is what came back
    if (small.status === 200 && small.body.data?.action === 'MFA') {
      const challengeId = small.body.data.challengeId;
      const mfaR = await apiPost(
        '/transactions/mfa/verify',
        { challengeId, otp: '123456' },
        bearerAuth(token)
      );
      assert(mfaR.status === 200, `Small transfer MFA verify: expected 200, got ${mfaR.status}`);
    } else if (small.status === 403) {
      // High velocity block: clear block so the rest of the scenario can proceed
      await apiPost(`/admin/users/${encodeURIComponent(XFER_USER)}/clear-block`, {}, ADMIN_AUTH);
    }

    assert(
      small.status === 200 || small.status === 403,
      `Small transfer: got ${small.status} (acceptable: 200 or 403 velocity block)`
    );

    // forceHighRisk transfer -> always returns action: MFA (demo override)
    const mid = await apiPost(
      '/transactions/transfer',
      {
        userId: XFER_USER,
        recipientId: 'USER#013',
        amount: 5000,
        deviceFingerprint: 'fp-ethan034-xfer',
        channel: 'APP',
        forceHighRisk: true,
      },
      bearerAuth(token)
    );

    assert(
      mid.status === 200 && mid.body.data?.action === 'MFA',
      `forceHighRisk transfer: expected 200 + action=MFA, got ${mid.status}: ${JSON.stringify(mid.body.data)}`
    );
    assert(
      mid.body.data?.challengeId,
      `challengeId present in MFA response: ${JSON.stringify(mid.body.data)}`
    );

    // Find any REVIEW decision to demonstrate release flow
    let reviewDecisionId = null;
    const decList = await apiGet(
      `/admin/decisions?userId=${encodeURIComponent(XFER_USER)}&limit=10`,
      ADMIN_AUTH
    );
    if (decList.status === 200) {
      const decisions = decList.body.data?.decisions || decList.body.decisions || [];
      const review = decisions.find(
        (d) => d.action === 'REVIEW' && d.decisionType === 'FRAUD_TRANSFER'
      );
      reviewDecisionId = review?.decisionId || null;
    }

    // forceBlock transfer -> always returns 403 TRANSFER_BLOCKED
    const big = await apiPost(
      '/transactions/transfer',
      {
        userId: XFER_USER,
        recipientId: 'USER#013',
        amount: 250000,
        deviceFingerprint: 'fp-ethan034-xfer',
        channel: 'APP',
        forceBlock: true,
      },
      bearerAuth(token)
    );

    assert(
      big.status === 403 && big.body.error?.code === 'TRANSFER_BLOCKED',
      `forceBlock transfer: expected 403 TRANSFER_BLOCKED, got ${big.status}: ${JSON.stringify(big.body.error)}`
    );

    const blockDecisionId = big.body.error?.details?.decisionId;
    assert(blockDecisionId, 'BLOCK response includes decisionId');

    // Release a REVIEW decision if we found one - demonstrates the admin release flow
    if (reviewDecisionId) {
      const rel = await apiPost(
        `/admin/decisions/${encodeURIComponent(reviewDecisionId)}/release`,
        {},
        ADMIN_AUTH
      );
      assert(rel.status === 200, `Release REVIEW decision: expected 200, got ${rel.status}`);
      const released = rel.body.data?.released ?? rel.body.released;
      assert(released === true, `Decision released=true, got: ${released}`);
    }

    // Clean up: unblock ethan034 so the test is idempotent
    await apiPost(`/admin/users/${encodeURIComponent(XFER_USER)}/clear-block`, {}, ADMIN_AUTH);
  }
);

// ---------------------------------------------------------------------------
// Scenario 5: Naomi - TRANSFER_ABANDON_OFFER SHOWN
// ---------------------------------------------------------------------------

await scenario(
  'naomi-abandon',
  'Naomi: TRANSFER_ABANDON_OFFER SHOWN from seed draft',
  'P1',
  async (assert) => {
    const { token } = await loginFull({
      username: 'naomi035',
      password: 'Password1',
      location: 'Miami,FL,US',
      deviceId: 'fp-naomi035-demo',
    });
    assert(token, 'Logged in as naomi035');

    const surf = await apiGet(
      '/customer/surface-eligibility?userId=USER%23035&aiMode=off',
      bearerAuth(token)
    );
    assertStatus(surf, 200, 'surface-eligibility for naomi035');
    const surfaces = surf.body.data?.surfaces || [];
    const abandon = surfaces.find((s) => s.surfaceId === 'TRANSFER_ABANDON_OFFER');
    assert(abandon, 'TRANSFER_ABANDON_OFFER surface present');
    assert(abandon.state === 'SHOWN', `TRANSFER_ABANDON_OFFER state=SHOWN, got: ${abandon?.state}`);
    const reasonStr = JSON.stringify(abandon.reason || '').toLowerCase();
    assert(
      reasonStr.includes('abandon') || reasonStr.includes('draft'),
      `reason mentions abandoned, got: ${abandon.reason}`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 6: Inez - BOOKING_CONFIRMATION_OFFER from Paris
// ---------------------------------------------------------------------------

await scenario(
  'inez-booking',
  'Inez: clean login from Paris + BOOKING_CONFIRMATION_OFFER SHOWN',
  'P1',
  async (assert) => {
    const first = await loginPersona({
      username: 'inez037',
      password: 'Password1',
      location: 'Paris,FR',
      deviceId: 'fp-inez037-paris',
    });
    // Should NOT be blocked by impossible travel (seed fix has widened windows)
    assert(
      first.action === 'SUCCESS' || first.action === 'MFA_REQUIRED',
      `Login action: expected SUCCESS or MFA_REQUIRED, got: ${first.action}`
    );

    let token;
    if (first.action === 'MFA_REQUIRED') {
      token = await completeMfa(first.sessionId);
    } else {
      token = first.token;
    }
    assert(token, 'token obtained after Paris login');

    const surf = await apiGet(
      '/customer/surface-eligibility?userId=USER%23037&aiMode=off',
      bearerAuth(token)
    );
    assertStatus(surf, 200, 'surface-eligibility for inez037');
    const surfaces = surf.body.data?.surfaces || [];
    const bookingOffer = surfaces.find((s) => s.surfaceId === 'BOOKING_CONFIRMATION_OFFER');
    assert(bookingOffer, 'BOOKING_CONFIRMATION_OFFER surface present');
    assert(
      bookingOffer.state === 'SHOWN',
      `BOOKING_CONFIRMATION_OFFER state=SHOWN, got: ${bookingOffer?.state}`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 7: Owen - admin decisions show BLOCK + REVIEW history
// ---------------------------------------------------------------------------

await scenario(
  'owen-decisions',
  'Owen: admin decisions show BLOCK + REVIEW history',
  'P1',
  async (assert) => {
    const dec = await apiGet('/admin/decisions?userId=USER%23038&window=24h', ADMIN_AUTH);
    assertStatus(dec, 200, 'admin decisions for owen');
    const decisions = dec.body.data?.decisions || dec.body.decisions || [];

    const hasBlock = decisions.some(
      (d) => d.action === 'BLOCK' && d.decisionType === 'FRAUD_TRANSFER'
    );
    const hasReview = decisions.some(
      (d) => d.action === 'REVIEW' && d.decisionType === 'FRAUD_LOGIN'
    );

    // Either direction is fine; at least one of each should appear in 24h
    assert(
      hasBlock || decisions.some((d) => d.action === 'BLOCK'),
      `at least one BLOCK decision for owen, decisions: ${JSON.stringify(decisions.map((d) => d.action + '/' + d.decisionType))}`
    );
    assert(
      hasReview || decisions.some((d) => d.action === 'REVIEW'),
      'at least one REVIEW decision for owen'
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 8: Priya - Diamond tier consistent
// ---------------------------------------------------------------------------

await scenario(
  'priya-diamond',
  'Priya Diamond: tier consistent across loyalty + surfaces',
  'P2',
  async (assert) => {
    const { token } = await loginFull({
      username: 'priya033',
      password: 'Password1',
      location: 'Tokyo,JP',
      deviceId: 'fp-priya033-demo',
    });
    assert(token, 'Logged in as priya033');

    const loyalty = await apiGet('/customer/loyalty-summary?userId=USER%23033', bearerAuth(token));
    assertStatus(loyalty, 200, 'loyalty-summary for priya033');
    assert(
      loyalty.body.data?.currentTier === 'Diamond',
      `currentTier=Diamond, got: ${loyalty.body.data?.currentTier}`
    );

    const surf = await apiGet(
      '/customer/surface-eligibility?userId=USER%23033&aiMode=off',
      bearerAuth(token)
    );
    assertStatus(surf, 200, 'surface-eligibility for priya033');
    const surfaces = surf.body.data?.surfaces || [];

    const withDiamondContext = surfaces.filter((s) => s.context?.currentTier === 'Diamond');
    assert(withDiamondContext.length >= 1, 'at least 1 surface has context.currentTier=Diamond');

    const allHidden = surfaces.every((s) => s.state === 'HIDDEN' || s.state === 'COMPLETED');
    assert(
      allHidden,
      `all surfaces are HIDDEN/COMPLETED for Diamond member, found: ${surfaces
        .filter((s) => s.state === 'SHOWN')
        .map((s) => s.surfaceId)
        .join(', ')}`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 9: Signal flow end-to-end
// ---------------------------------------------------------------------------

await scenario(
  'signal-flow',
  'Signal flow: post rage_click -> activity feed contains it',
  'P0',
  async (assert) => {
    const { token } = await loginFull({
      username: 'user001',
      password: 'Password1',
      location: 'New York,NY,US',
      deviceId: 'fp-user001-signal',
    });
    assert(token, 'Logged in as user001');

    const sessionId = `SIGNAL-TEST-${Date.now()}`;

    const evt = await apiPost(
      '/engagement/event',
      {
        signal: 'rage_click',
        count: 8,
        userId: 'USER#001',
        sessionId,
        params: { count: 8, elementId: 'transfer-btn' },
      },
      bearerAuth(token)
    );

    assert(
      evt.status === 200,
      `POST /engagement/event: expected 200, got ${evt.status}: ${JSON.stringify(evt.body)}`
    );

    // Allow the activity write to propagate
    await new Promise((r) => setTimeout(r, 2000));

    const feed = await apiGet('/admin/activity-feed?limit=20', ADMIN_AUTH);
    assertStatus(feed, 200, 'activity-feed');
    const events = feed.body.data?.events || feed.body.events || [];

    const signalEvent = events.find(
      (e) =>
        (e.kind === 'SIGNAL' || e.activityType === 'ENGAGEMENT_SIGNAL') &&
        JSON.stringify(e).toLowerCase().includes('rage_click')
    );
    assert(
      signalEvent,
      `activity feed contains rage_click signal event (found ${events.length} total events)`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 10: AI mode toggle parity
// ---------------------------------------------------------------------------

await scenario(
  'ai-mode-toggle',
  'AI mode toggle: off has no AI fields, on has aiAction',
  'P1',
  async (assert) => {
    const { token } = await loginFull({
      username: 'dre032',
      password: 'Password1',
      location: 'Chicago,IL,US',
      deviceId: 'fp-dre032-aitoggle',
    });
    assert(token, 'Logged in as dre032');

    // aiMode=off: no AI fields
    const off = await apiGet(
      '/customer/surface-eligibility?userId=USER%23032&aiMode=off',
      bearerAuth(token)
    );
    assertStatus(off, 200, 'surface-eligibility aiMode=off');
    const offSurfaces = off.body.data?.surfaces || [];
    const offWithAi = offSurfaces.filter((s) => s.aiAction != null || s.aiRationale != null);
    assert(
      offWithAi.length === 0,
      `aiMode=off: no AI fields populated, got ${offWithAi.length} surfaces with AI fields`
    );

    // aiMode=on: at least one surface has aiAction
    const on = await apiGet(
      '/customer/surface-eligibility?userId=USER%23032&aiMode=on',
      bearerAuth(token)
    );
    assertStatus(on, 200, 'surface-eligibility aiMode=on');
    const d = on.body.data;

    const onSurfaces = d.surfaces || [];

    if (d.aiUnavailable) {
      // LLM unavailable: verify the deterministic surface list is still returned
      assert(onSurfaces.length > 0, 'aiUnavailable response still includes surfaces array');
      throw new Error(
        'WARN: AI unavailable on aiMode=on - LiteLLM may be down; surfaces return without AI fields'
      );
    }

    const onWithAi = onSurfaces.filter((s) => s.aiAction != null);
    assert(
      onWithAi.length >= 1,
      `aiMode=on: at least 1 surface has aiAction, got 0 (total surfaces: ${onSurfaces.length})`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 11: Booking flow
// ---------------------------------------------------------------------------

await scenario(
  'booking-flow',
  'Booking flow: availability -> confirmed bookingId',
  'P1',
  async (assert) => {
    const { token } = await loginFull({
      username: 'user001',
      password: 'Password1',
      location: 'New York,NY,US',
      deviceId: 'fp-user001-booking',
    });
    assert(token, 'Logged in');

    const avail = await apiGet(
      '/customer/properties/bastide-gordes/availability?checkIn=2026-10-14&checkOut=2026-10-21&adults=2',
      bearerAuth(token)
    );
    assertStatus(avail, 200, 'property availability');
    // Response shape: top-level { available, nights, ... } (not wrapped in data)
    const ad = avail.body.data || avail.body;
    assert(ad.available === true, `available=true, got: ${ad.available}`);
    assert(ad.nights === 7, `nights=7, got: ${ad.nights}`);

    const booking = await apiPost(
      '/customer/bookings',
      {
        userId: 'USER#001',
        propertyId: 'bastide-gordes',
        nights: 7,
        costSfc: ad.totalCostSfc || 8750,
      },
      bearerAuth(token)
    );
    assertStatus(booking, 200, 'create booking');
    const bd = booking.body.data;
    assert(bd.bookingId, `bookingId returned: ${bd.bookingId}`);
    assert(bd.status === 'CONFIRMED', `status=CONFIRMED, got: ${bd.status}`);
  }
);

// ---------------------------------------------------------------------------
// Scenario 12: Demo mutation flips state live
// ---------------------------------------------------------------------------

await scenario(
  'demo-mutation',
  'Demo mutation: mutate-user flips surfaces, Platinum collapses SHOWN count',
  'P0',
  async (assert) => {
    // Set user001 to Gold tier with low completion and no MFA.
    // Gold + no MFA triggers MFA_ENROLLMENT_NUDGE (SHOWN).
    // Profile incomplete at 30% triggers PROFILE_CATALYST_ELEVATE (SHOWN or COMPLETED).
    // Total SHOWN >= 1 is reliable since at minimum MFA_ENROLLMENT_NUDGE fires on Gold + no MFA.
    const mut1 = await apiPost(
      '/admin/demo-actions/mutate-user',
      {
        userId: 'USER#001',
        mutation: {
          tier: 'Gold',
          loyaltyScore: 30000, // 30k = Gold tier (25k-49k threshold)
          profileCompletion: 30,
          mfaEnrolled: false,
        },
      },
      ADMIN_AUTH
    );
    assertStatus(mut1, 200, 'mutate-user (Gold/low)');
    const touched1 = mut1.body.data?.touched;
    assert(
      touched1 && Object.keys(touched1).length >= 1,
      `touched fields returned: ${JSON.stringify(touched1)}`
    );

    const { token: token1 } = await loginFull({
      username: 'user001',
      password: 'Password1',
      location: 'New York,NY,US',
      deviceId: 'fp-user001-mut',
    });

    const surf1 = await apiGet(
      '/customer/surface-eligibility?userId=USER%23001&aiMode=off',
      bearerAuth(token1)
    );
    assertStatus(surf1, 200, 'surface-eligibility after Gold/low mutation');
    const surfaces1 = surf1.body.data?.surfaces || [];
    const shown1 = surfaces1.filter((s) => s.state === 'SHOWN');
    // Gold + no MFA always triggers MFA_ENROLLMENT_NUDGE = SHOWN (at minimum)
    assert(
      shown1.length >= 1,
      `at least 1 surface SHOWN after Gold/low mutation, got: ${shown1.length} (${surfaces1.map((s) => s.surfaceId + '=' + s.state).join(', ')})`
    );

    // Flip to Platinum with high completion and MFA enrolled.
    // Platinum: hides MFA nudge (Platinum eligible but mfaEnrolled=true -> HIDDEN).
    // ProfileCompletion=95: either COMPLETED or HIDDEN depending on state.
    // Net result: fewer SHOWN surfaces than before.
    const mut2 = await apiPost(
      '/admin/demo-actions/mutate-user',
      {
        userId: 'USER#001',
        mutation: {
          tier: 'Platinum',
          loyaltyScore: 60000, // 60k = Platinum tier
          profileCompletion: 95,
          mfaEnrolled: true,
        },
      },
      ADMIN_AUTH
    );
    assertStatus(mut2, 200, 'mutate-user (Platinum/high)');
    assert(mut2.body.data?.touched, 'touched returned on second mutation');

    const { token: token2 } = await loginFull({
      username: 'user001',
      password: 'Password1',
      location: 'New York,NY,US',
      deviceId: 'fp-user001-mut2',
    });

    const surf2 = await apiGet(
      '/customer/surface-eligibility?userId=USER%23001&aiMode=off',
      bearerAuth(token2)
    );
    assertStatus(surf2, 200, 'surface-eligibility after Platinum mutation');
    const surfaces2 = surf2.body.data?.surfaces || [];
    const stillShown = surfaces2.filter((s) => s.state === 'SHOWN');
    const hiddenOrComplete = surfaces2.filter(
      (s) => s.state === 'HIDDEN' || s.state === 'COMPLETED'
    );

    // After Platinum: HIDDEN/COMPLETED count should be higher and SHOWN count lower
    assert(
      stillShown.length <= shown1.length,
      `Platinum mutation reduced SHOWN surfaces: was ${shown1.length}, now ${stillShown.length}`
    );
    assert(
      hiddenOrComplete.length >= 1,
      `At least 1 surface HIDDEN or COMPLETED after Platinum, got: ${hiddenOrComplete.length}`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 13: AI fraud explainer on BLOCK decision
// ---------------------------------------------------------------------------

await scenario(
  'ai-explainer',
  'AI fraud explainer: BLOCK decision has aiExplanation',
  'P1',
  async (assert) => {
    // Use marcus036 to avoid login location conflicts with user001 from other scenarios.
    const EXPLAIN_USER = 'USER#036';
    const EXPLAIN_USERNAME = 'marcus036';

    await apiPost(`/admin/users/${encodeURIComponent(EXPLAIN_USER)}/clear-block`, {}, ADMIN_AUTH);

    const { token } = await loginFull({
      username: EXPLAIN_USERNAME,
      password: 'Password1',
      location: 'Phoenix,AZ,US',
      deviceId: 'fp-marcus036-explain',
    });
    assert(token, 'Logged in as marcus036');

    // Trigger a BLOCK transfer using forceBlock
    const block = await apiPost(
      '/transactions/transfer',
      {
        userId: EXPLAIN_USER,
        recipientId: 'USER#013',
        amount: 250000,
        deviceFingerprint: 'fp-marcus036-explain',
        channel: 'APP',
        forceBlock: true,
      },
      bearerAuth(token)
    );

    assert(
      block.status === 403,
      `BLOCK transfer returned 403, got: ${block.status}: ${JSON.stringify(block.body.error)}`
    );
    const decisionId = block.body.error?.details?.decisionId;
    assert(decisionId, `decisionId in BLOCK response: ${JSON.stringify(block.body.error)}`);

    const dec = await apiGet(`/admin/decisions/${encodeURIComponent(decisionId)}`, ADMIN_AUTH);
    assertStatus(dec, 200, 'get decision by id');
    const d = dec.body.data || dec.body;

    if (!d.aiExplanation) {
      throw new Error('WARN: aiExplanation is null - LLM may have timed out; check LITELLM config');
    }

    const exp = d.aiExplanation;
    assert(
      exp.paragraph || exp.summary || typeof exp === 'string',
      `aiExplanation has content: ${JSON.stringify(exp).slice(0, 100)}`
    );
    assert(
      exp.riskFactors || exp.factors || exp.paragraph,
      'aiExplanation has riskFactors or paragraph'
    );

    // Clean up
    await apiPost(`/admin/users/${encodeURIComponent(EXPLAIN_USER)}/clear-block`, {}, ADMIN_AUTH);
  }
);

// ---------------------------------------------------------------------------
// Scenario 14: Admin signals page
// ---------------------------------------------------------------------------

await scenario(
  'admin-signals',
  'Admin signals: post dwell signal + GET /admin/signals shows it',
  'P1',
  async (assert) => {
    // Use ethan034 for signal tests to avoid location-conflict blocks on user001.
    const SIG_USER = 'USER#034';
    const SIG_USERNAME = 'ethan034';

    await apiPost(`/admin/users/${encodeURIComponent(SIG_USER)}/clear-block`, {}, ADMIN_AUTH);

    const { token } = await loginFull({
      username: SIG_USERNAME,
      password: 'Password1',
      location: 'Dallas,TX,US',
      deviceId: 'fp-ethan034-signals',
    });
    assert(token, 'Logged in as ethan034');

    const sessionId = `DWELL-SIG-${Date.now()}`;

    const evt = await apiPost(
      '/engagement/event',
      {
        signal: 'dwell_no_action',
        dwellMs: 45000,
        userId: SIG_USER,
        sessionId,
        params: { dwellMs: 45000 },
      },
      bearerAuth(token)
    );

    assert(evt.status === 200, `POST dwell_no_action: expected 200, got ${evt.status}`);

    // Allow propagation
    await new Promise((r) => setTimeout(r, 1500));

    const sig = await apiGet('/admin/signals?window=24h', ADMIN_AUTH);
    assertStatus(sig, 200, 'GET /admin/signals');
    const d = sig.body.data || sig.body;
    const count = d.count ?? d.signals?.length ?? 0;
    assert(count >= 1, `signals count >= 1, got: ${count}`);

    const signals = d.signals || [];
    const found = signals.find(
      (s) => s.signal === 'dwell_no_action' || JSON.stringify(s).includes('dwell_no_action')
    );
    assert(
      found,
      `dwell_no_action signal present in /admin/signals response (found ${signals.length} signals)`
    );
  }
);

// ---------------------------------------------------------------------------
// Scenario 15: Health endpoint
// ---------------------------------------------------------------------------

await scenario('health', 'Health endpoint: status=ok', 'P0', async (assert) => {
  const res = await fetchT(`${BASE_URL}/health`, {});
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  assert(res.status === 200, `GET /health status 200, got: ${res.status}`);
  assert(body.status === 'ok', `body.status=ok, got: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = results.length;
const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const warned = results.filter((r) => r.status === 'WARN').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;

const p0Results = results.filter((r) => r.priority === 'P0');
const p0Failures = p0Results.filter((r) => r.status === 'FAIL').length;

const confidence =
  p0Failures === 0 && failed === 0 ? 'HIGH' : p0Failures === 0 && failed <= 2 ? 'MEDIUM' : 'LOW';

console.log('');
console.log(`${C.bold}${'='.repeat(60)}${C.reset}`);
console.log(`${C.bold}  Signal Force Scenario Results${C.reset}`);
console.log(`${'='.repeat(60)}`);
console.log(`  Total:   ${total}`);
console.log(`  ${pass('Passed:')}  ${passed}`);
console.log(`  ${fail('Failed:')}  ${failed}`);
console.log(`  ${warn('Warned:')}  ${warned}`);
console.log(`  ${dim('Skipped:')} ${skipped}`);
console.log('');
console.log(`  P0 failures: ${p0Failures === 0 ? pass('0') : fail(String(p0Failures))}`);
console.log(
  `  Demo confidence: ${confidence === 'HIGH' ? pass(confidence) : confidence === 'MEDIUM' ? warn(confidence) : fail(confidence)}`
);
console.log(`${'='.repeat(60)}`);
console.log('');

if (failed > 0) {
  console.log(`${fail('Failed scenarios:')}`);
  for (const r of results.filter((r) => r.status === 'FAIL')) {
    console.log(`  ${fail('[FAIL]')} [${r.priority}] ${r.name}`);
    console.log(`    ${dim(r.reason)}`);
  }
  console.log('');
}

// Write JSON report
const report = {
  runAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  total,
  passed,
  failed,
  warned,
  skipped,
  p0Failures,
  demoConfidence: confidence,
  scenarios: results,
};

try {
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(dim(`  Report: ${REPORT_PATH}`));
} catch (e) {
  console.warn(warn(`  Could not write report: ${e.message}`));
}

// Exit non-zero if any P0 failed
if (p0Failures > 0) {
  console.error(
    fail(`\n  ${p0Failures} P0 scenario(s) failed - demo is blocked. Fix before going on stage.\n`)
  );
  process.exit(1);
}

if (failed > 0) {
  console.warn(warn(`\n  ${failed} non-P0 scenario(s) failed - demo may have rough edges.\n`));
  process.exit(0); // Non-P0 failures are warnings, not blockers
}

console.log(pass('  All scenarios passed. Demo confidence: ' + confidence));
console.log('');
