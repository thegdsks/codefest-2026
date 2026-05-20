const fs = require('node:fs');
const path = require('node:path');
const { DynamoDBClient, BatchWriteItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');

// Key schema for each table (used during --purge-first to extract keys for DeleteRequests)
const TABLE_KEY_SCHEMA = {
  UserProfile: { pk: 'userId', pkType: 'S', sk: null },
  UserSession: { pk: 'sessionId', pkType: 'S', sk: null },
  UserActivity: { pk: 'userId', pkType: 'S', sk: 'activityTime', skType: 'N' },
  DecisionStore: { pk: 'decisionId', pkType: 'S', sk: null },
  UserState: { pk: 'userId', pkType: 'S', sk: null },
};

const ALL_TABLES = Object.keys(TABLE_KEY_SCHEMA);
const BATCH_SIZE = 25;
const MAX_RETRIES = 3;
const SEED_DATA_DIR = path.resolve(__dirname, '..', 'seed_data');
const REGION = process.env.AWS_REGION || 'us-east-1';

function parseArgs(argv) {
  const args = { tables: ALL_TABLES, dryRun: false, purgeFirst: false };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--table=')) {
      const list = arg
        .slice('--table='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      args.tables = list;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--purge-first') {
      args.purgeFirst = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function loadSeedItems(tableName) {
  const items = [];
  let batch = 1;
  while (true) {
    const filePath = path.join(SEED_DATA_DIR, `${tableName}_batch_${batch}.json`);
    if (!fs.existsSync(filePath)) break;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`[seed-ddb] Failed to parse ${filePath}: ${err.message}`);
      break;
    }
    const tableData = parsed[tableName];
    if (!Array.isArray(tableData)) {
      console.error(`[seed-ddb] Unexpected shape in ${filePath}: no array at key "${tableName}"`);
      break;
    }
    items.push(...tableData);
    batch++;
  }
  return items;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sends one batch with exponential-backoff retry for UnprocessedItems.
// Returns the number of items that permanently failed.
async function sendBatchWithRetry(client, tableName, batch, label, batchIdx) {
  let pending = batch;
  let attempt = 0;

  while (pending.length > 0 && attempt < MAX_RETRIES) {
    if (attempt > 0) {
      await sleep(100 * 2 ** attempt);
    }
    try {
      const cmd = new BatchWriteItemCommand({ RequestItems: { [tableName]: pending } });
      const resp = await client.send(cmd);
      const unprocessed = resp.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        pending = unprocessed;
        attempt++;
      } else {
        pending = [];
      }
    } catch (err) {
      console.error(
        `[seed-ddb] ${label} ${tableName} batch ${batchIdx + 1} attempt ${attempt + 1} error: ${err.message}`
      );
      attempt++;
      if (attempt >= MAX_RETRIES) {
        const failed = pending.length;
        pending = [];
        return failed;
      }
    }
  }

  if (pending.length > 0) {
    console.error(
      `[seed-ddb] ${label} ${tableName}: ${pending.length} items failed after ${MAX_RETRIES} retries`
    );
    return pending.length;
  }

  return 0;
}

async function batchWriteWithRetry(client, tableName, requests, dryRun, label) {
  const batches = chunk(requests, BATCH_SIZE);
  let totalErrors = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (dryRun) {
      console.log(
        `[dry-run] ${label} ${tableName}: batch ${batchIdx + 1}/${batches.length} - would send ${batch.length} requests`
      );
      continue;
    }
    totalErrors += await sendBatchWithRetry(client, tableName, batch, label, batchIdx);
  }

  return { written: requests.length - totalErrors, errors: totalErrors };
}

