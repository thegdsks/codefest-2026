/**
 * rehearsal.mjs - end-to-end demo story verifier for the Signal Force demo.
 *
 * Runs the EXACT presenter flow in sequence, prints a pass/warn/fail table,
 * and exits 0 on all-OK or OK-with-warnings, 1 on any hard fail.
 *
 * This is distinct from smoke.mjs (which proves routes are healthy).
 * rehearsal.mjs proves the demo STORY works: reseed -> login -> MFA ->
 * warm-up transfer -> big transfer -> admin decision verify -> trace -> budget.
 *
 * Required env vars (with defaults):
 *   BASE_URL            backend base URL, no trailing slash (default: http://localhost:3000)
 *   DEMO_USER           username for the demo account (default: user001)
 *   DEMO_PASSWORD       password for the demo account (default: Password1)
 *   DEMO_MFA_OTP        OTP code for MFA verify step (default: 123456)
 *   DEMO_MODE_EXPECTED  set to any non-empty string to assert DEMO_MODE is on
 *
 * Optional env vars:
 *   REHEARSAL_TIMEOUT   per-request timeout in ms (default: 15000)
 *
 * Flags:
 *   --dry-run     print what would run without making network calls, exit 0
 *   --no-reseed   skip step 2 (reseed) - useful for back-to-back rehearsals
 *   --verbose     print full request and response bodies for each step
 *   --help        print this usage text, exit 0
 *
 * Usage:
 *   npm run rehearsal
 *   npm run rehearsal -- --dry-run
 *   npm run rehearsal -- --no-reseed --verbose
 *   BASE_URL=https://my-api.execute-api.us-east-1.amazonaws.com npm run rehearsal
 *
 * IMPORTANT ROUTE NOTES (verified against the actual backend source):
 *   POST /auth/login        requires: username, password, location, deviceId
 *                           optional: forceMfa (honored when DEMO_MODE=1)
 *                           MFA path returns: { data: { sessionId, status: "MFA_REQUIRED", mfaPath? } }
 *   POST /auth/mfa/verify   requires: sessionId, otp  (NOT challengeId / code)
 *                           returns:  { data: { token, mfaPath, status } }
 *   POST /transactions/transfer  (NOT /customer/transfer)
 *                           requires: userId, recipientId, amount (in body)
 *                           auth: Bearer token
 *   GET /admin/decisions    query: userId (raw string, e.g. "USER#001"), limit, window
 *   GET /admin/metrics      query: window  -> body.data.budget.llmDailyUsd
 *   POST /admin/dev/reseed  auth: Basic Admin  -> body.tablesReset, body.itemsWritten
 *   GET /admin/ai-config    -> body.activeModelKnown, body.proxyConfigured, body.activeModelId
 */

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const NO_RESEED = ARGS.includes('--no-reseed');
const VERBOSE = ARGS.includes('--verbose');
const HELP = ARGS.includes('--help');

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

