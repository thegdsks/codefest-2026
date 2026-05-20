# scripts/

## seed-ddb.js - DynamoDB seed reset

Resets the five demo DynamoDB tables to the canonical 30-record-per-table state
defined in `seed_data/`. Use this whenever demo state drifts mid-demo or before
a fresh demo run.

### Prerequisites

- Node.js 18 or later
- AWS credentials in the environment (env vars, `~/.aws/credentials`, or an
  EC2/ECS instance role)
- `AWS_REGION` set to `us-east-1` (default if not set)

Verify before running:

```sh
aws sts get-caller-identity
```

The script targets tables in account 242777378540. Confirm `AWS_PROFILE` is set
correctly before running without `--dry-run`.

### Default behavior

Without flags the script runs an idempotent merge: it issues `PutRequest` for
all 30 items in each table. Existing items with the same primary key are
overwritten; any extra items left from a demo run are left in place. This is
safe to run multiple times.

```sh
node scripts/seed-ddb.js
# or
npm run seed:reset
```

### Common invocations

**Preview only (no writes):**

```sh
node scripts/seed-ddb.js --dry-run
```

**Full reset, all five tables:**

```sh
node scripts/seed-ddb.js
```

**Full reset with purge (removes all extras before seeding):**

```sh
node scripts/seed-ddb.js --purge-first
```

Use `--purge-first` when you want a clean slate. It scans each table for all
existing keys, deletes them in batches, then seeds the canonical data.

**Single table reset:**

```sh
node scripts/seed-ddb.js --table=UserState
```

**Multiple specific tables:**

```sh
node scripts/seed-ddb.js --table=UserProfile,UserSession
```

**Dry-run with purge to preview what would be deleted:**

```sh
node scripts/seed-ddb.js --dry-run --purge-first --table=UserActivity
```

### Flag reference

| Flag | Description |
| --- | --- |
| `--dry-run` | Print intended actions without writing to DynamoDB. |
| `--purge-first` | Scan and delete all existing items before seeding. |
| `--table=A,B,...` | Limit to named tables. Defaults to all five. |

### Run before every demo

Run at minimum a dry-run check before the demo starts to confirm seed files
load and credentials work:

```sh
node scripts/seed-ddb.js --dry-run
```

If state drifted during the demo, run a targeted reset on the affected table
first, then fall back to a full `--purge-first` reset if needed.

### Tables

| Table | Partition key | Sort key |
| --- | --- | --- |
| UserProfile | userId (S) | - |
| UserSession | sessionId (S) | - |
| UserActivity | userId (S) | activityTime (N) |
| DecisionStore | decisionId (S) | - |
| UserState | userId (S) | - |

### Exit codes

- `0` - all tables seeded without errors
- `1` - one or more errors occurred (check stderr for details)
