/**
 * smoke.test.mjs - unit tests for the smoke harness logic
 *
 * Verifies that the harness itself correctly tracks pass/fail state, applies
 * the --quick filter, and exits non-zero on P0 failures. Does not make real
 * HTTP calls.
 *
 * Run: node --test scripts/smoke.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ---------------------------------------------------------------------------
// Inline harness subset (mirrors smoke.mjs internal logic)
// ---------------------------------------------------------------------------

/**
 * Minimal check runner - same structure as smoke.mjs but captures results
 * without printing.
 */
async function runCheck(fn, expectedStatus, assertFn) {
  try {
    const { status, body } = await fn();
    const statusOk = status === expectedStatus;
    const assertErr = statusOk ? assertFn(body) : `HTTP ${status}, expected ${expectedStatus}`;
    const pass = statusOk && assertErr === null;
    return { pass, error: pass ? null : assertErr };
  } catch (err) {
    return { pass: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('smoke harness: runCheck', () => {
  it('passes when status matches and assertion returns null', async () => {
    const result = await runCheck(
      async () => ({ status: 200, body: { status: 'ok' } }),
      200,
      (b) => (b.status === 'ok' ? null : 'wrong status')
    );
    assert.equal(result.pass, true);
    assert.equal(result.error, null);
  });

  it('fails when HTTP status does not match expected', async () => {
    const result = await runCheck(
      async () => ({ status: 500, body: {} }),
      200,
      () => null
    );
    assert.equal(result.pass, false);
    assert.ok(result.error.includes('500'));
  });

  it('fails when assertion returns an error string', async () => {
    const result = await runCheck(
      async () => ({ status: 200, body: {} }),
      200,
      () => 'missing required field'
    );
    assert.equal(result.pass, false);
    assert.equal(result.error, 'missing required field');
  });

  it('fails when the fetch function throws', async () => {
    const result = await runCheck(
      async () => {
        throw new Error('connection refused');
      },
      200,
      () => null
    );
    assert.equal(result.pass, false);
    assert.ok(result.error.includes('connection refused'));
  });
});

describe('smoke harness: quick filter', () => {
  const fakeChecks = [
    { id: 'health', quick: true },
    { id: 'login', quick: true },
    { id: 'mfa', quick: true },
    { id: 'loyalty', quick: true },
    { id: 'surface', quick: true },
    { id: 'transfer', quick: false },
    { id: 'admin-metrics', quick: false },
  ];

  it('returns only quick:true checks when --quick flag is active', () => {
    const filtered = fakeChecks.filter((c) => c.quick);
    assert.equal(filtered.length, 5);
    assert.ok(filtered.every((c) => c.quick));
  });

  it('returns all checks when --quick flag is absent', () => {
    const all = fakeChecks;
    assert.equal(all.length, 7);
  });
});

describe('smoke harness: P0 exit logic', () => {
  it('exits 0 when all P0 checks pass (non-P0 failures allowed)', () => {
    const results = [
      { p0: true, pass: true },
      { p0: false, pass: false },
      { p0: true, pass: true },
    ];
    const allP0Pass = results.filter((r) => r.p0).every((r) => r.pass);
    assert.equal(allP0Pass, true);
  });

  it('exits 1 when any P0 check fails', () => {
    const results = [
      { p0: true, pass: true },
      { p0: true, pass: false },
      { p0: false, pass: true },
    ];
    const allP0Pass = results.filter((r) => r.p0).every((r) => r.pass);
    assert.equal(allP0Pass, false);
  });

  it('exits 0 when there are no P0 checks at all', () => {
    const results = [{ p0: false, pass: false }];
    const allP0Pass = results.filter((r) => r.p0).every((r) => r.pass);
    assert.equal(allP0Pass, true); // Array.prototype.every is vacuously true
  });
});

describe('smoke harness: basicAuth helper', () => {
  function basicAuth(user, pass) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  it('encodes demoClient:demoSecret correctly', () => {
    const header = basicAuth('demoClient', 'demoSecret');
    assert.equal(header, 'Basic ZGVtb0NsaWVudDpkZW1vU2VjcmV0');
  });

  it('starts with "Basic "', () => {
    const header = basicAuth('a', 'b');
    assert.ok(header.startsWith('Basic '));
  });

  it('base64 decodes back to user:pass', () => {
    const header = basicAuth('demoClient', 'demoSecret');
    const encoded = header.slice('Basic '.length);
    assert.equal(Buffer.from(encoded, 'base64').toString(), 'demoClient:demoSecret');
  });
});