if (HELP) {
  console.log(`
rehearsal.mjs - Signal Force end-to-end demo story verifier

Usage:
  node scripts/rehearsal.mjs [flags]
  npm run rehearsal [-- flags]

Flags:
  --dry-run      Print steps that would run without making any network calls.
  --no-reseed    Skip step 2 (reseed) - useful when repeating the flow.
  --verbose      Print full request/response bodies for each step.
  --help         Print this help text.

Required env vars:
  BASE_URL            Backend URL without trailing slash. Default: http://localhost:3000
  DEMO_USER           Demo account username.        Default: user001
  DEMO_PASSWORD       Demo account password.        Default: Password1
  DEMO_MFA_OTP        MFA OTP code.                 Default: 123456
  DEMO_MODE_EXPECTED  Set to any non-empty value to assert DEMO_MODE is on on the backend.

Optional env vars:
  REHEARSAL_TIMEOUT   Per-request timeout in ms.    Default: 15000
  ADMIN_USER          Admin username for Basic Auth. Default: same as DEMO_USER
  ADMIN_PASSWORD      Admin password for Basic Auth. Default: same as DEMO_PASSWORD

Steps executed:
  1    env check            - confirm env vars are resolved
  2    reseed               - POST /admin/dev/reseed  (skipped with --no-reseed)
  3    ai-config            - GET  /admin/ai-config
  4    login                - POST /auth/login  (forceMfa: true)
  5    mfa verify           - POST /auth/mfa/verify
  6    warm-up transfer     - POST /transactions/transfer  amount=100
  7    big transfer         - POST /transactions/transfer  amount=7500  -> asserts action=MFA
  7.5  transfer mfa verify  - POST /transactions/mfa/verify  -> asserts action=ALLOW + transferId
  8    list decisions       - GET  /admin/decisions?userId=USER%23001&limit=10  -> asserts MFA+ALLOW rows
  9    trace                - GET  /admin/decisions/{id}  -> FAIL if trace=null
  10   budget               - GET  /admin/metrics?window=1h

Exit codes:
  0  all steps OK (or OK+warnings)
  1  any hard fail
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const DEMO_USER = process.env.DEMO_USER || 'user001';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Password1';
const DEMO_MFA_OTP = process.env.DEMO_MFA_OTP || '123456';
const DEMO_MODE_EXPECTED = process.env.DEMO_MODE_EXPECTED || '';
const TIMEOUT_MS = Number(process.env.REHEARSAL_TIMEOUT || 15000);

// Admin credentials - fall back to demo creds (demo user is in ADMIN_USERNAMES by default)
const ADMIN_USER = process.env.ADMIN_USER || DEMO_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEMO_PASSWORD;

const DEMO_RECIPIENT = 'user002';
const WARMUP_AMOUNT = 100;
const BIG_TRANSFER_AMOUNT = 7500;
// userId as stored in DynamoDB - used when querying decisions
const DEMO_USER_ID = `USER#${DEMO_USER.replace(/^user0*/, '').padStart(3, '0')}`;

// ---------------------------------------------------------------------------
// ANSI colors (only when stdout is a TTY)
// ---------------------------------------------------------------------------

const USE_COLOR = process.stdout.isTTY;

const C = {
  reset: USE_COLOR ? '\x1b[0m' : '',
  bold: USE_COLOR ? '\x1b[1m' : '',
  green: USE_COLOR ? '\x1b[32m' : '',
  yellow: USE_COLOR ? '\x1b[33m' : '',
  red: USE_COLOR ? '\x1b[31m' : '',
  cyan: USE_COLOR ? '\x1b[36m' : '',
  dim: USE_COLOR ? '\x1b[2m' : '',
};

function ok(s) {
  return `${C.green}${s}${C.reset}`;
}
function warn(s) {
  return `${C.yellow}${s}${C.reset}`;
}
function fail(s) {
  return `${C.red}${s}${C.reset}`;
}
function dim(s) {
  return `${C.dim}${s}${C.reset}`;
}
function bold(s) {
  return `${C.bold}${s}${C.reset}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Perform a fetch with a per-request AbortSignal timeout.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (VERBOSE) {
      console.log(`  ${dim('-->')} ${dim(init.method || 'GET')} ${dim(url)}`);
      if (init.body) {
        try {
          console.log(
            `  ${dim('req:')} ${dim(JSON.stringify(JSON.parse(init.body), null, 2).replace(/\n/g, '\n  '))}`
          );
        } catch {
          console.log(`  ${dim('req:')} ${dim(String(init.body))}`);
        }
      }
    }
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (VERBOSE) {
      const clone = res.clone();
      try {
        const bodyText = await clone.text();
        let parsed;
        try {
          parsed = JSON.parse(bodyText);
          console.log(
            `  ${dim('<--')} ${dim(res.status)} ${dim(JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  '))}`
          );
        } catch {
          console.log(`  ${dim('<--')} ${dim(res.status)} ${dim(bodyText)}`);
        }
      } catch {
        console.log(`  ${dim('<--')} ${dim(res.status)}`);
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a Basic Auth header value.
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
 * @typedef {{ num: number, name: string, durationMs: number, status: 'OK'|'WARN'|'FAIL', notes: string, skipped?: boolean }} StepResult
 */

/** @type {StepResult[]} */
const results = [];

const rehearsalStart = Date.now();

/**
 * Run a named step; capture timing and status.
 * On FAIL: print the summary so far, then exit 1.
 *
 * The fn may return:
 *   - a string: used as the notes for an OK result
 *   - null: skip pushing OK result (used for no-op steps)
 *   - throw: hard fail
 *
 * @param {number} num
 * @param {string} name
 * @param {() => Promise<string|null>} fn
 */
async function step(num, name, fn) {
  const start = Date.now();
  try {
    const notes = await fn();
    const durationMs = Date.now() - start;
    if (notes !== null) {
      results.push({ num, name, durationMs, status: 'OK', notes: notes || '' });
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num, name, durationMs, status: 'FAIL', notes: msg });
    printSummary();
    process.exit(1);
  }
}

/**
 * Record a skipped step.
 *
 * @param {number} num
 * @param {string} name
 * @param {string} notes
 */
function skipStep(num, name, notes) {
  results.push({ num, name, durationMs: 0, status: 'OK', notes, skipped: true });
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function printSummary() {
  const totalMs = Date.now() - rehearsalStart;
  const failures = results.filter((r) => r.status === 'FAIL').length;
  const warnings = results.filter((r) => r.status === 'WARN').length;

  const STEP_W = 18;
  const DUR_W = 10;
  const STATUS_W = 8;

  console.log('');
  console.log(bold('--- rehearsal summary ---'));
  console.log(
    `${'Step'.padEnd(STEP_W)} ${'Duration'.padStart(DUR_W)}  ${'Status'.padEnd(STATUS_W)}  Notes`
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    const stepLabel = `${r.num} ${r.name}`.padEnd(STEP_W);
    const durLabel = (r.skipped ? 'skipped' : `${r.durationMs}ms`).padStart(DUR_W);
    let statusLabel;
    if (r.status === 'OK') statusLabel = ok('OK'.padEnd(STATUS_W));
    else if (r.status === 'WARN') statusLabel = warn('WARN'.padEnd(STATUS_W));
    else statusLabel = fail('FAIL'.padEnd(STATUS_W));
    console.log(`${stepLabel} ${durLabel}  ${statusLabel}  ${r.notes}`);
  }

  console.log('-'.repeat(80));
  const totalTarget = 3000;
  const timeOk = totalMs <= totalTarget;
  console.log(
    `Total: ${timeOk ? ok(`${totalMs}ms`) : warn(`${totalMs}ms`)} (target <${totalTarget}ms)`
  );

  if (failures === 0) {
    const label = warnings > 0 ? `YES (${warnings} warning${warnings > 1 ? 's' : ''})` : 'YES';
    console.log(`Demo-ready: ${warnings > 0 ? warn(label) : ok(label)}`);
  } else {
    console.log(`Demo-ready: ${fail(`NO (${failures} failure${failures > 1 ? 's' : ''})`)}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Dry-run path
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  const steps = [
    { num: 1, action: 'env check', detail: `BASE_URL=${BASE_URL} DEMO_USER=${DEMO_USER}` },
    {
      num: 2,
      action: 'reseed',
      detail: NO_RESEED ? '(--no-reseed: skipped)' : 'POST /admin/dev/reseed',
    },
    {
      num: 3,
      action: 'ai-config',
      detail: 'GET /admin/ai-config -> assert activeModelKnown, proxyConfigured',
    },
    { num: 4, action: 'login', detail: `POST /auth/login  username=${DEMO_USER} forceMfa=true` },
    { num: 5, action: 'mfa verify', detail: `POST /auth/mfa/verify  otp=${DEMO_MFA_OTP}` },
    {
      num: 6,
      action: 'warm-up xfer',
      detail: `POST /transactions/transfer  amount=${WARMUP_AMOUNT} recipientId=${DEMO_RECIPIENT}`,
    },
    {
      num: 7,
      action: 'big transfer',
      detail: `POST /transactions/transfer  amount=${BIG_TRANSFER_AMOUNT} -> assert action=MFA`,
    },
    {
      num: 7.5,
      action: 'transfer mfa verify',
      detail: `POST /transactions/mfa/verify  otp=${DEMO_MFA_OTP} -> assert action=ALLOW + transferId`,
    },
    {
      num: 8,
      action: 'list decisions',
      detail: `GET /admin/decisions?userId=${encodeURIComponent(DEMO_USER_ID)}&limit=10 -> assert MFA+ALLOW rows`,
    },
    {
      num: 9,
      action: 'trace',
      detail: 'GET /admin/decisions/{id} -> assert trace.engineLayer, trace.matched (FAIL if null)',
    },
    {
      num: 10,
      action: 'budget',
      detail: 'GET /admin/metrics?window=1h -> assert budget.llmDailyUsd',
    },
  ];

  console.log('rehearsal --dry-run');
  console.log(`BASE_URL : ${BASE_URL}`);
  console.log(`USER     : ${DEMO_USER}`);
  console.log(`USER_ID  : ${DEMO_USER_ID}  (as stored in DynamoDB)`);
  console.log(`TIMEOUT  : ${TIMEOUT_MS}ms per request`);
  console.log('');
  console.log('Steps that would run:');
  for (const s of steps) {
    const skipTag = s.num === 2 && NO_RESEED ? warn(' [SKIP]') : '';
    console.log(
      `  ${String(s.num).padStart(2)}. ${s.action.padEnd(16)} ${dim(s.detail)}${skipTag}`
    );
  }
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pre-flight validation
// ---------------------------------------------------------------------------

if (!process.env.BASE_URL) {
  console.warn(warn(`WARNING: BASE_URL not set - defaulting to ${BASE_URL} (localhost mode)`));
}

// ---------------------------------------------------------------------------
// State shared across steps
// ---------------------------------------------------------------------------

/** @type {string} */
let sessionId = '';

/** @type {string} */
let bearerToken = '';

/** @type {string} */
let targetDecisionId = '';

/** @type {string} - transfer MFA challengeId from step 7 */
let transferChallengeId = '';

// ---------------------------------------------------------------------------
// Step 1: env check
// ---------------------------------------------------------------------------

console.log('');
console.log(bold('Signal Force demo rehearsal'));
console.log(`BASE_URL : ${BASE_URL}${!process.env.BASE_URL ? warn(' (localhost default)') : ''}`);
console.log(`USER     : ${DEMO_USER}`);
console.log(`USER_ID  : ${DEMO_USER_ID}`);
console.log(`TIMEOUT  : ${TIMEOUT_MS}ms per request`);
if (NO_RESEED) console.log('FLAGS    : --no-reseed');
if (VERBOSE) console.log('FLAGS    : --verbose');
console.log('');

await step(1, 'env check', async () => {
  const resolved = {
    BASE_URL: BASE_URL,
    DEMO_USER: DEMO_USER,
    DEMO_PASSWORD: DEMO_PASSWORD ? '(set)' : '(DEFAULT)',
    DEMO_MFA_OTP: DEMO_MFA_OTP,
    DEMO_MODE_EXPECTED: DEMO_MODE_EXPECTED || '(not checked)',
  };
  const notes = Object.entries(resolved)
    .filter(([k]) => k !== 'DEMO_PASSWORD')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return notes;
});

// ---------------------------------------------------------------------------
// Step 2: reseed
// ---------------------------------------------------------------------------

if (NO_RESEED) {
  skipStep(2, 'reseed', '--no-reseed flag set, skipping');
} else {
  await step(2, 'reseed', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/admin/dev/reseed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(ADMIN_USER, ADMIN_PASSWORD),
      },
    });

    const body = await res.json();

    if (res.status === 403) {
      const isDisabled =
        body &&
        (body.error === 'demo-mode-disabled' || (body.error && body.error.code === 'FORBIDDEN'));
      if (isDisabled || (body && body.error === 'demo-mode-disabled')) {
        throw new Error(
          '403 - DEMO_MODE is off on the backend. Set DEMO_MODE=1 in Lambda env or serverless.yml.' +
            ` Backend response: ${JSON.stringify(body)}`
        );
      }
      throw new Error(
        `403 - admin auth failed. Check ADMIN_USER/ADMIN_PASSWORD (or that ${ADMIN_USER} is in ADMIN_USERNAMES env). Response: ${JSON.stringify(body)}`
      );
    }

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    }

    if (!body.ok) {
      throw new Error(`reseed returned ok=false: ${JSON.stringify(body)}`);
    }

    const tables = Array.isArray(body.tablesReset) ? body.tablesReset.length : '?';
    const items = body.itemsWritten ?? '?';
    return `${tables} tables, ${items} items`;
  });
}

// ---------------------------------------------------------------------------
// Step 3: ai-config
// ---------------------------------------------------------------------------

await step(3, 'ai-config', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/ai-config`, {
    headers: { Authorization: basicAuth(ADMIN_USER, ADMIN_PASSWORD) },
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  }

  if (body.proxyConfigured === false) {
    throw new Error(
      'proxyConfigured=false - LITELLM_BASE_URL and LITELLM_API_KEY are not set on the backend. ' +
        'The L2 LLM path will not fire during the big transfer demo beat. ' +
        'Set those env vars or rely on the DEC#DEMO seed row for the trace drawer.'
    );
  }

  if (body.activeModelKnown !== true) {
    throw new Error(
      `activeModelKnown=false - the active model "${body.activeModelId}" is not in the catalog. ` +
        `Check LITELLM_MODEL env var. Known models: ${(body.models || []).map((m) => m.id).join(', ')}`
    );
  }

  return `model=${body.activeModelId}`;
});

// ---------------------------------------------------------------------------
// Step 4: login as demo user (forceMfa=true)
// ---------------------------------------------------------------------------

await step(4, 'login', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD),
    },
    body: JSON.stringify({
      username: DEMO_USER,
      password: DEMO_PASSWORD,
      location: 'New York, US',
      deviceId: 'rehearsal-device-001',
      deviceType: 'browser',
      browser: 'Chrome/rehearsal',
      forceMfa: true,
    }),
  });

  const body = await res.json();

  if (res.status !== 200 && res.status !== 202) {
    throw new Error(
      `Expected 200/202, got ${res.status}: ${body?.error?.message || JSON.stringify(body)}`
    );
  }

  const data = body.data || body;

  // forceMfa should push us to the MFA path
  sessionId = data.sessionId || '';
  if (!sessionId) {
    throw new Error(
      'No sessionId in login response. ' +
        `Expected { data: { sessionId, status: "MFA_REQUIRED" } } from the MFA path. ` +
        `Actual shape: ${JSON.stringify(body)}. ` +
        'Check routes/auth.js - forceMfa requires DEMO_MODE=1.'
    );
  }

  const mfaPath = data.mfaPath || '';
  const status = data.status || '';
  return `sessionId=${sessionId.slice(0, 16)}...  mfaPath=${mfaPath || status}`;
});

