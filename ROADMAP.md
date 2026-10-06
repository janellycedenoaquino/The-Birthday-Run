# The Birthday Run: Roadmap

Last updated: 2026-10-06 · Capacity: about 6 hrs/day, every day (SPEC §1 Time), **starting once WishJar is finished** (owner's decision 2026-10-06; WishJar is a few days from done) · Deadline: none. **Flag point:** a phase more than 3 days past its "finish by", or over its upper hours.

## Summary
**Why the start waits:** WishJar and this app can't run their local databases at the same time on this machine yet (decisions/0004), so the owner finishes WishJar first and builds this app after, with the full 6 hrs/day.

Eight phases. v1 (everyone's features, premium by grant) goes live on thebirthdayrun.com after phase 4, about **12 days after the start**. The full v2 premium build (map, Smart Grouping, reminders, reports, Stripe in test mode) is done after phase 7, about **22 days after the start**. Calendar dates are set on the start day. The redesign (phase 8) waits for the owner's visuals. Estimates are ranges of real working hours (Claude building, the owner reviewing, merging and doing dashboard steps); dates use the upper end plus 15% buffer at 6 hrs/day. The catalogue check (F-14) runs alongside phases 1–4 as overnight batches.

| Phase | Features | FRs | Hours | Finish by (day after start) | Read | Issues |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Set up | Template setup, CI section | – | 3–5 | day 1 | BUILD "CI, deployment and migrations" · DESIGN §5.1, §5.4 · README | |
| 1. Catalogue + timing | F-1, F-2 | FR-1, FR-6–FR-11, FR-44 | 9–14 | day 4 | BUILD §0, notes, F-1, F-2 · DESIGN D2–D4, §3 (profiles, retailers) · SPEC §2.2 (Retailers, Profile, Window), S-101, S-108, §3.4 | |
| 2. Core journey | F-3, F-4, F-5 | FR-2–FR-5, FR-8, FR-12–FR-21, FR-45 | 12–18 | day 8 | BUILD §0.2–§0.5, F-3, F-4, F-5 · DESIGN D3, D4, D7, §3 (enrollments, pickups) · SPEC S-102–S-105, S-107, C-102, C-103, C-108, C-109, §3.4 | |
| 3. Plan | F-6 | FR-22–FR-28, FR-40 | 6–10 | day 9 | BUILD §0.2, §0.4, F-6 · DESIGN D6, D13, §3 (groups, items) · SPEC S-106, C-108, §3.4, §3.7 | |
| 4. Premium + v1 launch | F-7, F-14 done, launch | FR-35, FR-36, FR-39, FR-40, FR-46 | 7–11 | day 12 | BUILD F-7, F-14 · DESIGN D5, §4.3, §4.4 · SPEC S-110, C-104 · LAUNCH-CHECKLIST (v1) | |
| 5. Map | F-9, F-10, F-11 | FR-29–FR-34, FR-43 | 17–27 | day 17 | BUILD §0.6, §0.7, F-9, F-10, F-11 · DESIGN D9–D12, §3 (stores, ZIPs), §5.1 · SPEC C-105, C-106, S-105, S-106 · RESEARCH | |
| 6. Reminders, reports, payments | F-12, F-13, F-8 | FR-37, FR-38, FR-41, FR-42, FR-47, FR-48 | 14–20 | day 21 | BUILD §0.2, §0.6, F-8, F-12, F-13 · DESIGN D8, D14–D16, §4.2, §5.2, §5.3, §5.6 · SPEC S-109–S-112, C-107, E-101, E-102 | |
| 7. v2 sign-off | metrics, launch checklist (v2) | all | 3–5 | day 22 | SPEC §2.1 · DESIGN §5.7 · LAUNCH-CHECKLIST | |
| 8. Redesign | page by page with the owner | – | set later | after the owner's visuals | SPEC §3.6 | |

## Phases
### Phase 0: Set up
- **Parts:** run the Template's new-app setup on this repo (env wizard, local Supabase, Sentry, Resend sending domain for this app, Turnstile) (2–3); wipe and link the `thebirthdayrun` Supabase project, reconnect the Vercel project and thebirthdayrun.com to this repo (1–2).
- **Read:** as in the table.
- **Done when:** the Template's own checks and e2e pass locally and in CI, and a preview deploy from this repo loads.
- **Most likely to run over:** the Vercel reconnect (account steps only the owner can do).

### Phase 1: Catalogue + timing
- **Parts:** F-1 retailer migration, CSV, import, legacy conversion of the 190 rows, logos (4–6); F-2 profile columns, timing module with its tests, onboarding gate, settings (5–8).
- **Done when:** a fresh local DB imports all retailers; signed-out Discover data shows popular retailers only (RLS test); every FR-10/FR-11 unit test passes.
- **Most likely to run over:** the timing module (three timing types × window edges × time zones).
- **Alongside:** F-14 batches start (overnight, about 20 retailers per PR; the owner spot-checks each PR).

### Phase 2: Core journey
- **Parts:** F-3 Discover and enrollment (4–6); F-4 My Rewards and dashboard (4–6); F-5 pickups and history (4–6).
- **Done when:** the e2e journey onboarding → enroll → My Rewards → pickup → History passes.
- **Most likely to run over:** F-5's `create_pickup` (definer function, lock, MFA check, cycle rule).

### Phase 3: Plan
- **Parts:** F-6 groups, items, limit triggers, keyboard drag-and-drop, duplicate (6–10).
- **Done when:** F-6's tests pass, including the limit races and keyboard reorder.
- **Most likely to run over:** this whole phase (dnd-kit + triggers + several groups per reward).

### Phase 4: Premium + v1 launch
- **Parts:** F-7 entitlement, grant script, upgrade prompt, over-limit rules (4–6); finish F-14 (owner's last spot checks); v1 launch checklist and production deploy (3–5).
- **Done when:** metric 4 passes on production for the owner and both sisters; metric 2's free-account tests pass; LAUNCH-CHECKLIST v1 is ticked.
- **Most likely to run over:** F-14 if many retailers can't be verified.

### Phase 5: Map
- **Parts:** F-9 store and ZIP import with the coverage report (6–10); F-10 location, map, stop list, Google legs (8–12); F-11 Smart Grouping (3–5).
- **Done when:** the coverage report is in RESEARCH.md (metric 6); a premium user gets a stop list and links with tiles blocked (NFR-7); a free user gets C-104 everywhere.
- **Most likely to run over:** F-9 (two sources, brand matching, Overture junk).

### Phase 6: Reminders, reports, payments
- **Parts:** F-12 reminders and one-click turn-off (4–6); F-13 reports, the two Actions, the checker contract (4–6); F-8 Stripe test mode and the off flag (6–8).
- **Done when:** metric 3 passes in CI with test keys; a doubled reminder run sends once; a report becomes one issue with no personal data.
- **Most likely to run over:** F-8 (test clocks, webhook ordering).

### Phase 7: v2 sign-off
- **Parts:** collect metrics 1–5 (DESIGN §5.7), the v2 part of LAUNCH-CHECKLIST (3–5).
- **Done when:** metrics 1–5 pass. Payments stay off until the owner's decision (DESIGN §5.6).

### Phase 8: Redesign
Page by page with the owner, from their visuals; hours estimated when they're ready.

## Totals
- **Phases 0–7:** 71–110 hrs → about 3 weeks at 6 hrs/day, with buffer.
- **Owner's own hands-on time** (dashboards, reviews, F-14 spot checks) is inside these ranges; Claude's share runs faster than the ranges suggest, so the weekly check corrects the dates.

## Replaces the legacy tickets
The old repo (`The-Birthday-Run-Legacy`) is archived and read-only, so its tickets can't be closed there. They're covered here:

| Legacy | Now |
| --- | --- |
| #150 leaked credentials | Rotated 2026-10-06; this repo starts with clean history and the Template's gitleaks + env checks |
| #152 / PR #168 plan-item IDOR | RLS on every table (F-6) and RLS tests (Template rule 2) |
| #153, #154 Stripe bugs; #159 redirects, rate limits, racy limits; #165 payments checklist | F-8, BUILD §0.4, D6, DESIGN §5.6 |
| #155 plaintext birthdays | Month and day only (D4) |
| #156 Clerk webhook | Gone: no Clerk (D1) |
| #158 validation and error leaks | Template rules 9 and 12, BR codes (BUILD §0.3) |
| #160 Google Maps key, debug UI, location prompt | No Google APIs (D11), no debug tools (SPEC §2.4), location on a button press (NFR-3) |
| #161 tests | Each feature's test table; Template CI |
| #164 backend to Vercel; #169 WishJar's guards; #170 duplicated code | Moot: the Template is the base |
| #34 edit birthday · #36 error handling · #38 empty states · #42 production testing · #43 README URL | FR-9 · BR codes · SPEC §3 states · LAUNCH-CHECKLIST · README |
| #45, #134 monetization | C-104 and F-8 |
| #126, #127 images and logo | Phase 8 |
| #46, #63, #68, #69, #125 | Dropped (old stack or unclear); re-open as new issues if still wanted |

## Cut list (drop first if behind)
1. F-11 Smart Grouping (the map and manual groups still work).
2. F-13's automatic checker hand-off (reports still stored; the owner reads them by SQL).
3. FR-28 duplicate group.
v1 (phases 0–4) is never cut.

## Weekly check
Every Sunday, compare hours spent against this table. If a phase is past the flag point, apply the cut list before moving a date. The owner decides.

## Decide on day 22
After phase 7: are the sisters using it on their next birthdays, how many strangers signed up (Vercel Analytics, Supabase auth count), and has any free user hit an upgrade prompt? Enough interest → plan payments (DESIGN §5.6: Vercel Pro, live keys). Little interest → keep it for the family and stop at phase 8.
