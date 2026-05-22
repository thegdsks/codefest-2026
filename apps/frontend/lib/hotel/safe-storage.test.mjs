/**
 * safe-storage.test.mjs - unit tests for safe-storage hydration helpers.
 *
 * Covers the corrupt-JSON / missing-key / schema-mismatch cases that caused
 * the login page to render blank when a stale sessionStorage entry from an
 * older app version survived across deploys.
 *
 * Run: node --experimental-strip-types --test apps/frontend/lib/hotel/safe-storage.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStoredSession } from './safe-storage.ts';

describe('parseStoredSession', () => {
  it('returns null when input is null', () => {
    assert.equal(parseStoredSession(null), null);
  });

  it('returns null when input is empty string', () => {
    assert.equal(parseStoredSession(''), null);
  });

  it('returns null when input is not valid JSON', () => {
    assert.equal(parseStoredSession('{not json'), null);
  });

  it('returns null when JSON parses to a non-object', () => {
    assert.equal(parseStoredSession('"a string"'), null);
    assert.equal(parseStoredSession('42'), null);
    assert.equal(parseStoredSession('null'), null);
    assert.equal(parseStoredSession('[]'), null);
  });

  it('returns null when token is missing', () => {
    assert.equal(parseStoredSession(JSON.stringify({ userId: 'user001' })), null);
  });

  it('returns null when token is not a string', () => {
    assert.equal(parseStoredSession(JSON.stringify({ token: 123, userId: 'user001' })), null);
  });

  it('returns null when token is the empty string', () => {
    assert.equal(parseStoredSession(JSON.stringify({ token: '', userId: 'user001' })), null);
  });

  it('returns null when userId is missing or non-string (schema drift)', () => {
    assert.equal(parseStoredSession(JSON.stringify({ token: 'abc' })), null);
    assert.equal(parseStoredSession(JSON.stringify({ token: 'abc', userId: 42 })), null);
  });

  it('returns the parsed shape when token and userId are present strings', () => {
    const result = parseStoredSession(JSON.stringify({ token: 'abc', userId: 'user001' }));
    assert.deepEqual(result, { token: 'abc', userId: 'user001' });
  });

  it('ignores unknown additional keys (forward-compatible)', () => {
    const result = parseStoredSession(
      JSON.stringify({ token: 'abc', userId: 'user001', somethingNew: { foo: 1 } })
    );
    assert.deepEqual(result, { token: 'abc', userId: 'user001' });
  });
});
