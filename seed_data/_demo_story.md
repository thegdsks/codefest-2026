# Demo Story: High-value transfer triggers MFA

**Rule id:** `DEMO_HIGH_VALUE_UNSEEN_DEVICE`
**Trigger user:** `USER#001` (username: `user001`, password: `Password1`)

## Steps to replay on stage

1. Run `POST /admin/dev/reseed` (requires `DEMO_MODE=1` env var) to restore all seed data.
2. Log in as `user001` to get a bearer token. This is the "clean device, known location" beat - login is ALLOW.
3. Attempt `POST /customer/transfer` with `userId: USER#001`, `recipientId: USER#002`, `amount: 7500`.
   - The transfer velocity is within normal range (tc1h = 1 after the first attempt).
   - The L2 (LLM) classify call receives score=60 gray-zone context and returns `MFA`.
4. Complete MFA with the TOTP code (or the static OTP `123456` when `MFA_MODE=static`).
5. Open the admin drawer for `USER#001` - the `DEC#DEMO` row shows:
   - `action: MFA`, `ruleId: DEMO_HIGH_VALUE_UNSEEN_DEVICE`
   - Matched conditions: amount >= 5000, deviceFingerprintSeenDays > 30
   - LLM rationale explaining the 12x baseline deviation and unseen device

## Environment variables required

- `DEMO_MODE=1` - enables the `/admin/dev/reseed` endpoint
- `MFA_MODE=static` (optional) - accepts `123456` as the TOTP code for frictionless demo

## Engine note

The `scoreTransfer` L1 rule scores on velocity (`tc1h`). A single transfer at tc1h=1
scores 10 (LOW, ALLOW) and skips the LLM. To ensure L2 fires and returns MFA during
the demo, perform one prior transfer first to bring tc1h to 2 (gray-zone score 60),
then attempt the $7500 transfer. The `DEC#DEMO` seed record in DecisionStore already
shows the expected outcome in the admin drawer regardless of the live call result.
