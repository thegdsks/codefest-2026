#!/usr/bin/env node
/**
 * Print the current TOTP code for a given userId. Reads the user's mfaSecret
 * from DynamoDB UserProfile and runs it through otplib.authenticator.
 *
 * Used by the demo runbook when the driver does not have a phone handy to
 * scan the QR code: instead of opening Google Authenticator, pop into a
 * terminal and run:
 *
 *   node scripts/totp-code.js USER#001
 *
 * Optional flags:
 *   --watch     reprint the code every second until Ctrl-C
 *   --table=X   override the UserProfile table name (default: UserProfile)
 *
 * Exit codes:
 *   0  printed a code (or kept watching)
 *   1  invalid args, user not found, or no mfaSecret on the profile
 *   2  AWS / DDB error
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { authenticator } = require('otplib');

function parseArgs(argv) {
  const args = { userId: null, table: 'UserProfile', watch: false };
  for (const a of argv.slice(2)) {
    if (a === '--watch') args.watch = true;
    else if (a.startsWith('--table=')) args.table = a.slice('--table='.length);
    else if (!args.userId) args.userId = a;
  }
  return args;
}

function usage() {
  console.error('usage: totp-code.js <userId> [--watch] [--table=UserProfile]');
}

async function getSecret(ddb, table, userId) {
  const r = await ddb.send(new GetCommand({ TableName: table, Key: { userId } }));
  if (!r.Item) throw new Error(`No UserProfile row for userId=${userId}`);
  if (!r.Item.mfaSecret)
    throw new Error(`UserProfile ${userId} has no mfaSecret (MFA not enrolled)`);
  return r.Item.mfaSecret;
}

function printCode(secret) {
  const code = authenticator.generate(secret);
  const remaining = authenticator.timeRemaining();
  process.stdout.write(`${code}  (${remaining}s left)\n`);
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    usage();
    process.exit(1);
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  let secret;
  try {
    secret = await getSecret(ddb, args.table, args.userId);
  } catch (e) {
    if (e.name === 'ResourceNotFoundException' || e.$metadata) {
      console.error(`AWS error: ${e.message}`);
      process.exit(2);
    }
    console.error(e.message);
    process.exit(1);
  }

  if (!args.watch) {
    printCode(secret);
    return;
  }

  printCode(secret);
  setInterval(() => printCode(secret), 1000);
})();
