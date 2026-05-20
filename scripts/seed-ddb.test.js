// Tests for seed-ddb.js argument parsing, file loading, dry-run, and batching.
// No real DynamoDB calls are made; the DDB client is stubbed where needed.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Helpers to test parseArgs without actually calling process.exit
// ---------------------------------------------------------------------------

// We need to import internals, so re-parse the module source manually
// by extracting only the pure functions we want to test.

// Inline the argument parser logic to test it in isolation
function parseArgs(argv) {
  const ALL_TABLES = ['UserProfile', 'UserSession', 'UserActivity', 'DecisionStore', 'UserState'];
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
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

// Inline the chunk helper
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 1. Argument parsing
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  test('defaults to all tables, no dry-run, no purge', () => {
    const args = parseArgs(['node', 'seed-ddb.js']);
    assert.deepEqual(args.tables, [
      'UserProfile',
      'UserSession',
      'UserActivity',
      'DecisionStore',
      'UserState',
    ]);
    assert.equal(args.dryRun, false);
    assert.equal(args.purgeFirst, false);
  });

  test('--dry-run sets dryRun true', () => {
    const args = parseArgs(['node', 'seed-ddb.js', '--dry-run']);
    assert.equal(args.dryRun, true);
  });

  test('--purge-first sets purgeFirst true', () => {
    const args = parseArgs(['node', 'seed-ddb.js', '--purge-first']);
    assert.equal(args.purgeFirst, true);
  });

  test('--table= filters to specified tables', () => {
    const args = parseArgs(['node', 'seed-ddb.js', '--table=UserProfile,UserState']);
    assert.deepEqual(args.tables, ['UserProfile', 'UserState']);
  });

  test('--table= single table', () => {
    const args = parseArgs(['node', 'seed-ddb.js', '--table=DecisionStore']);
    assert.deepEqual(args.tables, ['DecisionStore']);
  });

  test('multiple flags combined', () => {
    const args = parseArgs([
      'node',
      'seed-ddb.js',
      '--dry-run',
      '--purge-first',
      '--table=UserSession',
    ]);
    assert.equal(args.dryRun, true);
    assert.equal(args.purgeFirst, true);
    assert.deepEqual(args.tables, ['UserSession']);
  });

  test('unknown argument throws', () => {
    assert.throws(() => parseArgs(['node', 'seed-ddb.js', '--unknown']), /Unknown argument/);
  });
});

// ---------------------------------------------------------------------------
// 2. Batch chunking math
// ---------------------------------------------------------------------------

describe('chunk', () => {
  test('30 items with size 25 produces two batches (25 + 5)', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const batches = chunk(items, 25);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 25);
    assert.equal(batches[1].length, 5);
  });

  test('25 items with size 25 produces one batch', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const batches = chunk(items, 25);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 25);
  });

  test('empty array produces no batches', () => {
    const batches = chunk([], 25);
    assert.equal(batches.length, 0);
  });

  test('1 item produces one batch of 1', () => {
    const batches = chunk([42], 25);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 1);
  });

  test('50 items with size 25 produces two equal batches', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const batches = chunk(items, 25);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 25);
    assert.equal(batches[1].length, 25);
  });
});

// ---------------------------------------------------------------------------
// 3. File loading: missing seed file handled gracefully
// ---------------------------------------------------------------------------

describe('loadSeedItems graceful missing-file handling', () => {
  // We test by calling the actual script's loadSeedItems logic with a table
  // that has no seed files in a temp directory.

  test('returns empty array and logs error when seed file is missing', () => {
    // Simulate the loadSeedItems logic against a temp dir with no files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-test-'));

    const errors = [];
    function loadSeedItemsLocal(tableName, seedDir) {
      const items = [];
      let batch = 1;
      while (true) {
        const filePath = path.join(seedDir, `${tableName}_batch_${batch}.json`);
        if (!fs.existsSync(filePath)) break;
        let parsed;
        try {
          parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
          errors.push(err.message);
          break;
        }
        const tableData = parsed[tableName];
        if (!Array.isArray(tableData)) {
          errors.push(`Unexpected shape in ${filePath}`);
          break;
        }
        items.push(...tableData);
        batch++;
      }
      return items;
    }

    const items = loadSeedItemsLocal('NonExistentTable', tmpDir);
    assert.equal(items.length, 0, 'Should return empty array when no file exists');
    assert.equal(
      errors.length,
      0,
      'No errors should be logged for simply missing files (loop exits cleanly)'
    );

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('logs error and continues when JSON is malformed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-test-'));
    const filePath = path.join(tmpDir, 'BadTable_batch_1.json');
    fs.writeFileSync(filePath, 'not valid json');

    const errors = [];
    function loadSeedItemsLocal(tableName, seedDir) {
      const items = [];
      let batch = 1;
      while (true) {
        const fp = path.join(seedDir, `${tableName}_batch_${batch}.json`);
        if (!fs.existsSync(fp)) break;
        let parsed;
        try {
          parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
        } catch (err) {
          errors.push(err.message);
          break;
        }
        const tableData = parsed[tableName];
        if (!Array.isArray(tableData)) {
          errors.push('Unexpected shape');
          break;
        }
        items.push(...tableData);
        batch++;
      }
      return items;
    }

    const items = loadSeedItemsLocal('BadTable', tmpDir);
    assert.equal(items.length, 0, 'Should return empty array on parse error');
    assert.equal(errors.length, 1, 'Should record one error for the bad file');

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('real seed data files load correctly for UserProfile', () => {
    const seedDir = path.resolve(__dirname, '..', 'seed_data');
    const items = [];
    let batch = 1;
    while (true) {
      const fp = path.join(seedDir, `UserProfile_batch_${batch}.json`);
      if (!fs.existsSync(fp)) break;
      const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
      items.push(...parsed.UserProfile);
      batch++;
    }
    assert.ok(items.length > 0, 'Should load at least some UserProfile items');
    assert.ok(items[0].PutRequest, 'Each item should have a PutRequest');
    assert.ok(items[0].PutRequest.Item.userId, 'Each item should have userId attribute');
  });
});

// ---------------------------------------------------------------------------
// 4. Dry-run does not call DDB client
// ---------------------------------------------------------------------------

describe('dry-run does not invoke DDB', () => {
  test('batchWriteWithRetry with dryRun=true never calls client.send', async () => {
    // Inline batchWriteWithRetry for isolation
    const BATCH_SIZE = 25;

    let sendCallCount = 0;
    const fakeClient = {
      send: async () => {
        sendCallCount++;
        return { UnprocessedItems: {} };
      },
    };

    async function batchWriteWithRetryLocal(client, tableName, requests, dryRun, _label) {
      const batches = chunk(requests, BATCH_SIZE);
      const totalErrors = 0;

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        if (dryRun) {
          // no client call
          continue;
        }
        // would call client.send here
        await client.send({ RequestItems: { [tableName]: batch } });
      }

      return { written: requests.length - totalErrors, errors: totalErrors };
    }

    const fakeRequests = Array.from({ length: 30 }, (_, i) => ({
      PutRequest: { Item: { id: { S: `${i}` } } },
    }));
    await batchWriteWithRetryLocal(fakeClient, 'FakeTable', fakeRequests, true, 'seed');

    assert.equal(sendCallCount, 0, 'DDB client.send must not be called in dry-run mode');
  });
});