async function scanAllKeys(client, tableName, keySchema) {
  const keys = [];
  let lastKey;
  do {
    const cmd = new ScanCommand({
      TableName: tableName,
      ProjectionExpression: keySchema.sk ? '#pk, #sk' : '#pk',
      ExpressionAttributeNames: keySchema.sk
        ? { '#pk': keySchema.pk, '#sk': keySchema.sk }
        : { '#pk': keySchema.pk },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });
    const resp = await client.send(cmd);
    if (resp.Items) keys.push(...resp.Items);
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return keys;
}

function buildDeleteRequests(keys, keySchema) {
  return keys.map((item) => {
    const key = { [keySchema.pk]: item[keySchema.pk] };
    if (keySchema.sk) key[keySchema.sk] = item[keySchema.sk];
    return { DeleteRequest: { Key: key } };
  });
}

async function resetTable(client, tableName, args) {
  const result = { table: tableName, seeded: 0, purged: 0, errors: 0 };
  const keySchema = TABLE_KEY_SCHEMA[tableName];

  if (!keySchema) {
    console.error(`[seed-ddb] Unknown table: ${tableName}`);
    result.errors++;
    return result;
  }

  // Load seed items
  const seedItems = loadSeedItems(tableName);
  if (seedItems.length === 0) {
    console.warn(`[seed-ddb] No seed items found for ${tableName} - skipping`);
    return result;
  }

  // Purge pass
  if (args.purgeFirst) {
    if (args.dryRun) {
      console.log(`[dry-run] purge ${tableName}: would scan and delete all existing items`);
      result.purged = 0; // unknown count without scanning
    } else {
      console.log(`[seed-ddb] Scanning ${tableName} for purge...`);
      let existingKeys;
      try {
        existingKeys = await scanAllKeys(client, tableName, keySchema);
      } catch (err) {
        console.error(`[seed-ddb] Scan failed for ${tableName}: ${err.message}`);
        result.errors++;
        return result;
      }

      if (existingKeys.length > 0) {
        const deleteReqs = buildDeleteRequests(existingKeys, keySchema);
        console.log(`[seed-ddb] Purging ${deleteReqs.length} items from ${tableName}...`);
        const purgeResult = await batchWriteWithRetry(
          client,
          tableName,
          deleteReqs,
          false,
          'purge'
        );
        result.purged = purgeResult.written;
        result.errors += purgeResult.errors;
      } else {
        console.log(`[seed-ddb] ${tableName} is already empty`);
      }
    }
  }

  // Seed pass (PutRequests already in DDB wire format)
  const putRequests = seedItems; // each is {PutRequest: {Item: {...}}}

  if (args.dryRun) {
    console.log(
      `[dry-run] seed ${tableName}: would write ${putRequests.length} items in ${Math.ceil(putRequests.length / BATCH_SIZE)} batch(es)`
    );
    result.seeded = putRequests.length;
  } else {
    console.log(`[seed-ddb] Seeding ${putRequests.length} items into ${tableName}...`);
    const seedResult = await batchWriteWithRetry(client, tableName, putRequests, false, 'seed');
    result.seeded = seedResult.written;
    result.errors += seedResult.errors;
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);

  // Validate table names
  for (const t of args.tables) {
    if (!TABLE_KEY_SCHEMA[t]) {
      console.error(`[seed-ddb] Unknown table "${t}". Valid tables: ${ALL_TABLES.join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`[seed-ddb] Region: ${REGION}`);
  console.log(`[seed-ddb] Tables: ${args.tables.join(', ')}`);
  console.log(`[seed-ddb] Dry-run: ${args.dryRun}`);
  console.log(`[seed-ddb] Purge-first: ${args.purgeFirst}`);
  console.log('');

  const client = new DynamoDBClient({ region: REGION, maxAttempts: 3 });

  const results = [];
  let hasErrors = false;

  for (const tableName of args.tables) {
    const result = await resetTable(client, tableName, args);
    results.push(result);
    if (result.errors > 0) hasErrors = true;
  }

  console.log('');
  console.log('--- summary ---');
  const colW = 16;
  console.log(
    'table'.padEnd(colW) + 'seeded'.padStart(8) + 'purged'.padStart(8) + 'errors'.padStart(8)
  );
  console.log('-'.repeat(colW + 24));
  for (const r of results) {
    console.log(
      r.table.padEnd(colW) +
        String(r.seeded).padStart(8) +
        String(r.purged).padStart(8) +
        String(r.errors).padStart(8)
    );
  }
  console.log('');

  if (hasErrors) {
    console.error('[seed-ddb] Completed with errors');
    process.exit(1);
  } else {
    console.log('[seed-ddb] Done');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[seed-ddb] Fatal:', err.message);
  process.exit(1);
});
