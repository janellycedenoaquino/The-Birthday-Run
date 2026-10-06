# The Birthday Run: Overview (read this first)

Last updated: 2026-10-06 · Status: planning done, waiting for the owner's review · next: phase 0 (ROADMAP)

**How to use this file:** read it every session, then only the sections the current phase lists in §8. Not whole documents. This file only points: if it disagrees with a doc, the doc wins and this file gets rebuilt.

Built from the Template: for anything touching auth, security or operations foundations, read `docs/template/OVERVIEW.md` (the Template's planning, copied into this repo).

## 1. What it is
A web app that lists the free birthday rewards from the loyalty programs you belong to, counts down how long each lasts, and plans the run to pick them up (SPEC §1). v1 is for everyone; v2 premium (granted by the owner or paid through Stripe, which stays off) adds the map, Smart Grouping, more plan room and reminders.
- **Done when:** metrics 1–5 (SPEC §2.1).
- **Time:** about 6 hrs/day once WishJar is finished; no deadline; v1 ≈ day 12, v2 ≈ day 22 (ROADMAP).

## 2. Scope
In:
- **F-1** Retailer catalogue: CSV, import, retire-not-delete, signed-out popular list
- **F-2** Profile, onboarding, the shared timing module
- **F-3** Discover and enrollment, free and premium filters
- **F-4** My Rewards countdowns and the dashboard
- **F-5** Pickups and history
- **F-6** Plan groups, limits, drag-and-drop, duplicate
- **F-7** Premium entitlement, grant script, upgrade prompt
- **F-8** Stripe in test mode, behind the off flag
- **F-9** Store and ZIP import
- **F-10** Location, map, stop list, Google Maps legs
- **F-11** Smart Grouping
- **F-12** Reminder emails and one-click turn-off
- **F-13** Wrong-reward reports and the staleness check
- **F-14** Catalogue verification (data task)

Out: SPEC §2.4 (cut old features, Google Maps APIs, admin UI, old user data, birth year, payments going live, the redesign until phase 8).

## 3. Architecture in ten lines
1. Every data call is on the server; no browser Supabase client (Template D21, DESIGN §2).
2. Signed-out visitors get popular retailers only, enforced by RLS (D3).
3. All date logic goes through one module, `src/lib/birthday/timing.ts` (D4, NFR-5).
4. Premium is one function over grants and subscriptions; users can read it, never write it (D5).
5. Plan limits and the one-pickup rule live in the database, under locks (D6, D7).
6. Stripe webhooks re-read state from Stripe; events are claimed and released on failure (D8).
7. Stores are imported on the owner's machine from All The Places + Overture into PostGIS (D9).
8. The map is MapLibre + OpenFreeMap; directions are Google Maps links; no map API keys (D11, D12).
9. One daily Vercel cron sends reminders; GitHub Actions forward reports and check staleness (D14–D16).
10. The report checker (Hermes running Claude) works only from GitHub issues and has no database access (D16).

## 4. Decisions
All detail is in DESIGN §1. Changing one needs a file in `docs/decisions/`.

| D | One line |
| --- | --- |
| D1 | Template stack plus MapLibre, dnd-kit, Stripe, DuckDB (dev), PostGIS |
| D2 | Retailer CSV with slug IDs; one-transaction import; retire not delete; import on merge |
| D3 | RLS limits signed-out Discover to popular retailers; counts from a definer function |
| D4 | Month, day and time zone on the profile; one timing module; three timing types |
| D5 | Premium = grants + subscriptions, one `is_premium` function, read-only to users |
| D6 | Plan limits enforced by DB triggers under a profile lock |
| D7 | `pickups`: one per retailer per cycle via a definer function |
| D8 | Stripe behind `PAYMENTS_ENABLED`; webhook claims, re-reads, releases on failure |
| D9 | Store import with DuckDB on the owner's machine; last good rows kept per brand |
| D10 | Start location in browser memory only; ZIPs from Census; `geolocation=(self)` |
| D11 | Map data through premium server actions; one CSP host added |
| D12 | Stop choice, order, Smart Grouping and Google legs in pure TypeScript |
| D13 | dnd-kit with keyboard sensor |
| D14 | Vercel Cron for reminders; GitHub Actions for reports and staleness |
| D15 | Reminders claim before sending, have a daily budget, and an RFC 8058 turn-off |
| D16 | Reason-only reports → summary → Action → issue → Hermes checker (no DB access) |
| D17 | Route handlers and DB functions listed by name |

## 5. Data
Fields and RLS rules: DESIGN §3.

| Entity | One line |
| --- | --- |
| `profiles` (additions) | Birth month and day, time zone, onboarded, reminders on |
| `retailers` | The catalogue from the CSV; timing, popular flag, retired date |
| `retailer_stores` | Imported store points per retailer (not user data) |
| `zip_centroids` | Census ZIP points and states (not user data) |
| `enrollments` | Which programs a user belongs to |
| `reward_groups`, `reward_group_items` | Plan groups and their ordered rewards |
| `pickups` | Rewards picked up, one per retailer per cycle |
| `premium_grants`, `subscriptions` | The two sources of premium |
| `stripe_events` | Claimed webhook event IDs (not user data) |
| `reward_reports` | Reason-only reports, batched for GitHub |
| `reminder_log` | Which reminder went out when (claim before send) |

## 6. Features and operations
| F | Operations | Screens | BUILD |
| --- | --- | --- | --- |
| F-1 | `import:retailers`, `retailer_counts`, `retailers-import.yml` | S-103, S-104 (data) | F-1 |
| F-2 | `saveOnboarding`, `updateBirthday`, `updateTimeZone`, timing module | S-101, S-108 | F-2 |
| F-3 | `enroll`, `unenroll`, Discover pages | S-103, S-104, C-102 | F-3 |
| F-4 | My Rewards and dashboard pages | S-102, S-105, C-103 | F-4 |
| F-5 | `createPickup`, `deletePickup`, `updatePickup`, `create_pickup` | S-105, S-107, C-108, C-109 | F-5 |
| F-6 | `createGroup`, `addToGroup`, `updateGroup`, `removeFromGroup`, `reorderGroupItems`, `deleteGroup`, `duplicateGroup` | S-106, C-108 | F-6 |
| F-7 | `is_premium`, `getEntitlement`, `grant-premium` | C-104, S-110 | F-7 |
| F-8 | `createCheckoutSession`, `createPortalSession`, `POST /api/stripe/webhook`, `deleteAccount` (extended) | C-104, S-110, S-111 | F-8 |
| F-9 | `import-stores`, `import-zips`, `nearby_stores`, `zip_location` | none | F-9 |
| F-10 | `lookupZip`, `findStops`, `getGroupRoute`, `src/lib/route/` | C-105, C-106 | F-10 |
| F-11 | `suggestGroups`, `applySuggestions` | S-106 | F-11 |
| F-12 | `GET /api/cron/reminders`, `setReminders`, unsubscribe page and route | S-109, S-112, E-101, E-102 | F-12 |
| F-13 | `reportReward`, `/api/reports/pending`, `/api/reports/ack`, two Actions | C-107 | F-13 |
| F-14 | Verification procedure, batches of PRs | none | F-14 |

## 7. Security, threats, operations: the non-obvious points
- Premium is checked on the server per request; free users get no premium data in the page at all (BUILD §0.2, metric 2).
- `create_pickup` is a definer function with explicit auth and MFA checks; there's no direct insert on `pickups` (D7, F-5).
- Webhook events are claimed then released on failure, so Stripe retries aren't swallowed (D8).
- Nothing user-written reaches GitHub: reports are a fixed reason; issue text is a fixed template (D16, NFR-11).
- The checker's token can't touch workflows, and its PRs may only change the CSV (D16, T-109).
- A CSV merge can't retire many retailers without a manual allowance (D2, A-22).
- Location and ZIP are never stored or logged; a browser-location start never goes into a Google link (D10, NFR-3).
- Reminder sends have a daily budget so WishJar keeps its share of Resend (D15).
- Supabase pausing: the daily cron and Action are the activity (DESIGN §5.2).
- Vercel Hobby is non-commercial, and commercial email needs a postal address: both before payments (DESIGN §4.4, §5.6).

## 8. Read for each phase
The home of these lists is ROADMAP.md; this is a copy for convenience.

| Phase | Read |
| --- | --- |
| 0. Set up | BUILD "CI, deployment and migrations" · DESIGN §5.1, §5.4 · README |
| 1. Catalogue + timing | BUILD §0, notes, F-1, F-2 · DESIGN D2–D4, §3 (profiles, retailers) · SPEC §2.2 (Retailers, Profile, Window), S-101, S-108, §3.4 |
| 2. Core journey | BUILD §0.2–§0.5, F-3, F-4, F-5 · DESIGN D3, D4, D7, §3 (enrollments, pickups) · SPEC S-102–S-105, S-107, C-102, C-103, C-108, C-109, §3.4 |
| 3. Plan | BUILD §0.2, §0.4, F-6 · DESIGN D6, D13, §3 (groups, items) · SPEC S-106, C-108, §3.4, §3.7 |
| 4. Premium + v1 launch | BUILD F-7, F-14 · DESIGN D5, §4.3, §4.4 · SPEC S-110, C-104 · LAUNCH-CHECKLIST (v1) |
| 5. Map | BUILD §0.6, §0.7, F-9, F-10, F-11 · DESIGN D9–D12, §3 (stores, ZIPs), §5.1 · SPEC C-105, C-106, S-105, S-106 · RESEARCH |
| 6. Reminders, reports, payments | BUILD §0.2, §0.6, F-8, F-12, F-13 · DESIGN D8, D14–D16, §4.2, §5.2, §5.3, §5.6 · SPEC S-109–S-112, C-107, E-101, E-102 |
| 7. v2 sign-off | SPEC §2.1 · DESIGN §5.7 · LAUNCH-CHECKLIST |
| 8. Redesign | SPEC §3.6 |

## 9. Where things live
| Need | Go to |
| --- | --- |
| Why, users, constraints, time, risks | SPEC §1 |
| A requirement and its test | SPEC §2.2 / §2.3 (FR-, NFR-); assumptions after §2.4 |
| Which screen, decision and feature cover a requirement | SPEC §2.5 |
| A screen, its states, every message and email | SPEC §3.3, §3.4 |
| Why something was decided | DESIGN §1 (D-) |
| Components and data flow | DESIGN §2 |
| Tables, fields, RLS rules | DESIGN §3 |
| Threats, privacy, legal | DESIGN §4 (T-101+) |
| Free-tier limits, pausing, monitoring, backups, rollback, payments runbook, risks | DESIGN §5 |
| Folders, access levels, error codes, rate limits, env vars | BUILD §0 |
| How to build a feature and its tests | BUILD F-n |
| CI, deployment, import order | BUILD "CI, deployment and migrations" |
| Phases, hours, dates, cut list, legacy tickets | ROADMAP.md |
| Launch lists (v1, v2, before payments) | LAUNCH-CHECKLIST.md |
| Maps and store-data research | RESEARCH.md |
| Decisions after planning | decisions/ |
