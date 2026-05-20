# Admin console and Signal Force AI insights UI

Status: approved 2026-05-20. Owner: infra lane. Target demo: 2026-05-22.

## Goal

Make the engine visible in the demo by adding two surfaces on top of the existing customer dashboard:

1. A persistent "Signal" ambient assistant on the customer side that streams decisions, offers and nudges in near-real time, plus inline contextual surfaces tied to the action that triggered them.
2. An admin console at `/admin` with KPI tiles, entity tabs, filters, a live decision feed, and a single write action (Release hold) so the suspicious-transfer scenario closes the loop on stage.

The closed loop on the demo is: customer attempts a high-velocity transfer, the backend marks it HELD, the customer screen shows the banner and the Signal card updates, the admin screen lights up within one poll tick, the admin clicks Release hold, the customer's next poll shows the transfer approved.

Two wireframes (saved in `docs/wireframes/`) are the visual baseline:

- `2026-05-20-customer-admin-side-by-side-v1.png`: end state for the demo loop.
- `2026-05-20-admin-hierarchy-v2.png`: admin layout with KPI strip, entity tabs, filter chips with counts, time window, drill-down detail with user timeline.

## Architecture

One Vite + React + TS SPA, three routes inside the same bundle:

- `/login` (existing)
- `/dashboard` (existing, customer surface, to be enhanced)
- `/admin` (new)

Both `/dashboard` and `/admin` share the same shell (`Layout.tsx`), the same `apiFetch` helper, and the same poll hook. The only thing that differs between roles is the routes rendered and the API endpoints called.

Deployment stays as one CloudFront distribution serving the one bundle. The demo can run on two laptops by opening different URLs (`/dashboard` vs `/admin`) without any backend change.

### Role gating

Role on the customer side is implicit (the session id from `POST /auth/login` is for that user). Admin role is gated by two things:

1. A new `tier === 'ADMIN'` value on `UserProfile`. We will seed one admin user (`admin001` / `AdminPass1`) into `UserProfile` directly through the existing seed JSON pattern.
2. A client-side guard on the `/admin` route that reads the active session's user profile and renders a 403 placeholder if `tier !== 'ADMIN'`. This is cosmetic protection; the real check is in the backend on every admin endpoint, which validates the bearer session id and verifies the owning user's tier.

### Backend additions

Two new endpoints. Both go through the same Lambda + handler.js the rest of the API uses.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/decisions` | Paginated feed of decisions. Query params: `window` (5m / 1h / 24h), `type` (FRAUD / OFFER / NUDGE / DECISION), `userId` (search), `limit` (default 50). Returns the most recent N items, newest first. |
| `GET` | `/admin/metrics` | KPI tile values. Query param `window` (5m / 1h / 24h). Returns `{decisionsCount, heldCount, offersShown, offersConverted, nudgesSent, nudgesDismissed, bedrockLatencyP95Ms}`. One DDB Query per metric, capped at ~100ms total. |
| `POST` | `/admin/decisions/{decisionId}/release` | Writes a new `DECISION_RELEASE` decision row referencing the original. Updates `UserState` to clear any block tied to that decision. Returns the new decision. |

All three endpoints check the session owner's profile and reject with 403 if `tier !== 'ADMIN'`.

No new tables. Reuses `DecisionStore` (already has `userId-timestamp-index` GSI), `UserProfile`, `UserState`.

The admin user is added to `seed_data/UserProfile_batch_2.json` as `admin001` / `AdminPass1` / `tier: ADMIN`. The seed loader script picks it up on next run without code changes.

## Data flow

The Signal Force engine writes a decision row for every API call that touches a customer (login, transfer, offer shown, nudge dismissed). The two UIs are read views over `DecisionStore`.

```
                Customer SPA                Admin SPA
                     |                          |
                     |  poll every 3s focused   |  poll every 3s focused
                     |  (15s blurred)           |  (15s blurred)
                     v                          v
              GET /dashboard?userId=X     GET /admin/decisions?window=1h&type=FRAUD
                     |                          |
                     +-----> Lambda <-----------+
                                |
                        DecisionStore (GSI userId-timestamp-index)
                        UserState
                        UserProfile
