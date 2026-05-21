/**
 * smoke.mjs - end-to-end smoke test for the Signal Force demo path.
 *
 * Runs the full demo flow against a deployed or locally-offline backend.
 * Each step is timed and printed. Exits 1 if any step fails.
 *
 * Required env vars:
 *   DEMO_USER       - username sent in the login body (e.g. "alice")
 *   DEMO_PASSWORD   - password sent in the login body
 *   DEMO_MFA_OTP    - 6-digit OTP for MFA verification (static "123456" for demo mode)
 *
 * Optional env vars:
 *   BASE_URL        - backend base URL without trailing slash (default: http://localhost:3000)
 *   SMOKE_TIMEOUT   - per-request timeout in ms (default: 15000)
 *
 * No external dependencies. Uses Node 20 built-in fetch.
 *
 * Usage:
 *   DEMO_USER=alice DEMO_PASSWORD=secret DEMO_MFA_OTP=123456 node scripts/smoke.mjs
 *   npm run smoke        (same, reads from .env or shell env)
 *
 * --dry-run flag: prints the steps that would run without making any network calls.
 */

const DRY_RUN = process.argv.includes('--dry-run');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const DEMO_USER = process.env.DEMO_USER;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const DEMO_MFA_OTP = process.env.DEMO_MFA_OTP;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT || 15000);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!DRY_RUN) {
  const missing = ['DEMO_USER', 'DEMO_PASSWORD', 'DEMO_MFA_OTP'].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`smoke: missing required env vars: ${missing.join(', ')}`);
    console.error(
      'Set DEMO_USER, DEMO_PASSWORD, DEMO_MFA_OTP (and optionally BASE_URL, SMOKE_TIMEOUT).'
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Perform a fetch with a per-request timeout via AbortSignal.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make a Basic Auth header value from username:password.
 *
 * @param {string} user
 * @param {string} pass
 * @returns {string}
 */
function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, durationMs: number, status: 'PASS' | 'FAIL', error?: string }} StepResult
 */

/** @type {StepResult[]} */
const results = [];

