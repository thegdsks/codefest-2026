#!/usr/bin/env node
/**
 * One-shot script that mutates seed_data/UserProfile_batch_*.json in place
 * to add the MFA fields introduced in PR #34:
 *
 *   mfaEnabled         BOOL  default false
 *   mfaSecret          NULL  default null (S "<secret>" when enrolled)
 *   mfaRecoveryHashes  L     default empty list (L of S when enrolled)
 *
 * USER#001 is special-cased: pre-enrolled with a well-known TOTP secret so
 * the demo driver can scan it once into any authenticator app and the
 * judges see the verify branch without an on-stage enrollment.
 *
 * Demo TOTP secret: JBSWY3DPEHPK3PXP (standard otplib documentation example).
 * Demo recovery codes (printed below) are deterministic so the demo runbook
 * can reference them.
 *
 * Re-run safely: the script overwrites the MFA fields each time, so any
 * drift caused by manual edits is reset to the documented demo state.
 */

const fs = require('node:fs');
const path = require('node:path');
const { hashRecoveryCode } = require('../apps/backend/src/lib/totp');

const SEED_DIR = path.resolve(__dirname, '..', 'seed_data');
const FILES = ['UserProfile_batch_1.json', 'UserProfile_batch_2.json'];

const DEMO_USER_ID = 'USER#001';
const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXP';
const DEMO_RECOVERY_CODES = [
  'demo2222',
  'demo3333',
  'demo4444',
  'demo5555',
  'demo6666',
  'demo7777',
  'demo8888',
  'demo9999',
  'demoaaaa',
  'demobbbb',
];

function ddbBool(v) {
  return { BOOL: !!v };
}

function ddbNull() {
  return { NULL: true };
}

function ddbString(s) {
  return { S: s };
}

function ddbStringList(values) {
  return { L: values.map((v) => ({ S: v })) };
}

function ensureMfaFields(item) {
  const userId = item.userId && item.userId.S;
  if (userId === DEMO_USER_ID) {
    item.mfaEnabled = ddbBool(true);
    item.mfaSecret = ddbString(DEMO_MFA_SECRET);
    item.mfaRecoveryHashes = ddbStringList(DEMO_RECOVERY_CODES.map(hashRecoveryCode));
  } else {
    item.mfaEnabled = ddbBool(false);
    item.mfaSecret = ddbNull();
    item.mfaRecoveryHashes = { L: [] };
  }
  // Always remove any half-written enrollment state from prior runs.
  delete item.pendingMfaSecret;
  delete item.pendingRecoveryHashes;
  delete item.pendingMfaCreatedAt;
}

let totalUsers = 0;
let demoUserFound = false;

for (const file of FILES) {
  const full = path.join(SEED_DIR, file);
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  for (const row of raw.UserProfile) {
    const item = row.PutRequest.Item;
    if (item.userId && item.userId.S === DEMO_USER_ID) demoUserFound = true;
    ensureMfaFields(item);
    totalUsers += 1;
  }
  fs.writeFileSync(full, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`updated ${file}`);
}

if (!demoUserFound) {
  console.error(`warning: ${DEMO_USER_ID} not found in seed; demo MFA flow will not work as-is`);
  process.exit(1);
}

console.log(`\n${totalUsers} users updated.`);
console.log(`Demo user ${DEMO_USER_ID} pre-enrolled:`);
console.log(`  mfaSecret      : ${DEMO_MFA_SECRET}`);
console.log(
  `  otpauth URL    : otpauth://totp/SignalForce:user001?secret=${DEMO_MFA_SECRET}&issuer=SignalForce`
);
console.log(`  recovery codes : ${DEMO_RECOVERY_CODES.join(', ')}`);
console.log('\nNext steps:');
console.log('  1. node scripts/seed-ddb.js --table=UserProfile --purge-first');
console.log('  2. Add the secret to your authenticator app (manual entry).');
console.log('  3. node scripts/totp-code.js USER#001 to print the current code.');
