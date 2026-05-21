/**
 * scripts/synthetic-load.mjs
 *
 * Drives synthetic traffic through the fraud-aware loyalty API to populate
 * the DecisionStore with realistic L1/L2 engine decisions for the demo.
 *
 * Usage:
 *   node scripts/synthetic-load.mjs                  # default 500 actions
 *   LOAD_COUNT=100 node scripts/synthetic-load.mjs   # custom count
 *   DRY_RUN=1 node scripts/synthetic-load.mjs        # print plan, no requests
 *   API_BASE_URL=https://... node scripts/synthetic-load.mjs
 *
 * Paces at ~10 rps (100ms between requests), well under the 20 rps API
 * Gateway throttle. Uses a simple token-bucket pacer via setTimeout.
 */

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.API_BASE_URL || 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com';

const LOAD_COUNT = Math.max(1, parseInt(process.env.LOAD_COUNT || '500', 10));
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// Credentials for Basic Auth (client-level gateway auth)
const CLIENT_ID = process.env.CLIENT_ID || 'demoClient';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'demoSecret';
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

// Static MFA OTP used in demo/static mode
const STATIC_OTP = process.env.MFA_OTP || '123456';

// Pace: 100ms between requests = 10 rps max
const PACE_MS = parseInt(process.env.PACE_MS || '100', 10);

// Synthetic location pool - varied to trigger geo-change risk signals
const LOCATIONS = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Miami, FL',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Denver, CO',
  'Phoenix, AZ',
  'Las Vegas, NV',
  'Unknown',
];

// Device pool
const DEVICE_IDS = [
  'device-alpha-001',
  'device-beta-002',
  'device-gamma-003',
  'device-delta-004',
  'device-epsilon-005',
  'device-unknown-999',
];

