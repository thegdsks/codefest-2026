# Test Personas Playbook

Last updated: 2026-05-21

All demo personas use password `Password1`.

## Quick Reference Table

| ID | Username | Tier | Points | Profile | MFA | Demo Beat |
|---|---|---|---|---|---|---|
| USER#001 | user001 | Gold | 510 | 45% | Yes | Baseline: high-value transfer triggers MFA path |
| USER#020 | user020 | Silver | 700 | 40% | No | Mid-flow: Silver with incomplete profile, no MFA |
| USER#031 | maya031 | Silver | 1,500 | 25% | No | First-timer: maximum surfaces shown simultaneously |
| USER#032 | dre032 | Gold | 49,500 | 75% | No | Prestige+Catalyst+MFA triple: 500 pts from Platinum |
| USER#033 | priya033 | Diamond | 120,000 | 95% | Yes | AI Mode: demotes nudges, shows celebratory states only |
| USER#034 | ethan034 | Gold | 32,000 | 60% | Yes | Velocity: 3 transfers in last hour, FRAUD_TRANSFER risk |
| USER#035 | naomi035 | Silver | 4,200 | 40% | No | Abandon: TRANSFER_ABANDON_OFFER fires from 90s-old draft |
| USER#036 | marcus036 | Gold | 18,000 | 55% | Yes | AI signals: rage_click + dwell data for LLM reasoning |
| USER#037 | inez037 | Platinum | 88,000 | 80% | Yes | Booking: BOOKING_CONFIRMATION_OFFER fires on landing |
| USER#038 | owen038 | Silver | 8,800 | 30% | No | Fraud: BLOCK + REVIEW history, fraud-explainer AI demo |

---

## USER#001 - Baseline (existing)

**Username:** `user001` | **Password:** `Password1` | **userId:** `USER#001`

**Tier:** Gold | **Points:** 510 | **Profile:** 45% | **MFA:** Enabled

**What the demo shows:** Log in as user001 and attempt a 7,500-point transfer. The fraud engine fires on the high-value amount combined with an unseen device fingerprint, routing through the MFA challenge. This is the primary path for showing the fraud decision card and MFA flow in sequence.

**Surfaces SHOWN on login:** MFA_ENROLLMENT_OFFER (already enrolled, so hidden), PROFILE_COMPLETION_NUDGE (45% - shown), PRESTIGE_ADVANCE (510 pts, well below threshold - hidden unless tier thresholds configured low).

---

## USER#020 - Mid-flow Silver (existing)

**Username:** `user020` | **Password:** `Password1` | **userId:** `USER#020`

**Tier:** Silver | **Points:** 700 | **Profile:** 40% | **MFA:** Disabled

**What the demo shows:** Use user020 when you need a Silver member mid-journey who has not finished their profile and has not enrolled MFA. Both PROFILE_COMPLETION_NUDGE and MFA_ENROLLMENT_OFFER surfaces are eligible.

**Surfaces SHOWN on login:** PROFILE_COMPLETION_NUDGE (40%), MFA_ENROLLMENT_OFFER.

---

## USER#031 - Maya, Silver Newcomer

**Username:** `maya031` | **Password:** `Password1` | **userId:** `USER#031`

**Tier:** Silver | **Points:** 1,500 | **Profile:** 25% | **MFA:** Disabled

**What the demo shows:** Maya is brand-new. Profile at 25% means CATALYST_ELEVATE fires (complete profile to reach next tier). No MFA means MFA_ENROLLMENT_OFFER fires. Silver with low points means PRESTIGE_ADVANCE fires. All three surfaces appear simultaneously, demonstrating how the system surfaces multiple engagement opportunities for a new member. Use Maya as the opening beat of the demo when you need to show "here is everything the system can offer a newcomer."

**Surfaces SHOWN on login:** PRESTIGE_ADVANCE, CATALYST_ELEVATE, MFA_ENROLLMENT_OFFER.

