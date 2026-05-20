# Demo readiness checklist

From the team meeting on 2026-05-20. Captured here as data to drive infra-lane work and to surface gaps to the frontend lane (Julia) and PM. Boxes are unchecked until proven; the infra lane will check the ones it owns as it executes `docs/superpowers/plans/2026-05-20-infra-api-and-admin.md`. Frontend boxes are left for Julia.

## 1. Use case selection (finalize first)

- [x] Pick 1 fraud use case (chosen: points transfer abuse, MEDIUM-then-HIGH)
- [x] Pick 1 personalized offer use case (chosen: post-login time-bounded offer)
- [x] Pick 1 profile completeness use case (chosen: percent + missing fields nudge)
- [x] Confirm we are not overloading demo (max 3 flows)

## 2. Fraud use case (points transfer abuse)

- [ ] Validate high-risk login scenario (multiple locations) end to end on live API (Task 9, UC1 walk)
- [ ] MFA trigger working (existing, just confirm via curl in Task 9)
- [ ] Add highlighted "anomaly detected" message on MFA page  ← **Julia**
- [ ] Only support success flow (skip failure) for the demo
- [x] Points transfer logic chosen and tuned to MEDIUM-then-HIGH (plan Task 8)

## 3. Personalized offers

- [ ] Trigger offer after login (existing `/offers` returns the eligible offer post-login; verify in Task 9)
- [ ] Show time-based offer (complete booking in X minutes). Requires backend to set `expiresAt` on the offer row; check current shape, add if missing
- [ ] Verify offer UI placement (booking flow / MyTrips)  ← **Julia**
- [ ] Check data coming correctly for offer conditions (Task 9 smoke)

## 4. Profile completeness (nudge)

- [x] Backend endpoint `GET /user/profile-completeness` (plan Task 7)
- [x] Returns percent + missing fields shape Julia can render (plan Task 10 contract)
- [ ] Show nudge popup / message  ← **Julia**
- [ ] Update percent after user action (real, via existing user-update path or a new tiny endpoint if Julia needs it)

## 5. Data and APIs

- [x] DynamoDB data available and accessible (5 tables seeded, verified earlier this session)
- [ ] API endpoints exposed for:
  - [x] user profile (`GET /user/profile`)
  - [x] risk scoring / fraud (decisions flow + `/admin/decisions` for visibility)
  - [x] offers (`GET /offers`, `POST /offers/action`)
- [ ] Validate API responses in UI  ← **Julia**
- [x] Confirm API key usage (team uses one gateway client: `demoClient` / `demoSecret`)

## 6. AI / decision layer (demo story)

- [ ] Show that system sends event → AI/LLM processes → decides next action. Already wired for offers + nudges via Bedrock Haiku 4.5 (`BEDROCK_MODEL_ID` env var on Lambda). Confirm in Task 9 smoke by inspecting the Bedrock-generated `message` field on the offer response.
- [x] Not hardcoded logic. Heuristics produce the score, Bedrock produces the message and the nudge wording. Documented in `docs/architecture.md`.
- [ ] Mock fallback ready if Bedrock fails (currently the handler returns 500; consider a stub fallback in a later patch)

## 7. UI / Design integration (frontend lane)

- [ ] MFA page updated with anomaly messaging  ← **Julia**
- [ ] Offer UI added in booking flow  ← **Julia**
- [ ] Profile completeness popup/modal  ← **Julia**
- [ ] Designs from Julia properly integrated  ← **Julia**
- [ ] Fix any issues from AI-generated code  ← **Julia**

## 8. Infra / setup

- [x] AWS account finalized (codefest sandbox `242777378540`, kill switch in place)
- [x] DynamoDB tables configured + seeded
- [x] Deployment stable for demo (CDK + direct Lambda update path)
- [x] No dependency on local-only setup (serverless-offline is optional, not required)

## 9. Demo flow readiness (end to end)

- [ ] Login → risk detection → MFA (Task 9 UC1 walk)
- [ ] Booking → personalized offer (requires Julia's booking screen)
- [ ] Profile → completion nudge (Task 9 UC3 smoke + Julia's screen)
- [ ] End-to-end flow runs without breaks
- [ ] No backend errors during demo

## 10. Backup / fallback

- [ ] Mock data ready if API fails (the seed data already exists, can be replayed locally with serverless-offline)
- [ ] Screenshots / backup flow ready  ← **PM**
- [ ] Avoid complex flows. Keep it smooth.

## Status notes

- A parallel fix is in flight for `POST /transactions/transfer` HTTP 500 (suspected unused ExpressionAttributeValue in `incrementTransferCounters` second branch, same pattern as `upsertLoginState` we already fixed). Tracking branch: `fix/transfer-expression-values`.
- The infra-lane implementation plan is at `docs/superpowers/plans/2026-05-20-infra-api-and-admin.md`. Task 9 walks all three use cases via curl, which is the read across rows 2.1, 3.1, 4.1, 5.x, 6.1, 9.1, 9.3 above.
- The frontend lane (Julia) should treat rows tagged "← **Julia**" as her checklist and read `docs/api-quickstart.md` (updated by plan Task 10) for endpoint shapes.