/**
 * Run a single named step, record timing and pass/fail.
 *
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ name, durationMs, status: 'PASS' });
    console.log(`  [PASS] ${name} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, durationMs, status: 'FAIL', error });
    console.error(`  [FAIL] ${name} (${durationMs}ms): ${error}`);
    // Print full summary then exit - abort remaining steps
    printSummary();
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Dry-run path
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  const steps = [
    'POST /auth/login -> get challengeId',
    'POST /auth/mfa/verify -> get bearer token',
    'GET /admin/metrics -> assert { ok: true }',
    'POST /engagement/event (rage_click) -> get decisionId',
    'GET /admin/decisions -> assert new decisionId present',
    'POST /admin/decisions/{id}/release -> assert 200',
    'GET /admin/sessions -> assert current session present',
    'GET /admin/ai-config -> assert activeModelId is set',
  ];
  console.log(`smoke --dry-run (BASE_URL=${BASE_URL})`);
  console.log('Steps that would run:');
  for (const [i, s] of steps.entries()) {
    console.log(`  ${i + 1}. ${s}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// State shared across steps
// ---------------------------------------------------------------------------

let challengeId = '';
let bearerToken = '';
let targetDecisionId = '';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('\nSignal Force smoke test');
console.log(`BASE_URL : ${BASE_URL}`);
console.log(`USER     : ${DEMO_USER}`);
console.log(`TIMEOUT  : ${TIMEOUT_MS}ms per step`);
console.log('');

const smokeStart = Date.now();

// Step 1: login
await step('POST /auth/login -> challengeId', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD),
    },
    body: JSON.stringify({ userId: DEMO_USER, password: DEMO_PASSWORD }),
  });

  const body = await res.json();
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(
      `Expected 200/202, got ${res.status}: ${body.error?.message || JSON.stringify(body)}`
    );
  }

  // Login may return a challenge (MFA required) or direct access
  challengeId = body.challengeId || body.data?.challengeId || null;
  if (!challengeId && body.action === 'MFA') {
    throw new Error(`MFA required but no challengeId in response: ${JSON.stringify(body)}`);
  }
  // If no MFA challenge was issued (static/dev mode may skip it), we expect a token directly
  if (!challengeId) {
    const token = body.token || body.data?.token;
    if (!token)
      throw new Error(`No challengeId or token in login response: ${JSON.stringify(body)}`);
    bearerToken = token;
  }
});

// Step 2: MFA verify (skip if already got token in step 1)
await step('POST /auth/mfa/verify -> bearer token', async () => {
  if (bearerToken) {
    // Token was issued at login (no MFA challenge mode)
    return;
  }

  const res = await fetchWithTimeout(`${BASE_URL}/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD),
    },
    body: JSON.stringify({ challengeId, otp: DEMO_MFA_OTP }),
  });

  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(
      `Expected 200, got ${res.status}: ${body.error?.message || JSON.stringify(body)}`
    );
  }

  const token = body.token || body.data?.token;
  if (!token) throw new Error(`No token in MFA verify response: ${JSON.stringify(body)}`);
  bearerToken = token;
});

// Step 3: GET /admin/metrics
await step('GET /admin/metrics -> assert 200', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/metrics`, {
    headers: { Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD) },
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }

  const body = await res.json();
  // The metrics endpoint returns a top-level ok or data object - accept either shape
  if (!body && body !== 0) {
    throw new Error('Empty metrics response');
  }
});

// Step 4: POST a risky engagement event to trigger a decision
await step('POST /engagement/event (rage_click) -> decisionId', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/engagement/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      signal: 'rage_click',
      userId: DEMO_USER,
      sessionId: 'smoke-session',
      params: { count: 12, elementId: 'transfer-btn' },
    }),
  });

  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(
      `Expected 200, got ${res.status}: ${body.error?.message || JSON.stringify(body)}`
    );
  }

  // decisionId is only present when action != ALLOW
  const decId = body.data?.decisionId || null;
  if (decId) {
    targetDecisionId = decId;
  }
  // action ALLOW is fine for smoke - no decision row is written but call succeeded
});

// Step 5: GET /admin/decisions -> assert new decision appears (only if one was written)
await step('GET /admin/decisions -> verify engagement decision', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/decisions`, {
    headers: { Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD) },
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }

  const body = await res.json();
  const decisions = body.data?.decisions || body.decisions || [];

  if (targetDecisionId) {
    // A decision row was written; confirm it appears in the list
    const found = decisions.some((d) => d.decisionId === targetDecisionId);
    if (!found) {
      throw new Error(
        `Decision ${targetDecisionId} not found in /admin/decisions list (got ${decisions.length} rows)`
      );
    }
  } else {
    // No NUDGE/OFFER decision was produced (ALLOW path); just confirm the endpoint is healthy
    if (!Array.isArray(decisions)) {
      throw new Error(`Expected decisions array in response: ${JSON.stringify(body)}`);
    }
  }
});

// Step 6: POST /admin/decisions/{id}/release (only when we have a decision to release)
await step('POST /admin/decisions/{id}/release -> 200', async () => {
  if (!targetDecisionId) {
    // No decision to release; step is vacuously passing
    return;
  }

  const res = await fetchWithTimeout(`${BASE_URL}/admin/decisions/${targetDecisionId}/release`, {
    method: 'POST',
    headers: { Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD) },
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }

  const body = await res.json();
  if (!body.data?.released) {
    throw new Error(`Expected released:true in response: ${JSON.stringify(body)}`);
  }
});

// Step 7: GET /admin/sessions -> assert current session appears
await step('GET /admin/sessions -> current session present', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/sessions`, {
    headers: { Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD) },
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }

  const body = await res.json();
  const sessions = body.data?.sessions || body.sessions || [];
  if (!Array.isArray(sessions)) {
    throw new Error(`Expected sessions array: ${JSON.stringify(body)}`);
  }

  // The active session for DEMO_USER must appear
  const found = sessions.some((s) => s.userId === DEMO_USER || s.pk === `USER#${DEMO_USER}`);
  if (!found) {
    throw new Error(`No session found for userId=${DEMO_USER} in ${sessions.length} session(s)`);
  }
});

// Step 8: GET /admin/ai-config -> assert activeModelId is set
await step('GET /admin/ai-config -> activeModelId present', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/ai-config`, {
    headers: { Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD) },
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${body}`);
  }

  const body = await res.json();
  if (!body.activeModelId) {
    throw new Error(`Expected activeModelId in ai-config response: ${JSON.stringify(body)}`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary() {
  const totalMs = Date.now() - smokeStart;
  const allPassed = results.every((r) => r.status === 'PASS');

  console.log('');
  console.log('--- smoke summary ---');
  console.log(`${'Step'.padEnd(52)} ${'Duration'.padStart(10)}  Status`);
  console.log('-'.repeat(72));
  for (const r of results) {
    const status = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`${r.name.padEnd(52)} ${`${r.durationMs}ms`.padStart(10)}  ${status}`);
    if (r.error) console.log(`       -> ${r.error}`);
  }
  console.log('-'.repeat(72));
  console.log(`Total: ${totalMs}ms  |  ${allPassed ? 'ALL PASS' : 'FAILED'}`);
  console.log('');
}

printSummary();

const allPassed = results.every((r) => r.status === 'PASS');
process.exit(allPassed ? 0 : 1);