---

## USER#032 - Dre, Gold Near-Platinum

**Username:** `dre032` | **Password:** `Password1` | **userId:** `USER#032`

**Tier:** Gold | **Points:** 49,500 | **Profile:** 75% | **MFA:** Disabled

**What the demo shows:** Dre is 500 points from Platinum, at 75% profile completion, and has no MFA. PRESTIGE_ADVANCE fires with a tight delta (500 pts). CATALYST_ELEVATE fires at 75% profile. MFA_ENROLLMENT_OFFER fires. Use Dre when you want to show all three upgrade surfaces co-existing and then demonstrate how the AI prioritizer reorders them: Prestige should rank 1 given the near-Platinum cliff, Catalyst second, MFA third.

**Surfaces SHOWN on login:** PRESTIGE_ADVANCE (500 pts gap, high urgency), CATALYST_ELEVATE (75% profile), MFA_ENROLLMENT_OFFER.

---

## USER#033 - Priya, Diamond Elite

**Username:** `priya033` | **Password:** `Password1` | **userId:** `USER#033`

**Tier:** Diamond | **Points:** 120,000 | **Profile:** 95% | **MFA:** Enabled

**What the demo shows:** Priya is at the top of the loyalty stack. With 120,000 points she is in the Diamond tier (100,000+ threshold). Profile is 95%, MFA is enrolled. Most nudge surfaces are ineligible or demoted by the AI prioritizer since there is nothing material to improve. Use Priya to contrast with Maya or Dre: toggle AI Mode on and show the LLM demoting all nudges, leaving only celebratory copy. This is the "AI Mode promote/demote" beat - log in as Dre (lots of surfaces), switch to AI Mode, then swap to Priya to show the opposite pole.

**Surfaces SHOWN on login:** PRESTIGE_ADVANCE hidden (already Diamond/top tier), MFA_ENROLLMENT_OFFER hidden (already enrolled), CATALYST_ELEVATE hidden (95%). Celebratory or welcome copy may show depending on rule configuration.

---

## USER#034 - Ethan, Frequent Transferrer

**Username:** `ethan034` | **Password:** `Password1` | **userId:** `USER#034`

**Tier:** Gold | **Points:** 32,000 | **Profile:** 60% | **MFA:** Enabled

**What the demo shows:** Ethan has 3 transfers in the last hour (seeded in UserState: `transferCount1h: 3`). Initiate another transfer from his account to hit the velocity rule threshold and watch the fraud engine return a REVIEW or MFA action. Use Ethan for the "velocity-based fraud detection" beat: the transfer does not need to be high-value - frequency alone triggers the rule. Pairs well with the admin decision feed which shows back-to-back FRAUD_TRANSFER entries.

**Surfaces SHOWN on login:** PROFILE_COMPLETION_NUDGE (60%), MFA_ENROLLMENT_OFFER hidden (already enrolled).

---

## USER#035 - Naomi, The Abandoner

**Username:** `naomi035` | **Password:** `Password1` | **userId:** `USER#035`

**Tier:** Silver | **Points:** 4,200 | **Profile:** 40% | **MFA:** Disabled

**What the demo shows:** Naomi has an open `transferDraft` in UserState: 5,000 points to USER#013, last updated 90 seconds ago. The TRANSFER_ABANDON_OFFER surface fires when the backend detects a stale draft beyond the threshold (60 seconds). Log in as Naomi and the abandon-offer surface should appear immediately on the profile page. Use this beat to show the system catching intent signals and converting them to a nudge: "You started a transfer - pick up where you left off."

**Surfaces SHOWN on login:** TRANSFER_ABANDON_OFFER (draft is 90s old, above threshold), PROFILE_COMPLETION_NUDGE (40%), MFA_ENROLLMENT_OFFER.

---

## USER#036 - Marcus, Cautious Browser