// ---------------------------------------------------------------------------
// Step 5: MFA verify
// ---------------------------------------------------------------------------

await step(5, 'mfa verify', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth(DEMO_USER, DEMO_PASSWORD),
    },
    // NOTE: backend requires sessionId + otp, NOT challengeId + code
    body: JSON.stringify({ sessionId, otp: DEMO_MFA_OTP }),
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(
      `Expected 200, got ${res.status}: ${body?.error?.message || JSON.stringify(body)}`
    );
  }

  const data = body.data || body;
  const token = data.token || data.data?.token;
  if (!token) {
    throw new Error(
      'No bearer token in MFA verify response. ' +
        'Expected { data: { token, mfaPath } }. ' +
        `Actual: ${JSON.stringify(body)}`
    );
  }

  bearerToken = token;

  if (!data.mfaPath) {
    throw new Error(
      'mfaPath missing in MFA verify response (audit field required). ' +
        `Actual: ${JSON.stringify(body)}`
    );
  }

  // Sanity-check bearer token format (opaque string, at least 16 chars)
  if (bearerToken.length < 16) {
    throw new Error(`Bearer token looks too short (${bearerToken.length} chars): "${bearerToken}"`);
  }

  return `mfaPath=${data.mfaPath}  token=${bearerToken.slice(0, 8)}...`;
});

