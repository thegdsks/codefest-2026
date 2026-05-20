'use strict';

/**
 * LLM call budget guard - sliding-window circuit breaker.
 *
 * Keeps a ring of call timestamps in module-level state. Each Lambda instance
 * maintains its own counter. With reservedConcurrentExecutions=5, the worst-case
 * burst is maxCalls * 5 LLM calls per windowSec across all instances.
 *
 * Env vars (tunable without redeploying the CDK stack):
 *   LLM_GUARD_MAX_CALLS  - max calls allowed per window per instance (default 50)
 *   LLM_GUARD_WINDOW_SEC - window length in seconds (default 300)
 *
 * Exports:
 *   tryReserve()     -> { ok, callId, remaining } | { ok, reason, remaining, retryAfterSec }
 *   recordResult(r)  -> void  (metadata only; does not affect the cap)
 *   getStats()       -> { callsInWindow, windowSec, maxCalls, breakerOpen }
 *   _reset(opts)     -> void  (test-only: reinitialise state)
 *   _backdateAll(ms) -> void  (test-only: shift all timestamps back by ms milliseconds)
 */

const { randomUUID } = require('node:crypto');

// ---------------------------------------------------------------------------
// Config (read once at module load; _reset() overrides in tests)
// ---------------------------------------------------------------------------

let maxCalls = parseInt(process.env.LLM_GUARD_MAX_CALLS || '50', 10);
let windowSec = parseInt(process.env.LLM_GUARD_WINDOW_SEC || '300', 10);

// Ring of timestamps (Date.now() values) for calls accepted in the current window.
let ring = [];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Drop timestamps that are older than the current window.
 */
function evict() {
  const cutoff = Date.now() - windowSec * 1000;
  ring = ring.filter((ts) => ts >= cutoff);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to reserve one LLM call slot.
 *
 * @returns {{ ok: true, callId: string, remaining: number }
 *         | { ok: false, reason: string, remaining: 0, retryAfterSec: number }}
 */
function tryReserve() {
  evict();

  if (ring.length >= maxCalls) {
    // Compute earliest slot expiry so the caller knows when to retry.
    const oldestTs = ring[0] || Date.now();
    const windowExpiry = oldestTs + windowSec * 1000;
    const retryAfterSec = Math.ceil(Math.max(0, windowExpiry - Date.now()) / 1000);

    console.error(
      `[budget] LLM_BUDGET_EXCEEDED window=${windowSec}s used=${ring.length}/${maxCalls}`
    );

    return { ok: false, reason: 'LLM_BUDGET_EXCEEDED', remaining: 0, retryAfterSec };
  }

  const now = Date.now();
  ring.push(now);
  const callId = randomUUID();
  const remaining = maxCalls - ring.length;
  return { ok: true, callId, remaining };
}

/**
 * Record the outcome of a completed LLM call.
 * Metadata only; the cap is enforced by tryReserve, not by this function.
 *
 * @param {{ callId?: string, success: boolean, latencyMs: number, model: string }} result
 */
function recordResult(result) {
  // Intentionally lightweight. In a future version this could emit per-call
  // metrics or update an EMA for adaptive rate limiting.
  if (!result.success) {
    console.error(`[budget] LLM call failed callId=${result.callId} latencyMs=${result.latencyMs}`);
  }
}

/**
 * Return the current guard statistics for the admin metrics endpoint.
 *
 * @returns {{ callsInWindow: number, windowSec: number, maxCalls: number, breakerOpen: boolean }}
 */
function getStats() {
  evict();
  const callsInWindow = ring.length;
  return {
    callsInWindow,
    windowSec,
    maxCalls,
    breakerOpen: callsInWindow >= maxCalls,
  };
}

// ---------------------------------------------------------------------------
// Test-only helpers (not called in production paths)
// ---------------------------------------------------------------------------

/**
 * Reinitialise module state. Test use only.
 *
 * @param {{ maxCalls?: number, windowSec?: number }} opts
 */
function _reset(opts) {
  ring = [];
  maxCalls = opts && opts.maxCalls != null ? opts.maxCalls : 50;
  windowSec = opts && opts.windowSec != null ? opts.windowSec : 300;
}

/**
 * Shift all current ring timestamps back by the given number of milliseconds.
 * Used in tests to simulate window expiry without actually sleeping.
 *
 * @param {number} ms
 */
function _backdateAll(ms) {
  ring = ring.map((ts) => ts - ms);
}

module.exports = { tryReserve, recordResult, getStats, _reset, _backdateAll };