**Username:** `marcus036` | **Password:** `Password1` | **userId:** `USER#036`

**Tier:** Gold | **Points:** 18,000 | **Profile:** 55% | **MFA:** Enabled

**What the demo shows:** Marcus has 5 UserActivity rows from the last 10 minutes: 3x `rage_click` on `results.search` and 2x `dwell_no_action`. These signals flow into the AI prioritizer (L2) as behavioral context. Log in as Marcus with AI Mode on and show the LLM rationale: "Member shows frustration signals on search results. Prioritizing search-assist offer over transfer nudge." This is the richest AI reasoning demo - the LLM has real behavioral data to reason over.

**Surfaces SHOWN on login:** PROFILE_COMPLETION_NUDGE (55%), MFA_ENROLLMENT_OFFER hidden (enrolled). AI may surface a search-assist or booking nudge if rules support it.

---

## USER#037 - Inez, The Booker

**Username:** `inez037` | **Password:** `Password1` | **userId:** `USER#037`

**Tier:** Platinum | **Points:** 88,000 | **Profile:** 80% | **MFA:** Enabled

**What the demo shows:** Inez booked 3 nights at PROP#42 approximately 4 minutes ago (seeded `recentBooking.bookedAt` = now - 240s, within the 5-minute window). The BOOKING_CONFIRMATION_OFFER surface fires on profile load, showing post-booking cross-sell copy ("Your stay is confirmed - earn 3x points with our partner dining program"). Use Inez to demonstrate the booking-intent surface and contrast it with the transfer surfaces shown for other personas.

**Surfaces SHOWN on login:** BOOKING_CONFIRMATION_OFFER (booked 4 min ago, within the 5-min window). MFA_ENROLLMENT_OFFER hidden (enrolled). CATALYST_ELEVATE may show at 80% profile.

---

## USER#038 - Owen, Flagged Suspicious

**Username:** `owen038` | **Password:** `Password1` | **userId:** `USER#038`

**Tier:** Silver | **Points:** 8,800 | **Profile:** 30% | **MFA:** Disabled

**What the demo shows:** Owen has two DecisionStore entries from the last 6 hours: DEC#031 is a FRAUD_TRANSFER BLOCK (15,000 points, Lagos, unseen location) and DEC#032 is a FRAUD_LOGIN REVIEW (impossible travel, 11,200 km jump). UserState has `isBlocked: true` and `isUnderReview: true`. Log in as Owen to show the ACCOUNT_BLOCKED screen first, then use "Demo: clear my block" to restore access and show the fraud-explainer panel on the profile page with both decisions visible. The AI rationale explains location mismatch and velocity. This is the fraud-explainer AI demo beat.

**Surfaces SHOWN on login:** Account blocked screen on first attempt. After clearing: MFA_ENROLLMENT_OFFER (no MFA), PROFILE_COMPLETION_NUDGE (30%). Fraud decision cards from DEC#031 and DEC#032 visible in the activity feed.

---

## Demo Rotation Pattern (5-minute slot)

Use this sequence for the main demo run:

**1. Maya (0:00-1:00) - "Welcome to the engagement system"**
Log in as maya031. Three surfaces appear simultaneously. Explain the signal-force model: profile, tier, MFA. No fraud, no noise - just a clear new-member experience.

**2. Dre (1:00-1:45) - "AI prioritization"**
Switch to dre032. Same three surfaces, different weights. Enable AI Mode. Show the LLM reordering: Prestige (rank 1) because the Platinum cliff is close. Explain why the AI demotes MFA below Prestige.

**3. Naomi (1:45-2:30) - "Intent signals"**
Switch to naomi035. The abandon-offer surface appears - Naomi left a transfer draft 90 seconds ago. Explain how real-time state feeds the surface engine.

**4. Marcus (2:30-3:15) - "Behavioral signals"**
Switch to marcus036 with AI Mode on. Open the AI rationale panel. Show the rage_click and dwell data feeding the LLM context. Read out the rationale copy.

