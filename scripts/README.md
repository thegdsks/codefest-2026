# scripts/

Operational scripts for the Signal Force demo environment.

---

## snapshot-demo.sh

Read-only evidence capture. Scans all five DynamoDB tables and smokes every
API endpoint, then writes a single JSON blob to `docs-local/` outside the
repo. Use it as a backup if AWS has connectivity issues during the live demo,
and as post-demo evidence for the judges.

### Requirements

The script requires three CLI tools to be installed and on `PATH`:

| Tool | Purpose |
| ---- | ------- |
| `aws` | DynamoDB scans via AWS CLI v2 |
| `curl` | HTTP smoke tests |
| `jq` | JSON assembly |

Active AWS credentials with `dynamodb:Scan` on all five tables are required
for the DDB phase. The API phase only needs network access to the API Gateway
URL.

### When to run

- **T-30 min before the demo** - baseline capture while AWS is healthy.
- **After the demo** - captures final state including all live decisions made
  during the presentation.

If AWS is unreachable at demo time, open the most recent `demo-evidence-*.json`
file in `docs-local/` to pull up stored data.

### Usage

```bash
# Default: reads from the live API, writes to ../docs-local/ (sibling of repo root)
npm run snapshot:demo

# Or invoke directly
bash scripts/snapshot-demo.sh

# Override API URL or output directory
API_URL=https://your-api-url.execute-api.us-east-1.amazonaws.com \
  OUT_DIR=/tmp/my-evidence \
  bash scripts/snapshot-demo.sh
```

### Environment variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `API_URL` | `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com` | Base URL for the API |
| `OUT_DIR` | `<repo>/../docs-local` | Directory to write output files into |

### Output format

Each run writes one file and updates a symlink:

```
docs-local/
  demo-evidence-20260520T143000Z.json   <- timestamped snapshot
  demo-evidence-latest.json             <- symlink to most recent
```

Top-level shape of the JSON:

```json
{
  "capturedAt": "2026-05-20T14:30:00Z",
  "apiUrl": "https://...",
  "commit": "<git SHA>",
  "ddb": {
    "UserProfile":   [...],
    "UserSession":   [...],
    "UserActivity":  [...],
    "DecisionStore": [...],
    "UserState":     [...]
  },
  "endpoints": {
    "POST /auth/login (Charlotte, low-risk)": { "status": "200", "body": { ... } },
    "GET /offers (USER#001)":                 { "status": "200", "body": { ... } }
  },
  "summary": {
    "tables": {
      "UserProfile": 30,
      "UserSession": 30,
      "UserActivity": 30,
      "DecisionStore": 30,
      "UserState": 30
    },
    "endpoints": 15,
    "errors": 0
  }
}
```

### Endpoints covered (15 total)

| # | Method | Path | Scenario |
|---|--------|------|---------|
| 1 | POST | /auth/login | Charlotte, low-risk, known location |
| 2 | POST | /auth/login | Charlotte, new location (triggers MFA) |
| 3 | POST | /auth/mfa/verify | Bad OTP (expects 401) |
| 4 | POST | /transactions/transfer | Normal transfer USER#001 -> USER#002 |
| 5 | POST | /transactions/transfer | Normal transfer USER#003 -> USER#004 |
| 6 | GET | /offers | USER#001 |
| 7 | GET | /offers | USER#002 |
| 8 | POST | /offers/action | IMPRESSION for OFF#001 |
| 9 | GET | /nudges | USER#001 |
| 10 | POST | /nudges/action | SHOWN for NUDGE#PROFILE |
| 11 | GET | /user/profile | USER#001 |
| 12 | GET | /user/profile-completeness | USER#001 |
| 13 | GET | /dashboard | USER#001 |
| 14 | GET | /admin/decisions | admin list |
| 15 | GET | /admin/metrics | admin metrics |

### Notes

- The script is read-only. It does not mutate any state beyond the side-effects
  that the API endpoints normally produce (activity records, decisions). It
  does not write to DynamoDB directly.
- DDB scans are capped at 200 items per table (`--max-items 200`), sufficient
  for the 30-record seed data.
- A failed curl (connection refused, timeout) is recorded in the output as
  `"status": "curl_error_7"` rather than crashing the script.
- The `summary.errors` count covers curl failures and HTTP 5xx responses.
  HTTP 4xx (including the intentional bad-OTP test) are not counted as errors.

---

## snapshot-demo.test.sh

Unit test for the snapshot script. Mocks `aws` with a stub that returns empty
tables, points the API at `127.0.0.1:9999` (connection refused), and verifies
that the script exits 0, writes a valid JSON file, and records all failures in
`summary.errors`.

```bash
bash scripts/snapshot-demo.test.sh
```

No additional dependencies beyond `bash` and `jq`.
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
