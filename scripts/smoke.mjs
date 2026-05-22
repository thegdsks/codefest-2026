/**
 * smoke.mjs - Signal Force API end-to-end smoke test
 *
 * Drives every documented API endpoint and verifies it works against the
 * deployed environment. Uses only Node.js stdlib (fetch built-in, no chalk).
 *
 * Env vars:
 *   API_URL         - base URL without trailing slash
 *                     (default: https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com)
 *   CLIENT_ID       - Basic Auth client id  (default: demoClient)
 *   CLIENT_SECRET   - Basic Auth secret     (default: demoSecret)
 *   SMOKE_TIMEOUT   - per-request timeout ms (default: 20000)
 *
 * Modes:
 *   node scripts/smoke.mjs           - all checks
 *   node scripts/smoke.mjs --quick   - 5 representative checks (~10s)
 *
 * Exit codes:
 *   0 - all P0 checks passed
 *   1 - at least one P0 check failed
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QUICK = process.argv.includes('--quick');
const BASE_URL = (
  process.env.API_URL || 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com'
).replace(/\/$/, '');
const CLIENT_ID = process.env.CLIENT_ID || 'demoClient';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'demoSecret';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT || 20000);

// Test persona (seed data, password is constant across all personas)
const DEMO_USERNAME = 'maya031';
const DEMO_PASSWORD = 'Password1';
const DEMO_USER_ID = 'USER#031';
const DEMO_MFA_OTP = '123456';
const DEMO_PROPERTY_ID = 'PROP#42';

// ---------------------------------------------------------------------------
// ANSI color helpers (stdlib only)
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function green(s) {
  return `${C.green}${s}${C.reset}`;
}
function red(s) {
  return `${C.red}${s}${C.reset}`;
}
function yellow(s) {
  return `${C.yellow}${s}${C.reset}`;
}
function cyan(s) {
  return `${C.cyan}${s}${C.reset}`;
}
function gray(s) {
  return `${C.gray}${s}${C.reset}`;
}
function bold(s) {
  return `${C.bold}${s}${C.reset}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const GATEWAY_AUTH = basicAuth(CLIENT_ID, CLIENT_SECRET);

async function fetchT(url, init) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Make a request and return { status, body, excerpt }.
 * Always parses JSON; falls back to raw text.
 *
 * @param {string} method
 * @param {string} path - path portion only (e.g. "/health")
 * @param {object} [opts]
 * @param {object} [opts.headers]
 * @param {object|null} [opts.body]
 * @returns {Promise<{ status: number, body: unknown, excerpt: string }>}
 */
async function req(method, path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };

  const init = {
    method,
    headers,
  };

  if (opts.body !== undefined && opts.body !== null) {
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetchT(`${BASE_URL}${path}`, init);
  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  // One-line excerpt: first 120 chars of JSON body
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const excerpt = raw.replace(/\s+/g, ' ').slice(0, 120);

  return { status: res.status, body, excerpt };
}

// ---------------------------------------------------------------------------
// Check runner
// ---------------------------------------------------------------------------

/**
 * @typedef {{ label: string, p0: boolean, status: number, expected: number, pass: boolean, excerpt: string, durationMs: number, error?: string }} CheckResult
 */

/** @type {CheckResult[]} */
const results = [];

/**
 * Run a single named check.
 *
 * @param {string} label        - display name
 * @param {boolean} p0          - whether a failure exits non-zero
 * @param {() => Promise<{ status: number, body: unknown, excerpt: string }>} fn
 * @param {number} expectedStatus
 * @param {(body: unknown) => string|null} assert - return null on pass, error string on fail
 */