// ---------------------------------------------------------------------------
// Step 6: warm-up transfer (tc1h -> 2 so big transfer lands in gray zone)
// ---------------------------------------------------------------------------

await step(6, 'warm-up xfer', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/transactions/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      userId: DEMO_USER_ID,
      recipientId: DEMO_RECIPIENT,
      amount: WARMUP_AMOUNT,
      channel: 'APP',
    }),
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(
      `Expected 200, got ${res.status}: ${body?.error?.message || JSON.stringify(body)}`
    );
  }

  const data = body.data || body;
  const status = data.status || '?';
  const action = data.action || status;

  // ALLOW or REVIEW are both acceptable for a small warm-up transfer
  if (!['SUCCESS', 'UNDER_REVIEW', 'ALLOW', 'REVIEW'].includes(status) && !data.transferId) {
    throw new Error(
      `Unexpected status for warm-up transfer: ${status}. ` +
        `Full response: ${JSON.stringify(body)}`
    );
  }

  return `action=${action}  status=${status}`;
});

// ---------------------------------------------------------------------------
// Step 7: big transfer - must return action=MFA (unseen device rule)
// ---------------------------------------------------------------------------

await step(7, 'big transfer', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/transactions/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      userId: DEMO_USER_ID,
      recipientId: DEMO_RECIPIENT,
      amount: BIG_TRANSFER_AMOUNT,
      channel: 'APP',
      // rehearsal-device is not in user001's knownDevicesLast30d seed list,
      // so deviceFingerprintSeenDays resolves to 90 and triggers the MFA rule.
      deviceFingerprint: 'rehearsal-device-001',
    }),
  });

  const body = await res.json();
  const data = body.data || body;
  const action = data.action || '';

  if (action !== 'MFA') {
    throw new Error(
      `Expected action=MFA from big transfer, got action=${action || 'none'} ` +
        `(status=${data.status || '?'} http=${res.status}). ` +
        'Check that DEMO_HIGH_VALUE_UNSEEN_DEVICE rule fires: ' +
        `amount >= LARGE_TRANSFER_AMOUNT_USD (${BIG_TRANSFER_AMOUNT} >= 5000) ` +
        'AND deviceFingerprintSeenDays > UNSEEN_DEVICE_DAYS_THRESHOLD (90 > 30). ' +
        `Full response: ${JSON.stringify(body)}`
    );
  }

  transferChallengeId = data.challengeId || '';
  if (!transferChallengeId) {
    throw new Error(`action=MFA but challengeId missing. Response: ${JSON.stringify(body)}`);
  }

  return `action=MFA  challengeId=${transferChallengeId}  mfaPath=${data.mfaPath}`;
});