```

Polling cadence is intentional: 3s gives the demo a "live" feel without burning Lambda invocations. The tab-blurred fallback (15s) keeps the admin from racking up bills if a teammate leaves the screen open on a laptop overnight.

There is no SSE, WebSocket, or push channel. Two-day budget rules that out. If we have time on day 2 we can swap the customer poll to a long-poll without changing the UI.

## Customer surface (Signal ambient assistant)

### Components

- `<SignalCard />` in `apps/frontend/src/components/SignalCard.tsx`. Fixed-position bottom-right, always visible on customer routes, never on `/admin`. Shows the last 3 decisions for the current user. The newest is full text; older entries collapse to a single-line summary that expands on click.
- `<InlineBanner type="HELD|REVIEW|APPROVED|INFO" />` rendered conditionally on the page that triggered the decision. The transfer form watches its own last submission and renders a red banner when the response was HELD or the next poll surfaces a HELD on that transfer id. The dashboard renders a green pill on offers that arrived in the last 30 seconds (sourced from the same poll). Nudges already render inline; this becomes a thin variant.
- `useDecisionStream(userId)` hook in `apps/frontend/src/lib/useDecisionStream.ts`. Polls `GET /dashboard?userId=...` on the visible-focused cadence above, debounces, exposes `decisions`, `offers`, `nudges`, `fraudStatus` reactive values. Replaces the ad-hoc `useEffect` calls currently in `Dashboard.tsx`.

### Visual rules

- Lucide icons only.
- Tailwind only, no inline styles in the committed component (the wireframes use inline styles for visual mockup speed; production components use Tailwind classes).
- Color tokens used:
  - HELD / FRAUD: `bg-red-50 border-red-200 text-red-900`
  - REVIEW (medium severity): `bg-amber-50 border-amber-200 text-amber-900`
  - APPROVED / OFFER: `bg-emerald-50 border-emerald-200 text-emerald-900`
  - Default neutral: `bg-white border-gray-200 text-gray-900`
- Signal card on dark background `bg-gray-900 text-gray-100` so it reads as "system" not "content".

### Accessibility

- All clickable entries have keyboard focus styles.
- The Signal card collapses with `aria-expanded` toggled on the older entries.
- Inline banners use `role="status"` for non-blocking ones and `role="alert"` for HELD.
- The poll hook respects `document.visibilityState` so screen readers and motion-reduced users do not get phantom updates while the tab is hidden.

## Admin surface

### Layout regions, top to bottom

1. **Header strip.** Project name, region, "live" indicator, search input (user id, decision id, recipient), the active admin id.
2. **KPI strip (5 tiles).** Decisions / 1h (with trend), HELD count (red tile when > 0), Offers shown (with converted sub), Nudges sent (with dismissed sub), Bedrock latency p95. Tiles read from a derived metrics endpoint that aggregates on the Lambda side from `DecisionStore` (one DDB Query per tile, ~100ms total).
3. **Entity tabs.** Decisions (v1), Users (v1, simpler list view), Rules (stretch), Activity feed (stretch). v1 ships Decisions and Users only.
4. **Filter chips with live counts.** All / Fraud / Offers / Nudges. Time window 5m / 1h / 24h. Severity (HIGH / MEDIUM / LOW). Chips are URL params so a deep link to "fraud in last hour" works.
5. **Two-pane content.** Feed list on the left, drill-down detail on the right. Selection is sticky in URL (`?selected=DEC#a1f2c0`).

### Drill-down detail

For a HELD or fraud decision the detail panel shows:

- Decision metadata (id, type, severity, action, reason).
- The triggering event payload (user, recipient, amount, channel, score, threshold, location).
- A short user timeline (last 1h) reconstructed from `UserActivity`. Cap at 6 lines so it fits without scrolling.
- Two action buttons: Release hold (primary, green) and Mark fraud (secondary, neutral). Mark fraud writes a `DECISION_CONFIRM_FRAUD` row but does not change state otherwise.

### KPI tile computation

`GET /admin/metrics` hits `DecisionStore` and aggregates in-process. Since the demo data is ~150 decision rows it uses a bounded Scan with a `timestamp >= now - window` filter expression and groups by `type` / `severity` in the handler. If the table grows we will add a separate `MetricsRollup` table later; not in scope here. Bedrock p95 latency is read from a fixed CloudWatch metric query (`SignalForce/Bedrock` namespace, `InvokeLatencyMs`), with a fallback of "n/a" if the metric is missing during the demo window.

## Stitch design fidelity

The team has a Stitch project (Google AI Studio link the user has). We use the Stitch screens as visual reference for spacing, color, and component shapes only. We do not import the generated HTML.

If the user pastes the project id we will pull screens via the `mcp__stitch__get_project` / `list_screens` flow and pick which structural elements map to which components in the spec above. Without the project id we proceed with the wireframes in `docs/wireframes/` as the visual source of truth and adjust later when the Stitch components arrive.

## Implementation order

This is a 2-day clock. Order is non-negotiable.

1. Backend: `GET /admin/decisions` and `POST /admin/decisions/{id}/release`, with admin-role check. Add seed admin user.
2. Frontend: `useDecisionStream` hook + `SignalCard` component + role-gated `/admin` route. Render the existing dashboard JSON-dump cleanly using the hook.
3. Admin v1 layout: header + KPI strip + Decisions tab + feed + detail pane + Release hold action. Hook up to the new endpoints.
4. Admin v1 polish pass: KPI tile metrics endpoint, time window URL params, severity chip, Users tab (read-only list).
5. Day 2 polish: empty states, error toasts, loading skeletons, mobile breakpoints (admin assumed desktop only for demo).

Stretch: Rules tab, Activity feed tab, customer Mark as fraud confirmation, Bedrock-generated explanation copy on the detail panel.

## Testing

- Backend: unit tests against `findUserByUsername` (regression guard for the GSI fix), and integration tests against the two new admin endpoints using a `dynamodb-local` table fixture. Tag with `@unit` per repo conventions.
- Frontend: render tests for `<SignalCard />` and the admin layout against fixture decision JSON. No E2E for v1 since the loop is two laptops on demo day. Add Playwright only if we hit Day 2 polish with time to spare.
- Manual demo dry run: documented as a 6-step checklist in `docs/demo-runbook.md`. Created later when the screens are real.

## Out of scope

- SSE / WebSocket. Polling only.
- Pixel-perfect Stitch port. Structure only.
- Auth hardening beyond the existing Basic Auth gateway + session + admin tier check. The post-event upgrade path in `docs/architecture.md` covers Cognito + WAF.
- Mobile / tablet admin. Desktop demo only.
- Real-time charts on the KPI strip. Numbers only.
- Internationalization. English only for the demo.

## Open questions for the team

1. Should the Release hold action require typing a reason, or just a single click? v1 is single click. If product wants a reason, that is a 30-minute add later.
2. Does the Bedrock model produce a per-decision explanation we can render in the detail panel? Already in `DecisionStore`; need to confirm the field name and shape.
3. Stitch project id? Until it arrives we use the wireframes only.

## References

- `docs/wireframes/2026-05-20-customer-admin-side-by-side-v1.png`
- `docs/wireframes/2026-05-20-admin-hierarchy-v2.png`
- `docs/architecture.md` (upgrade path)
- `docs/api-quickstart.md` (existing endpoints)
- `apps/backend/src/handler.js` (route table)
- `infra/cdk/lib/runtime-stack.ts` (Lambda + IAM)