**5. Owen (3:15-4:30) - "Fraud detection and explainability"**
Switch to owen038. Account blocked screen appears. Use "Demo: clear my block." Navigate to the activity/decisions feed. Show DEC#031 (transfer BLOCK) and DEC#032 (login REVIEW) with full matched-rule detail and LLM rationale.

**6. Priya (4:30-5:00) - "The AI knows when to stay quiet"**
Switch to priya033. Toggle AI Mode on. No nudge surfaces appear - the LLM demotes everything because Priya has nothing left to improve. Close with: "The system earns trust by not over-nudging."

---

## Demoing MFA via Impossible-Travel

The login fraud engine compares each user's current login location against **that same user's prior successful login**. Persona histories are independent - switching from maya031 to dre032 does not cross state.

The thresholds that govern what the engine returns:

| Window (same user, different location) | Result |
|---|---|
| delta < 60s | BLOCK (IMPOSSIBLE_TRAVEL) |
| 60s to 30 min | MFA challenge (SUSPICIOUS_LOCATION) |
| > 30 min | ALLOW |

### Option A: natural impossible-travel path

1. Click any persona (e.g. Maya) and let the login complete.
2. Wait at least 60 seconds after the first login completed.
3. Click the same persona from a different location (use the location field or change the demo context location picker).
4. The engine compares that user's prior login location to the new one. If they differ and the gap is 60s-30min, MFA fires.
5. Enter the static OTP `123456` at the MFA screen. The response shows `mfaPath: "STATIC"` confirming the static fallback path.

### Option B: Force MFA checkbox (fastest for live demo)

1. Enable DEMO_MODE on the backend (set `DEMO_MODE=1` in the Lambda environment or `.env.local`).
2. On the login form a "Force MFA challenge (demo)" checkbox appears.
3. Check it, then click any persona or click Sign In.
4. The fraud engine is bypassed entirely and the MFA challenge screen appears immediately.
5. Enter OTP `123456`. Login succeeds with `mfaPath: "DEMO_FORCED"`.

### Option C: persona quick-clear guarantee

Every persona click in the side panel now calls `POST /admin/users/{userId}/clear-block` before submitting the login form. This means:

- Clicking a persona that was previously blocked auto-clears the block.
- No manual "Demo: clear my block" step needed for persona switching.
- The clear-block call is best-effort; if the API is unavailable the login still proceeds.

### Verification curl (MFA window)

```bash
# First login for a user (sets lastLoginLocation = "Austin")
curl -s -X POST $API_URL/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"maya031","password":"Password1","location":"Austin","deviceId":"dev-demo"}' \
  | jq '.data.status'
# => "SUCCESS"

# Second login for the same user, different location, 90 seconds later
# (delta=90s, in 60-1800s MFA window)
curl -s -X POST $API_URL/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"maya031","password":"Password1","location":"Tokyo","deviceId":"dev-demo"}' \
  | jq '{status: .data.status, reason: .data.reason}'
# => {"status":"MFA_REQUIRED","reason":"SUSPICIOUS_LOCATION"}

# Verify MFA with static OTP
curl -s -X POST $API_URL/auth/mfa/verify \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"<sessionId from above>\",\"otp\":\"123456\"}" \
  | jq '{status: .data.status, mfaPath: .data.mfaPath}'
# => {"status":"SUCCESS","mfaPath":"STATIC"}
```

---

## Seed Command (run after PR merge)

```bash
node scripts/seed-ddb.js --table=UserProfile,UserActivity,UserState,DecisionStore
```

To add only the new personas without touching existing data, use `--purge-first` only if you want a full reset:

```bash
node scripts/seed-ddb.js --table=UserProfile,UserActivity,UserState,DecisionStore --purge-first
```

---

Related: [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md) | [api-quickstart.md](./api-quickstart.md)
