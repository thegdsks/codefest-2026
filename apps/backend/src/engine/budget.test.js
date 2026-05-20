'use strict';

/**
 * Tests for the LLM call budget guard (sliding-window circuit breaker).
 *
 * These tests manipulate the module-level state by calling _reset() between
 * cases. The module exports _reset() for test use only.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// We re-require budget each describe block after resetting state via _reset().
// ---------------------------------------------------------------------------

describe('budget.tryReserve - under cap', () => {
  test('first call succeeds and returns ok=true with a callId and remaining', () => {
    const budget = require('./budget');
    budget._reset({ maxCalls: 5, windowSec: 300 });

    const result = budget.tryReserve();

    assert.equal(result.ok, true);
    assert.ok(
      typeof result.callId === 'string' && result.callId.length > 0,
      'callId must be a non-empty string'
    );
    assert.equal(result.remaining, 4, 'remaining should be maxCalls - 1 after first call');
  });
});

describe('budget.tryReserve - exactly at cap (51st call fails)', () => {
  test('the 51st call returns ok=false with LLM_BUDGET_EXCEEDED reason and retryAfterSec', () => {
    const budget = require('./budget');
    budget._reset({ maxCalls: 50, windowSec: 300 });

    // Exhaust the 50-call cap
    for (let i = 0; i < 50; i++) {
      const r = budget.tryReserve();
      assert.equal(r.ok, true, `call ${i + 1} should succeed`);
    }

    // 51st call must be rejected
    const rejected = budget.tryReserve();
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'LLM_BUDGET_EXCEEDED');
    assert.equal(rejected.remaining, 0);
    assert.ok(
      typeof rejected.retryAfterSec === 'number' && rejected.retryAfterSec > 0,
      'retryAfterSec must be a positive number'
    );
  });
});

describe('budget.tryReserve - window expiry resets the counter', () => {
  test('after the window expires, the counter resets and calls succeed again', () => {
    const budget = require('./budget');
    // Use a tiny window so we can fake expiry by back-dating timestamps
    budget._reset({ maxCalls: 2, windowSec: 10 });

    // Fill the window
    assert.equal(budget.tryReserve().ok, true);
    assert.equal(budget.tryReserve().ok, true);

    // Should be at cap
    assert.equal(budget.tryReserve().ok, false);

    // Manually back-date the internal ring so it looks expired
    budget._backdateAll(11_000); // shift timestamps back 11 seconds

    // Counter should now reset on next tryReserve
    const after = budget.tryReserve();
    assert.equal(after.ok, true, 'after window expiry the call should succeed again');
    assert.equal(after.remaining, 1, 'remaining should show 1 slot used (this call)');
  });
});

describe('budget.recordResult - does not affect the cap', () => {
  test('calling recordResult does not consume or restore cap slots', () => {
    const budget = require('./budget');
    budget._reset({ maxCalls: 3, windowSec: 300 });

    const r1 = budget.tryReserve();
    assert.equal(r1.remaining, 2);

    // Record a result for that call
    budget.recordResult({
      callId: r1.callId,
      success: true,
      latencyMs: 40,
      model: 'claude-haiku-4-5',
    });

    // Next reserve should still reflect 2 slots used (the original + this one)
    const r2 = budget.tryReserve();
    assert.equal(r2.remaining, 1, 'recordResult must not restore a cap slot');
  });
});

describe('budget.getStats - returns correct shape', () => {
  test('getStats returns callsInWindow, windowSec, maxCalls, breakerOpen', () => {
    const budget = require('./budget');
    budget._reset({ maxCalls: 10, windowSec: 60 });

    budget.tryReserve();
    budget.tryReserve();

    const stats = budget.getStats();

    assert.equal(typeof stats.callsInWindow, 'number');
    assert.equal(typeof stats.windowSec, 'number');
    assert.equal(typeof stats.maxCalls, 'number');
    assert.equal(typeof stats.breakerOpen, 'boolean');

    assert.equal(stats.callsInWindow, 2);
    assert.equal(stats.windowSec, 60);
    assert.equal(stats.maxCalls, 10);
    assert.equal(stats.breakerOpen, false);
  });

  test('breakerOpen is true when at or over cap', () => {
    const budget = require('./budget');
    budget._reset({ maxCalls: 2, windowSec: 300 });

    budget.tryReserve();
    budget.tryReserve();

    const stats = budget.getStats();
    assert.equal(stats.breakerOpen, true, 'breaker should be open when callsInWindow >= maxCalls');
  });
});