// ---------------------------------------------------------------------------
// Step 7.5: complete the transfer MFA via /transactions/mfa/verify
// ---------------------------------------------------------------------------

await step(7.5, 'transfer mfa verify', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/transactions/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ challengeId: transferChallengeId, otp: DEMO_MFA_OTP }),
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(
      `Expected 200 from /transactions/mfa/verify, got ${res.status}: ` +
        `${body?.error?.message || JSON.stringify(body)}`
    );
  }

  const data = body.data || body;

  if (data.action !== 'ALLOW') {
    throw new Error(
      `Expected action=ALLOW after MFA verify, got action=${data.action}. ` +
        `Full response: ${JSON.stringify(body)}`
    );
  }

  if (!data.transferId) {
    throw new Error(`action=ALLOW but transferId missing. Response: ${JSON.stringify(body)}`);
  }

  return `action=ALLOW  transferId=${data.transferId}  mfaPath=${data.mfaPath}`;
});

// ---------------------------------------------------------------------------
// Step 8: list decisions - must find both MFA challenge row and ALLOW verify row
// ---------------------------------------------------------------------------

await step(8, 'list decisions', async () => {
  const qs = new URLSearchParams({
    userId: DEMO_USER_ID,
    limit: '10',
    type: 'FRAUD_TRANSFER',
    window: '1h',
  });

  const res = await fetchWithTimeout(`${BASE_URL}/admin/decisions?${qs}`, {
    headers: { Authorization: basicAuth(ADMIN_USER, ADMIN_PASSWORD) },
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  }

  const decisions = body.data?.decisions || body.decisions || [];
  if (!Array.isArray(decisions)) {
    throw new Error(`Expected decisions array in response. Actual shape: ${JSON.stringify(body)}`);
  }

  const fraudRows = decisions.filter((d) => d.decisionType === 'FRAUD_TRANSFER');
  if (fraudRows.length === 0) {
    throw new Error(
      `No FRAUD_TRANSFER decisions found for userId=${DEMO_USER_ID} in the last 1h. ` +
        `Got ${decisions.length} total decisions. ` +
        `Types: ${JSON.stringify(decisions.map((d) => d.decisionType))}`
    );
  }

  const mfaRow = fraudRows.find((d) => d.action === 'MFA');
  const allowRow = fraudRows.find((d) => d.action === 'ALLOW');

  if (!mfaRow) {
    throw new Error(
      'Expected a FRAUD_TRANSFER row with action=MFA (the challenge). ' +
        `Actions found: ${JSON.stringify(fraudRows.map((d) => d.action))}. ` +
        'Run step 7 again to generate the MFA challenge row.'
    );
  }

  if (!allowRow) {
    throw new Error(
      'Expected a FRAUD_TRANSFER row with action=ALLOW (the verified transfer). ' +
        `Actions found: ${JSON.stringify(fraudRows.map((d) => d.action))}. ` +
        'Step 7.5 (transfer mfa verify) may have failed.'
    );
  }

  // Use the MFA challenge row for the trace step - it has the full rule trace.
  targetDecisionId = mfaRow.decisionId;
  return `MFA=${mfaRow.decisionId}  ALLOW=${allowRow.decisionId}  total=${fraudRows.length}`;
});

// ---------------------------------------------------------------------------
// Step 9: trace verify on that decision
// ---------------------------------------------------------------------------

await step(9, 'trace', async () => {
  const res = await fetchWithTimeout(
    `${BASE_URL}/admin/decisions/${encodeURIComponent(targetDecisionId)}`,
    {
      headers: { Authorization: basicAuth(ADMIN_USER, ADMIN_PASSWORD) },
    }
  );

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(
      `Expected 200 on /admin/decisions/{id}, got ${res.status}: ${JSON.stringify(body)}`
    );
  }

  const data = body.data || body;
  const trace = data.trace;

  if (trace === null || trace === undefined) {
    // Hard fail: the MFA challenge decision must have a full trace because
    // scoreTransfer always populates ruleId, ruleName, matched on the MFA path.
    throw new Error(
      'trace=null on the MFA challenge decision. ' +
        'scoreTransfer should have populated ruleId/ruleName/matched for action=MFA. ' +
        `Decision id: ${targetDecisionId}. ` +
        'Check that the decision was written with the l1Draft trace fields via putDecision.'
    );
  }

  const validLayers = ['L1', 'L1+L2'];
  if (!validLayers.includes(trace.engineLayer)) {
    throw new Error(
      `trace.engineLayer="${trace.engineLayer}" is not one of ${validLayers.join(', ')}. ` +
        `Actual trace: ${JSON.stringify(trace)}`
    );
  }

  if (!Array.isArray(trace.matched) || trace.matched.length === 0) {
    throw new Error(
      'trace.matched is empty or missing. ' +
        'The engine should populate at least one matched condition. ' +
        `Actual trace: ${JSON.stringify(trace)}`
    );
  }

  return `engineLayer=${trace.engineLayer}  matched=${trace.matched.length}`;
});