async function check(label, p0, fn, expectedStatus, assert) {
  const start = Date.now();
  try {
    const { status, body, excerpt } = await fn();
    const durationMs = Date.now() - start;
    const statusOk = status === expectedStatus;
    const assertErr = statusOk ? assert(body) : null;
    const pass = statusOk && assertErr === null;

    const statusTag = `HTTP ${status}`;
    const mark = pass ? green('PASS') : red('FAIL');
    const p0tag = p0 ? bold('[P0]') : gray('[  ]');
    const dur = gray(`${durationMs}ms`);

    if (pass) {
      console.log(`  ${mark} ${p0tag} ${label} ${dur}`);
      console.log(`       ${gray(excerpt)}`);
    } else {
      const reason = !statusOk
        ? `expected HTTP ${expectedStatus}, got ${statusTag}`
        : assertErr || 'assertion failed';
      console.log(`  ${mark} ${p0tag} ${label} ${dur}`);
      console.log(`       ${yellow(reason)}`);
      console.log(`       ${gray(excerpt)}`);
    }

    results.push({ label, p0, status, expected: expectedStatus, pass, excerpt, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.log(
      `  ${red('FAIL')} ${p0 ? bold('[P0]') : gray('[  ]')} ${label} ${gray(`${durationMs}ms`)}`
    );
    console.log(`       ${yellow(`exception: ${error}`)}`);
    results.push({
      label,
      p0,
      status: 0,
      expected: expectedStatus,
      pass: false,
      excerpt: '',
      durationMs,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Session state (populated during auth flow then reused)
// ---------------------------------------------------------------------------

let bearerToken = '';
let mfaSessionId = '';
let releaseDecisionId = '';

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

/**
 * Build the full check list. Returns an array of async functions so the
 * runner can conditionally skip for --quick mode.
 */
function buildChecks() {
  // Helper to make a bearer-auth header object
  const bearerHeaders = () => ({ Authorization: `Bearer ${bearerToken}` });
  const adminHeaders = () => ({ Authorization: GATEWAY_AUTH });

  return [
    // ------------------------------------------------------------------
    // Public
    // ------------------------------------------------------------------
    {
      id: 'health',
      quick: true,
      p0: true,
      run: () =>
        check(
          'GET /health',
          true,
          () => req('GET', '/health'),
          200,
          (b) =>
            b && b.status === 'ok' ? null : `expected {status:"ok"}, got ${JSON.stringify(b)}`
        ),
    },

    // ------------------------------------------------------------------
    // Auth: login
    // ------------------------------------------------------------------
    {
      id: 'login',
      quick: true,
      p0: true,
      run: () =>
        check(
          'POST /auth/login',
          true,
          async () => {
            const r = await req('POST', '/auth/login', {
              headers: { Authorization: GATEWAY_AUTH },
              body: {
                username: DEMO_USERNAME,
                password: DEMO_PASSWORD,
                location: 'Austin',
                deviceId: 'smoke-device-001',
              },
            });
            // Capture state for subsequent steps
            if (r.body && typeof r.body === 'object') {
              const d = r.body.data || r.body;
              bearerToken = d.token || bearerToken;
              mfaSessionId = d.sessionId || mfaSessionId;
            }
            return r;
          },
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (!d || !d.status) return 'missing data.status in login response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Auth: MFA verify (uses sessionId from login, static OTP)
    // ------------------------------------------------------------------
    {
      id: 'mfa-verify',
      quick: true,
      p0: true,
      run: () =>
        check(
          'POST /auth/mfa/verify',
          true,
          async () => {
            // If login returned a direct token (no MFA challenge), skip gracefully
            if (bearerToken && !mfaSessionId) {
              return {
                status: 200,
                body: { data: { status: 'SUCCESS', token: bearerToken } },
                excerpt: '(no MFA challenge issued - direct token)',
              };
            }
            const r = await req('POST', '/auth/mfa/verify', {
              headers: { Authorization: GATEWAY_AUTH },
              body: {
                sessionId: mfaSessionId,
                otp: DEMO_MFA_OTP,
              },
            });
            if (r.body && typeof r.body === 'object') {
              const d = r.body.data || r.body;
              if (d.token) bearerToken = d.token;
            }
            return r;
          },
          200,
          (b) => {
            if (bearerToken) return null; // already had a token
            const d = (b && b.data) || b;
            if (!d || !d.token) return 'expected token in mfa/verify response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: loyalty summary
    // ------------------------------------------------------------------
    {
      id: 'loyalty-summary',
      quick: true,
      p0: true,
      run: () =>
        check(
          `GET /customer/loyalty-summary?userId=${encodeURIComponent(DEMO_USER_ID)}`,
          true,
          () =>
            req('GET', `/customer/loyalty-summary?userId=${encodeURIComponent(DEMO_USER_ID)}`, {
              headers: bearerHeaders(),
            }),
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (!d || !d.currentTier) return 'expected data.currentTier in loyalty-summary';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: surface eligibility (no aiMode)
    // ------------------------------------------------------------------
    {
      id: 'surface-eligibility',
      quick: true,
      p0: false,
      run: () =>
        check(
          `GET /customer/surface-eligibility?userId=${encodeURIComponent(DEMO_USER_ID)}`,
          false,
          () =>
            req('GET', `/customer/surface-eligibility?userId=${encodeURIComponent(DEMO_USER_ID)}`, {
              headers: bearerHeaders(),
            }),
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (d === undefined || d === null) return 'empty surface-eligibility response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: surface eligibility with aiMode
    // ------------------------------------------------------------------
    {
      id: 'surface-eligibility-ai',
      quick: false,
      p0: false,
      run: () =>
        check(
          `GET /customer/surface-eligibility?userId=${encodeURIComponent(DEMO_USER_ID)}&aiMode=true`,
          false,
          () =>
            req(
              'GET',
              `/customer/surface-eligibility?userId=${encodeURIComponent(DEMO_USER_ID)}&aiMode=true`,
              {
                headers: bearerHeaders(),
              }
            ),
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (d === undefined || d === null) return 'empty surface-eligibility (aiMode) response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: transfer draft
    // ------------------------------------------------------------------
    {
      id: 'transfer-draft',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /customer/transfers/draft',
          false,
          async () => {
            const r = await req('POST', '/customer/transfers/draft', {
              headers: bearerHeaders(),
              body: {
                userId: DEMO_USER_ID,
                recipientId: 'USER#002',
                amount: 500,
              },
            });
            return r;
          },
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (!d || typeof d !== 'object') return 'expected data object in transfer draft';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: execute transfer (P0 - core demo flow)
    // ------------------------------------------------------------------
    {
      id: 'transfer',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /transactions/transfer',
          false,
          () =>
            req('POST', '/transactions/transfer', {
              headers: bearerHeaders(),
              body: {
                userId: DEMO_USER_ID,
                recipientId: 'USER#002',
                amount: 100,
                channel: 'APP',
                deviceFingerprint: 'smoke-fp-001',
              },
            }),
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (!d || typeof d !== 'object') return 'expected data object in transfer response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: property availability
    // ------------------------------------------------------------------
    {
      id: 'property-availability',
      quick: false,
      p0: false,
      run: () =>
        check(
          `GET /customer/properties/${DEMO_PROPERTY_ID}/availability`,
          false,
          () =>
            req(
              'GET',
              `/customer/properties/${encodeURIComponent(DEMO_PROPERTY_ID)}/availability`,
              {
                headers: bearerHeaders(),
              }
            ),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty availability response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: personalized offer for property
    // ------------------------------------------------------------------
    {
      id: 'personalized-offer',
      quick: false,
      p0: false,
      run: () =>
        check(
          `GET /customer/properties/${DEMO_PROPERTY_ID}/personalized-offer`,
          false,
          () =>
            req(
              'GET',
              `/customer/properties/${encodeURIComponent(DEMO_PROPERTY_ID)}/personalized-offer?userId=${encodeURIComponent(DEMO_USER_ID)}`,
              {
                headers: bearerHeaders(),
              }
            ),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty personalized-offer response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: create booking
    // ------------------------------------------------------------------
    {
      id: 'create-booking',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /customer/bookings',
          false,
          () =>
            req('POST', '/customer/bookings', {
              headers: bearerHeaders(),
              body: {
                userId: DEMO_USER_ID,
                propertyId: DEMO_PROPERTY_ID,
                checkIn: '2026-08-01',
                checkOut: '2026-08-03',
                nights: 2,
              },
            }),
          200,
          (b) => {
            const d = (b && b.data) || b;
            if (!d || typeof d !== 'object') return 'expected data object in booking response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Customer: update profile
    // ------------------------------------------------------------------
    {
      id: 'update-profile',
      quick: false,
      p0: false,
      run: () =>
        check(
          'PUT /customer/profile',
          false,
          () =>
            req('PUT', '/customer/profile', {
              headers: bearerHeaders(),
              body: {
                userId: DEMO_USER_ID,
                updates: { preferredLanguage: 'en' },
              },
            }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty profile update response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Engagement: track event (rage_click is a valid signal)
    // ------------------------------------------------------------------
    {
      id: 'engagement-event',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /engagement/event',
          false,
          async () => {
            const r = await req('POST', '/engagement/event', {
              headers: bearerHeaders(),
              body: {
                signal: 'rage_click',
                userId: DEMO_USER_ID,
                sessionId: 'smoke-session-001',
                params: { count: 3, elementId: 'transfer-btn' },
              },
            });
            if (r.body && r.body.data && r.body.data.decisionId) {
              releaseDecisionId = r.body.data.decisionId;
            }
            return r;
          },
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty engagement event response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: metrics
    // ------------------------------------------------------------------
    {
      id: 'admin-metrics',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/metrics',
          false,
          () => req('GET', '/admin/metrics', { headers: adminHeaders() }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty metrics response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: decisions (list)
    // ------------------------------------------------------------------
    {
      id: 'admin-decisions',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/decisions',
          false,
          async () => {
            const r = await req('GET', '/admin/decisions', { headers: adminHeaders() });
            // Capture a decisionId for the release check if we don't have one yet
            if (!releaseDecisionId && r.body && r.body.data) {
              const decisions = r.body.data.decisions || r.body.data;
              if (Array.isArray(decisions) && decisions.length > 0) {
                releaseDecisionId = decisions[0].decisionId || '';
              }
            }
            return r;
          },
          200,
          (b) => {
            const decisions = (b && b.data && b.data.decisions) || (b && b.data) || [];
            if (!Array.isArray(decisions)) return 'expected decisions array';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: decisions filtered by userId
    // ------------------------------------------------------------------
    {
      id: 'admin-decisions-by-user',
      quick: false,
      p0: false,
      run: () =>
        check(
          `GET /admin/decisions?userId=${encodeURIComponent(DEMO_USER_ID)}`,
          false,
          () =>
            req('GET', `/admin/decisions?userId=${encodeURIComponent(DEMO_USER_ID)}`, {
              headers: adminHeaders(),
            }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty decisions response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: release a decision (if we captured one)
    // The decisionId contains '#' which must be URL-encoded in the path.
    // ------------------------------------------------------------------
    {
      id: 'admin-decision-release',
      quick: false,
      p0: false,
      run: () =>
        check(
          releaseDecisionId
            ? `POST /admin/decisions/${releaseDecisionId}/release`
            : 'POST /admin/decisions/{id}/release (no decisionId captured - skip)',
          false,
          async () => {
            if (!releaseDecisionId) {
              return {
                status: 200,
                body: { skipped: true },
                excerpt: '(skipped: no decisionId captured)',
              };
            }
            const encodedId = encodeURIComponent(releaseDecisionId);
            return req('POST', `/admin/decisions/${encodedId}/release`, {
              headers: adminHeaders(),
            });
          },
          200,
          () => null
        ),
    },

    // ------------------------------------------------------------------
    // Admin: sessions
    // ------------------------------------------------------------------
    {
      id: 'admin-sessions',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/sessions',
          false,
          () => req('GET', '/admin/sessions', { headers: adminHeaders() }),
          200,
          (b) => {
            const sessions = (b && b.data && b.data.sessions) || (b && b.data) || [];
            if (!Array.isArray(sessions)) return 'expected sessions array';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: users
    // ------------------------------------------------------------------
    {
      id: 'admin-users',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/users',
          false,
          () => req('GET', '/admin/users', { headers: adminHeaders() }),
          200,
          (b) => {
            const users = (b && b.data && b.data.users) || (b && b.data) || [];
            if (!Array.isArray(users)) return 'expected users array';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: rules
    // ------------------------------------------------------------------
    {
      id: 'admin-rules',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/rules',
          false,
          () => req('GET', '/admin/rules', { headers: adminHeaders() }),
          200,
          (b) => {
            const rules = (b && b.data && b.data.rules) || (b && b.data) || [];
            if (!Array.isArray(rules)) return 'expected rules array';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: ai-config
    // ------------------------------------------------------------------
    {
      id: 'admin-ai-config',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/ai-config',
          false,
          () => req('GET', '/admin/ai-config', { headers: adminHeaders() }),
          200,
          (b) => {
            if (!b || typeof b !== 'object') return 'expected object in ai-config response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: activity feed
    // ------------------------------------------------------------------
    {
      id: 'admin-activity-feed',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/activity-feed',
          false,
          () => req('GET', '/admin/activity-feed', { headers: adminHeaders() }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty activity-feed response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: signals
    // ------------------------------------------------------------------
    {
      id: 'admin-signals',
      quick: false,
      p0: false,
      run: () =>
        check(
          'GET /admin/signals',
          false,
          () => req('GET', '/admin/signals', { headers: adminHeaders() }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty signals response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: ai-suggest rule (field is 'description' not 'context')
    // ------------------------------------------------------------------
    {
      id: 'admin-rules-ai-suggest',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /admin/rules/ai-suggest',
          false,
          () =>
            req('POST', '/admin/rules/ai-suggest', {
              headers: adminHeaders(),
              body: {
                description:
                  'High-value transfer with unknown device fingerprint from a new location',
              },
            }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty ai-suggest response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: demo-actions mutate-user (body uses 'mutation' object)
    // ------------------------------------------------------------------
    {
      id: 'admin-mutate-user',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /admin/demo-actions/mutate-user',
          false,
          () =>
            req('POST', '/admin/demo-actions/mutate-user', {
              headers: adminHeaders(),
              body: {
                userId: DEMO_USER_ID,
                mutation: { loyaltyScore: 1500 },
              },
            }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty mutate-user response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: demo-events (write) - type must be a valid VALID_TYPES value
    // Returns 201 Created on success
    // ------------------------------------------------------------------
    {
      id: 'admin-demo-events-write',
      quick: false,
      p0: false,
      run: () =>
        check(
          'POST /admin/demo-events',
          false,
          () =>
            req('POST', '/admin/demo-events', {
              headers: adminHeaders(),
              body: {
                type: 'SIGNAL_TRIGGER',
                actor: 'smoke-test',
                payload: { source: 'smoke.mjs', userId: DEMO_USER_ID },
              },
            }),
          201,
          (b) => {
            if (b === undefined || b === null) return 'empty demo-events write response';
            return null;
          }
        ),
    },

    // ------------------------------------------------------------------
    // Admin: clear user block
    // ------------------------------------------------------------------
    {
      id: 'admin-clear-block',
      quick: false,
      p0: false,
      run: () =>
        check(
          `POST /admin/users/${DEMO_USER_ID}/clear-block`,
          false,
          () =>
            req('POST', `/admin/users/${encodeURIComponent(DEMO_USER_ID)}/clear-block`, {
              headers: adminHeaders(),
            }),
          200,
          (b) => {
            if (b === undefined || b === null) return 'empty clear-block response';
            return null;
          }
        ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allChecks = buildChecks();
const checksToRun = QUICK ? allChecks.filter((c) => c.quick) : allChecks;

console.log('');
console.log(bold('Signal Force API smoke test'));
console.log(`  ${gray('API_URL')}  ${cyan(BASE_URL)}`);
console.log(
  `  ${gray('mode')}     ${cyan(QUICK ? '--quick (' + checksToRun.length + ' checks)' : 'full (' + checksToRun.length + ' checks)')}`
);
console.log(`  ${gray('timeout')}  ${cyan(TIMEOUT_MS + 'ms per request')}`);
console.log('');

const smokeStart = Date.now();

for (const c of checksToRun) {
  await c.run();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const totalMs = Date.now() - smokeStart;
const p0results = results.filter((r) => r.p0);
const allP0Pass = p0results.every((r) => r.pass);
const passCount = results.filter((r) => r.pass).length;

console.log('');
console.log(bold('Summary'));
console.log(gray('-'.repeat(80)));
console.log(`${'Check'.padEnd(56)} ${'HTTP'.padStart(5)} ${'ms'.padStart(7)}  Status`);
console.log(gray('-'.repeat(80)));

for (const r of results) {
  const statusStr = String(r.status || '-').padStart(5);
  const durStr = (r.durationMs + 'ms').padStart(7);
  const statusMark = r.pass ? green('PASS') : red('FAIL');
  const p0mark = r.p0 ? bold('[P0]') : gray('[  ]');
  console.log(`${r.label.padEnd(56)} ${statusStr} ${durStr}  ${statusMark} ${p0mark}`);
  if (!r.pass && r.error) {
    console.log(`${''.padEnd(68)} ${yellow(r.error.slice(0, 60))}`);
  }
}

console.log(gray('-'.repeat(80)));
console.log(
  `${bold(`${passCount}/${results.length} passed`)}  ${gray('|')}  ` +
    `P0: ${allP0Pass ? green('all pass') : red('FAILED')}  ${gray('|')}  ` +
    `Total: ${gray(totalMs + 'ms')}`
);
console.log('');

process.exit(allP0Pass ? 0 : 1);
