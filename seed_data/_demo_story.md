# Demo Story: High-value transfer triggers MFA

**Rule id:** `DEMO_HIGH_VALUE_UNSEEN_DEVICE`
**Trigger user:** `USER#001` (username: `user001`, password: `Password1`)

## Steps to replay on stage

1. Run `POST /admin/dev/reseed` (requires `DEMO_MODE=1` env var) to restore all seed data.
2. Sign in as `user001` (`Password1`). The login is low-risk (ALLOW) - this beat shows the normal path.
3. On the Transfer page, enter any amount >= 5000 (e.g. `7500`) and submit.
   - The browser fingerprint is not in `user001`'s known device list, so the L1 rule fires.
   - The backend returns `action: "MFA"` with a challenge id.
4. The MFA screen appears (same UI as the login MFA screen for visual continuity).
5. Enter `123456` (static demo OTP, valid when `MFA_MODE=static`).
6. Transfer completes. The success page shows the transfer id.
7. In admin Decisions: two rows appear for `USER#001`:
   - `action: MFA`, `ruleId: DEMO_HIGH_VALUE_UNSEEN_DEVICE` - the challenge row
   - `action: ALLOW`, `ruleId: DEMO_HIGH_VALUE_UNSEEN_DEVICE`, `mfaPath: TRANSFER_RISK` - the verify row
8. Click either row to open the trace drawer. The `matched` array shows the two conditions that fired.

## DemoPanel shortcuts

Open the floating Debug panel (bottom-right corner) while logged in:

- **Force high-risk on a small amount:** Toggle "Force next transfer high-risk". The next transfer
  you submit (any amount, even $1) will trigger MFA via the `forceHighRisk` backend flag.
  Hint label: "Forces MFA on the next transfer regardless of amount."
- **Unseen device control:** Change the Device ID field to any string not in user001's known list
  to trigger MFA naturally on a large amount. The panel shows a green "(known)" or amber "(unseen)"
  label next to the current device id so you can see at a glance what the engine will see.

## Environment variables required

- `DEMO_MODE=1` - enables the `/admin/dev/reseed` endpoint
- `MFA_MODE=static` - accepts `123456` as the OTP for frictionless demo
- `LARGE_TRANSFER_AMOUNT_USD=5000` - threshold above which unseen-device check fires (default)
- `UNSEEN_DEVICE_DAYS_THRESHOLD=30` - device must have been seen within this many days (default)
- `TRANSFER_MFA_TTL_SEC=300` - lifetime of a transfer MFA challenge in seconds (default 5 min)

## One-button verification

Run this before going on stage:

```bash
npm run rehearsal
```

It executes the full demo story end-to-end (reseed, login, MFA, warm-up transfer, big
transfer + MFA verify, decisions, trace, budget) and prints a pass/warn/fail table.
Exit 0 means demo-ready. Exit 1 prints the failing step and the exact error.

Useful flags:
- `--dry-run`   show what would run without making network calls
- `--no-reseed` skip reseed when repeating back-to-back
- `--verbose`   print request and response bodies for each step

Expected run time against a warm Lambda is under 3 seconds.

```bash
# Minimal - uses defaults (localhost, user001 / Password1 / 123456)
npm run rehearsal

# Against the deployed API
BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com \
  DEMO_MODE_EXPECTED=1 \
  npm run rehearsal

# Skip reseed on consecutive runs
npm run rehearsal -- --no-reseed
```

See `scripts/rehearsal.mjs` for the full env var reference and `--help`.

## Engine note

The `scoreTransfer` L1 rule has two MFA paths, checked in this order:

1. `forceHighRisk === true` - highest precedence, fires regardless of amount.
   Set via the DemoPanel toggle. Clears automatically after the next transfer call.
2. `amount >= LARGE_TRANSFER_AMOUNT_USD AND deviceFingerprintSeenDays > UNSEEN_DEVICE_DAYS_THRESHOLD`
   Fires on a natural large-amount + unseen-device combination.

The warm-up transfer (step 6 in rehearsal) keeps `tc1h` low so the big transfer hits path 2
cleanly without interference from the velocity REVIEW branch.