// ---------------------------------------------------------------------------
// Step 10: budget tile
// ---------------------------------------------------------------------------

await step(10, 'budget', async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/admin/metrics?window=1h`, {
    headers: { Authorization: basicAuth(ADMIN_USER, ADMIN_PASSWORD) },
  });

  const body = await res.json();

  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  }

  const data = body.data || body;
  const budget = data.budget;

  if (!budget) {
    throw new Error(
      'No budget sub-object in /admin/metrics response. ' +
        `Actual keys: ${Object.keys(data).join(', ')}. ` +
        'Expected shape: { budget: { llmDailyUsd, usedUsd, remainingUsd, percentUsed } }. ' +
        'Check apps/backend/src/routes/admin/metrics.js'
    );
  }

  if (typeof budget.llmDailyUsd !== 'number') {
    throw new Error(
      `budget.llmDailyUsd is not a number (got ${typeof budget.llmDailyUsd}). ` +
        `Actual budget: ${JSON.stringify(budget)}`
    );
  }

  const used = typeof budget.usedUsd === 'number' ? budget.usedUsd.toFixed(4) : '?';
  const total = budget.llmDailyUsd.toFixed(2);
  const pct = typeof budget.percentUsed === 'number' ? budget.percentUsed.toFixed(1) : '?';
  return `$${used} / $${total} (${pct}%)`;
});

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------

printSummary();

const failed = results.some((r) => r.status === 'FAIL');
process.exit(failed ? 1 : 0);