// Offer IDs known to exist in the system
const OFFER_IDS = ['OFF#001'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a transfer amount following the specified heavy-tail distribution:
 *   ~88%  $10-$500  (low risk)
 *   ~10%  $1000-$5000 (medium/high risk)
 *   ~2%   $10000-$50000 (extreme, expect BLOCK)
 */
function pickTransferAmount() {
  const roll = Math.random();
  if (roll < 0.88) return randInt(10, 500);
  if (roll < 0.98) return randInt(1000, 5000);
  return randInt(10000, 50000);
}

/** Pick a weighted action type. Weights shift when INCLUDE_ENGAGEMENT=1. */
function pickActionType() {
  const roll = Math.random();
  if (INCLUDE_ENGAGEMENT) {
    // 40% login, 25% transfer, 5% offer, 30% engagement
    if (roll < 0.4) return 'login';
    if (roll < 0.65) return 'transfer';
    if (roll < 0.7) return 'offer';
    return 'engagement';
  }
  if (roll < 0.5) return 'login';
  if (roll < 0.9) return 'transfer';
  return 'offer';
}

const INCLUDE_ENGAGEMENT = process.env.INCLUDE_ENGAGEMENT === '1';

const ENGAGEMENT_SIGNALS = [
  {
    signal: 'rage_click',
    params: () => ({
      clickCount: randInt(3, 9),
      targetSelector: rand(['#redeem', '#book', '#points-balance']),
    }),
  },
  {
    signal: 'dwell_no_action',
    params: () => ({
      dwellMs: randInt(4000, 20000),
      target: rand(['points_balance', 'offers-panel', 'tier-progress']),
    }),
  },
  {
    signal: 'abandoned_flow_step',
    params: () => ({ flow: rand(['transfer', 'redeem', 'enroll']), step: randInt(1, 4) }),
  },
  {
    signal: 'repeated_query',
    params: () => ({
      query: rand(['redeem points', 'flight upgrade', 'tier status']),
      count: randInt(2, 6),
    }),
  },
  {
    signal: 'points_balance_stare',
    params: () => ({ dwellMs: randInt(2000, 12000) }),
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// API layer - all calls go through here
// ---------------------------------------------------------------------------

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${BASIC_AUTH}`,
    ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
    ...options.extraHeaders,
  };

  // Bearer overrides Basic when provided
  if (options.bearerToken) {
    headers.Authorization = `Bearer ${options.bearerToken}`;
    // Admin endpoints still need Basic, so keep Basic for those paths
    if (path.startsWith('/admin')) {
      headers.Authorization = `Basic ${BASIC_AUTH}`;
    }
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (networkErr) {
    return { ok: false, status: 0, body: null, networkErr };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { ok: res.status >= 200 && res.status < 300, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Fetch user list from /admin/users
// ---------------------------------------------------------------------------

async function loadUsers() {
  const result = await apiFetch('/admin/users?limit=30');
  if (!result.ok) {
    console.error(`[load-users] GET /admin/users failed: ${result.status}`);
    return [];
  }
  const users = result.body?.data?.users || [];
  console.log(`[load-users] loaded ${users.length} users`);
  return users;
}

// ---------------------------------------------------------------------------
// Action implementations
// ---------------------------------------------------------------------------

/**
 * Execute a login flow for the given user.
 * Returns { token, sessionId, mfaRequired, userId } on success.
 */
async function doLogin(user, stats) {
  const body = {
    username: user.username,
    password: user.passwordHash || 'Password1',
    location: rand(LOCATIONS),
    deviceId: rand(DEVICE_IDS),
    ipAddress: `${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}`,
    deviceType: rand(['MOBILE', 'DESKTOP', 'TABLET']),
    browser: rand(['Chrome', 'Safari', 'Firefox', 'Edge']),
  };

  const result = await apiFetch('/auth/login', { method: 'POST', body });
  stats.logins++;

  if (!result.ok && result.status !== 200) {
    if (result.status >= 400 && result.status < 500) {
      // 4xx expected (BLOCK, bad creds, etc.) - log and continue
      console.log(
        `[login] 4xx for ${user.username}: ${result.status} ${result.body?.error?.code || ''}`
      );
      return null;
    }
    if (result.status >= 500) {
      console.error(`[login] 5xx for ${user.username}: ${result.status} - backing off`);
      await sleep(1000);
      // Retry once
      const retry = await apiFetch('/auth/login', { method: 'POST', body });
      stats.logins++;
      if (!retry.ok) {
        stats.errors++;
        return null;
      }
      return extractLoginResult(retry.body);
    }
  }

  return extractLoginResult(result.body);
}

function extractLoginResult(body) {
  if (!body?.data) return null;
  const d = body.data;
  return {
    status: d.status,
    token: d.token || null,
    sessionId: d.sessionId || null,
    userId: d.userId || null,
    mfaRequired: d.status === 'MFA_REQUIRED',
  };
}

/**
 * Attempt MFA verification. Randomize: ~70% correct OTP, ~30% wrong to
 * generate variety in audit trail.
 */
async function doMfaVerify(loginResult, stats) {
  const useCorrect = Math.random() < 0.7;
  const otp = useCorrect ? STATIC_OTP : String(randInt(100000, 999999));

  const body = {
    sessionId: loginResult.sessionId,
    otp,
  };

  const result = await apiFetch('/auth/mfa/verify', { method: 'POST', body });
  stats.mfaVerifies++;

  if (result.status >= 500) {
    console.error(`[mfa-verify] 5xx: ${result.status} - backing off`);
    await sleep(1000);
    // Retry once with correct OTP to unblock
    const retry = await apiFetch('/auth/mfa/verify', {
      method: 'POST',
      body: { ...body, otp: STATIC_OTP },
    });
    stats.mfaVerifies++;
    if (!retry.ok) {
      stats.errors++;
      return null;
    }
    return retry.body?.data?.token || null;
  }

  if (result.status >= 400 && result.status < 500) {
    // Expected - wrong OTP, expired session, etc.
    console.log(`[mfa-verify] 4xx: ${result.status} ${result.body?.error?.code || ''}`);
    return null;
  }

  return result.body?.data?.token || null;
}

/**
 * POST /transactions/transfer - requires bearer token.
 */
async function doTransfer(user, token, allUsers, stats) {
  const recipients = allUsers.filter((u) => u.userId !== user.userId);
  if (recipients.length === 0) return;

  const recipient = rand(recipients);
  const amount = pickTransferAmount();

  const body = {
    userId: user.userId,
    recipientId: recipient.userId,
    amount,
    channel: rand(['APP', 'WEB', 'KIOSK']),
  };

  const result = await apiFetch('/transactions/transfer', {
    method: 'POST',
    body,
    bearerToken: token,
  });
  stats.transfers++;

  if (result.status >= 500) {
    console.error(`[transfer] 5xx: ${result.status} - backing off`);
    await sleep(1000);
    // Retry once
    const retry = await apiFetch('/transactions/transfer', {
      method: 'POST',
      body,
      bearerToken: token,
    });
    stats.transfers++;
    if (!retry.ok && retry.status >= 500) {
      stats.errors++;
    }
    return;
  }

  const decision = result.body?.data?.status || result.body?.error?.code || String(result.status);
  console.log(`[transfer] user=${user.userId} amount=$${amount} -> ${decision}`);
}

/**
 * GET /offers then POST /offers/action
 */
async function doOfferFlow(user, token, stats) {
  // Fetch offers
  const getResult = await apiFetch(`/offers?userId=${user.userId}`, { bearerToken: token });
  stats.offerActions++;

  if (getResult.status >= 500) {
    console.error(`[offers] 5xx on GET: ${getResult.status}`);
    stats.errors++;
    return;
  }

  // Pick a random action regardless of whether offers were returned
  const action = rand(['IMPRESSION', 'CLICK', 'BOOK']);
  const offerId = rand(OFFER_IDS);

  const actionBody = {
    userId: user.userId,
    offerId,
    action,
  };

  const actionResult = await apiFetch('/offers/action', {
    method: 'POST',
    body: actionBody,
    bearerToken: token,
  });
  stats.offerActions++;

  if (actionResult.status >= 500) {
    console.error(`[offers/action] 5xx: ${actionResult.status} - backing off`);
    await sleep(1000);
    // Retry once
    const retry = await apiFetch('/offers/action', {
      method: 'POST',
      body: actionBody,
      bearerToken: token,
    });
    stats.offerActions++;
    if (!retry.ok && retry.status >= 500) stats.errors++;
    return;
  }

  if (actionResult.status >= 400) {
    console.log(
      `[offers/action] 4xx: ${actionResult.status} ${actionResult.body?.error?.code || ''}`
    );
    return;
  }

  console.log(`[offers/action] user=${user.userId} offerId=${offerId} action=${action} -> tracked`);
}

// ---------------------------------------------------------------------------
// DRY_RUN planner
// ---------------------------------------------------------------------------

function printDryRunPlan(users) {
  console.log(`\nDRY RUN - ${LOAD_COUNT} planned actions against ${API_BASE}\n`);
  const plan = [];
  for (let i = 0; i < LOAD_COUNT; i++) {
    const user = rand(users.length > 0 ? users : [{ userId: 'USER#001', username: 'user001' }]);
    const actionType = pickActionType();
    let detail = '';
    if (actionType === 'login') {
      const mfaChance = Math.random() < 0.4;
      detail = mfaChance ? 'login -> mfa/verify' : 'login';
    } else if (actionType === 'transfer') {
      const amount = pickTransferAmount();
      detail = `login -> transfer($${amount})`;
    } else {
      detail = 'login -> GET /offers -> POST /offers/action';
    }
    plan.push(
      `  ${String(i + 1).padStart(3)}. user=${user.userId || user} type=${actionType} detail=${detail}`
    );
  }
  for (const line of plan) console.log(line);
  console.log(`\nTotal: ${LOAD_COUNT} actions planned. No requests sent.\n`);
}

// ---------------------------------------------------------------------------
// Per-action helpers - keeps main() below the complexity limit
// ---------------------------------------------------------------------------

/**
 * Resolve a bearer token for a user: attempt login, handle MFA if required.
 * Returns the token string or null when login is blocked/failed.
 */
async function acquireToken(user, stats) {
  const loginResult = await doLogin(user, stats);
  if (!loginResult) return null;
  if (!loginResult.mfaRequired) return loginResult.token;
  if (!loginResult.sessionId) return null;
  // Attempt MFA verify
  await sleep(PACE_MS);
  return doMfaVerify(loginResult, stats);
}

async function runLoginAction(user, users, stats) {
  const loginResult = await doLogin(user, stats);
  if (!loginResult?.mfaRequired || !loginResult.sessionId) {
    stats.decisionsExpected++;
    return;
  }
  // MFA flow - sometimes verify, sometimes abandon (realistic)
  if (Math.random() < 0.75) {
    await sleep(PACE_MS);
    const token = await doMfaVerify(loginResult, stats);
    // A fraction of verified logins also do a transfer
    if (token && Math.random() < 0.3) {
      await sleep(PACE_MS);
      await doTransfer(user, token, users, stats);
    }
  }
  stats.decisionsExpected++;
}

async function runTransferAction(user, users, stats) {
  const token = await acquireToken(user, stats);
  if (!token) return;
  await sleep(PACE_MS);
  await doTransfer(user, token, users, stats);
  stats.decisionsExpected++;
}

async function runOfferAction(user, stats) {
  const token = await acquireToken(user, stats);
  if (!token) return;
  await sleep(PACE_MS);
  await doOfferFlow(user, token, stats);
  stats.decisionsExpected++;
}

async function doEngagementEvent(user, token, sessionId, stats) {
  const spec = rand(ENGAGEMENT_SIGNALS);
  const body = {
    signal: spec.signal,
    userId: user.userId,
    sessionId: sessionId || `SESSION#${user.userId}`,
    params: spec.params(),
  };
  const result = await apiFetch('/engagement/event', {
    method: 'POST',
    body,
    bearerToken: token,
  });
  stats.engagementEvents++;
  if (result.status >= 500) {
    console.error(`[engagement] 5xx: ${result.status}`);
    stats.errors++;
    return;
  }
  if (result.status >= 400) {
    console.log(`[engagement] 4xx: ${result.status} ${result.body?.error?.code || ''}`);
    return;
  }
  const d = result.body?.data;
  if (d?.surface) {
    console.log(
      `[engagement] ${user.userId} ${spec.signal} -> ${d.action} on ${d.surface} (score ${d.score})`
    );
  }
}

async function runEngagementAction(user, stats) {
  const tokenResult = await acquireTokenWithSession(user, stats);
  if (!tokenResult) return;
  await sleep(PACE_MS);
  // Fire 1-2 engagement events per session (more realistic dwell pattern)
  const events = Math.random() < 0.4 ? 2 : 1;
  for (let i = 0; i < events; i++) {
    await doEngagementEvent(user, tokenResult.token, tokenResult.sessionId, stats);
    if (i + 1 < events) await sleep(PACE_MS);
  }
  stats.decisionsExpected += events;
}

const TOKEN_CACHE = new Map();

async function acquireTokenWithSession(user, stats) {
  const cached = TOKEN_CACHE.get(user.userId);
  if (cached) return cached;
  const loginResult = await doLogin(user, stats);
  if (loginResult?.token) {
    const entry = { token: loginResult.token, sessionId: loginResult.sessionId };
    TOKEN_CACHE.set(user.userId, entry);
    return entry;
  }
  if (loginResult?.mfaRequired && loginResult.sessionId) {
    await sleep(PACE_MS);
    const token = await doMfaVerify(loginResult, stats);
    if (token) {
      const entry = { token, sessionId: loginResult.sessionId };
      TOKEN_CACHE.set(user.userId, entry);
      return entry;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  const stats = {
    logins: 0,
    mfaVerifies: 0,
    transfers: 0,
    offerActions: 0,
    engagementEvents: 0,
    errors: 0,
    durationSec: 0,
    decisionsExpected: 0,
  };

  if (DRY_RUN) {
    // Use a stub user list for dry run so we can print without a network call
    const stubUsers = Array.from({ length: 5 }, (_, i) => ({
      userId: `USER#00${i + 1}`,
      username: `user00${i + 1}`,
    }));
    printDryRunPlan(stubUsers);
    process.exit(0);
  }

  console.log(`[synthetic-load] starting: count=${LOAD_COUNT} pace=${PACE_MS}ms api=${API_BASE}`);

  // Step 1: load users
  const users = await loadUsers();
  if (users.length === 0) {
    console.error('[synthetic-load] no users returned from /admin/users - aborting');
    process.exit(1);
  }

  // Admin strips passwordHash; fall back to known demo pattern
  for (const u of users) {
    if (!u.passwordHash) u.passwordHash = 'Password1';
  }

  // Step 2: run actions
  let completed = 0;
  while (completed < LOAD_COUNT) {
    const user = rand(users);
    const actionType = pickActionType();

    if (actionType === 'login') {
      await runLoginAction(user, users, stats);
    } else if (actionType === 'transfer') {
      await runTransferAction(user, users, stats);
    } else if (actionType === 'engagement') {
      await runEngagementAction(user, stats);
    } else {
      await runOfferAction(user, stats);
    }

    completed++;

    // Token-bucket pace: enforce PACE_MS between each top-level action
    await sleep(PACE_MS);

    // Progress report every 50 actions
    if (completed % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[synthetic-load] progress: ${completed}/${LOAD_COUNT} (${elapsed}s) logins=${stats.logins} transfers=${stats.transfers} offers=${stats.offerActions} errors=${stats.errors}`
      );
    }
  }

  stats.durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('\n--- Synthetic Load Summary ---');
  console.log(JSON.stringify(stats, null, 2));
  console.log(
    `\nDone. ${stats.decisionsExpected} decisions expected in DecisionStore. Run time: ${stats.durationSec}s`
  );
}

main().catch((err) => {
  console.error('[synthetic-load] fatal error:', err);
  process.exit(1);
});
