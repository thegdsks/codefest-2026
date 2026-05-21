# Block flow rehearsal script

Demo path: show the fraud engine blocking a transfer, then an admin clearing the block.

## Setup

1. Open two browser tabs:
   - Tab A: customer UI at `/login`
   - Tab B: admin UI at `/admin/decisions`

2. Confirm `DEMO_MODE=1` is set on the backend so the demo controls are visible.

## Step 1: customer login

1. In Tab A, sign in as `user001` / `Password1`.
2. Navigate to `/transfer`.

## Step 2: force a BLOCK decision

1. Open the Demo Debugger (bottom-right corner of the customer UI).
2. Under "Transfer Demo", click "Force next transfer BLOCK".
3. The button label changes to "Flag set - submit transfer".
4. Close the debugger.
5. Fill in any transfer amount and click "Confirm Points Conversion".
6. The BlockBanner appears with title "Transfer blocked by fraud protection" and the decisionId as the reference.

Talk-track: "The fraud engine returned a BLOCK decision. The customer sees the full block screen, not a generic error. Three actions are offered: contact support, view activity history, or try a smaller amount."

## Step 3: observe in the admin feed

1. Switch to Tab B.
2. Click Refresh or wait for the auto-poll.
3. The new FRAUD_TRANSFER BLOCK row has a rose-colored left border.
4. The action column shows the BLOCK pill.

Talk-track: "In the admin decision feed, BLOCK rows are visually distinct - the rose border draws the eye immediately."

## Step 4: admin clears the block

1. In Tab B, copy the userId from the blocked row (e.g. `USER#001`).
2. Open a terminal or REST client and call:

```
POST /admin/users/USER%23001/clear-block
Authorization: Basic <base64 of demoClient:demoSecret>
```

Expected response:

```json
{
  "data": {
    "cleared": true,
    "userId": "USER#001",
    "originalDecisionId": "DEC#...",
    "releasedAt": 1747900000
  }
}
```

3. Back in Tab B, refresh the decisions feed.
4. The BLOCK row now shows a "Released" sky-blue pill next to the BLOCK action.

Talk-track: "The admin issued a clear-block. A RELEASE audit row is written to DecisionStore and UserState.isBlocked is removed. The customer can now retry."

## Step 5: customer retries after block cleared

1. Switch back to Tab A.
2. In the BlockBanner, if NEXT_PUBLIC_DEMO_MODE=true, a "Demo: clear my block" button is visible.
3. Click it. The banner disappears and the transfer form is available again.
4. Submit a normal transfer - it succeeds.

Talk-track: "After the block is cleared, the customer can immediately retry. No page reload needed."

## ACCOUNT_BLOCKED variant (login path)

1. Manually set `isBlocked: true` on a user's UserState via the reseed admin panel or the mutateDemoUser endpoint.
2. Attempt to log in as that user.
3. Instead of the login form, the BlockBanner renders with title "Your account is temporarily blocked."
4. In demo mode, the "Demo: clear my block" button calls the clear-block endpoint and then lets the user retry login.
