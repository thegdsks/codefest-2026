'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { profileCompleteness } = require('./profile');

const TRACKED_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'dob'];
const VERIFIED_FIELDS = ['emailVerified', 'phoneVerified'];

// --- Perfect profile: all fields present and verified ---
test('profileCompleteness returns 100 percent and empty missingFields for a complete profile', () => {
  const profile = {
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '+15555555555',
    address: '123 Main St',
    dob: '1990-01-01',
    emailVerified: true,
    phoneVerified: true,
  };
  const result = profileCompleteness({ profile });
  assert.equal(result.percent, 100);
  assert.deepEqual(result.missingFields, []);
});

// --- All missing ---
test('profileCompleteness returns 0 percent and all fields in missingFields for empty profile', () => {
  const result = profileCompleteness({ profile: {} });
  assert.equal(result.percent, 0);
  for (const f of TRACKED_FIELDS) {
    assert.ok(result.missingFields.includes(f), `expected ${f} in missingFields`);
  }
  for (const f of VERIFIED_FIELDS) {
    assert.ok(result.missingFields.includes(f), `expected ${f} in missingFields`);
  }
});

// --- One field missing ---
test('profileCompleteness reports firstName as missing when absent', () => {
  const profile = {
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '+15555555555',
    address: '123 Main St',
    dob: '1990-01-01',
    emailVerified: true,
    phoneVerified: true,
  };
  const result = profileCompleteness({ profile });
  assert.ok(result.missingFields.includes('firstName'));
  assert.ok(result.percent < 100);
  assert.ok(result.percent > 0);
});

// --- emailVerified false counts as missing ---
test('profileCompleteness includes emailVerified in missingFields when false', () => {
  const profile = {
    firstName: 'Bob',
    lastName: 'Jones',
    email: 'bob@example.com',
    phone: '+15555551234',
    address: '456 Oak Ave',
    dob: '1985-06-15',
    emailVerified: false,
    phoneVerified: true,
  };
  const result = profileCompleteness({ profile });
  assert.ok(result.missingFields.includes('emailVerified'));
  assert.ok(result.percent < 100);
});

// --- phoneVerified false counts as missing ---
test('profileCompleteness includes phoneVerified in missingFields when false', () => {
  const profile = {
    firstName: 'Carol',
    lastName: 'Lee',
    email: 'carol@example.com',
    phone: '+15555559876',
    address: '789 Pine Rd',
    dob: '1992-03-22',
    emailVerified: true,
    phoneVerified: false,
  };
  const result = profileCompleteness({ profile });
  assert.ok(result.missingFields.includes('phoneVerified'));
});

// --- percent is integer (no floats) ---
test('profileCompleteness returns an integer percent', () => {
  const profile = {
    firstName: 'Dan',
    lastName: 'Wu',
    email: 'dan@example.com',
    phone: '+15555550001',
    address: '1 Short St',
    dob: '2000-12-31',
    emailVerified: true,
    phoneVerified: true,
  };
  const result = profileCompleteness({ profile });
  assert.equal(result.percent, Math.floor(result.percent));
});

// --- Edge/fuzz: null profile must not throw ---
test('profileCompleteness does not throw on null profile', () => {
  assert.doesNotThrow(() => {
    const result = profileCompleteness({ profile: null });
    assert.equal(typeof result.percent, 'number');
    assert.ok(Array.isArray(result.missingFields));
  });
});

// --- Edge: undefined profile ---
test('profileCompleteness does not throw on empty args', () => {
  assert.doesNotThrow(() => {
    const result = profileCompleteness({});
    assert.equal(result.percent, 0);
  });
});

// --- percent in valid range ---
test('profileCompleteness percent is between 0 and 100 inclusive', () => {
  const result = profileCompleteness({ profile: { firstName: 'Eva' } });
  assert.ok(result.percent >= 0 && result.percent <= 100);
});

// --- Partial profile gives intermediate percent ---
test('profileCompleteness with half the fields gives between 0 and 100', () => {
  const profile = {
    firstName: 'Frank',
    lastName: 'Hall',
    email: 'frank@example.com',
    phone: '+15555552222',
    emailVerified: true,
    // address, dob, phoneVerified missing
  };
  const result = profileCompleteness({ profile });
  assert.ok(result.percent > 0 && result.percent < 100);
  assert.ok(result.missingFields.includes('address'));
  assert.ok(result.missingFields.includes('dob'));
  assert.ok(result.missingFields.includes('phoneVerified'));
});
