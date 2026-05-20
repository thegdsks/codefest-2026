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
