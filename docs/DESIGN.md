# The Birthday Run: Design

Last updated: 2026-10-06 · Status: §1 and §3 approved 2026-10-06 · §2, §4, §5 merged 2026-10-06

## 1. Decisions

Template decisions are cited as "Template Dn" and not restated; only what the app adds or changes is here. Implementation: BUILD. Assumptions A-11 onward: end of §3. Sources: end of this section.

### D1. Stack: the Template plus five additions
**Decision:** The Template stack unchanged (Template D1, D21: Supabase Auth, typed server client, no Prisma, no Clerk, no browser Supabase client), in a new repo made from the Template. Added (npm, 2026-10-06): `maplibre-gl` 6.12.0 (D11), `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 (D13), `stripe` 23.0.0 (D8), `@duckdb/node-api` 1.5.6-r.1 (devDependency, D9), and Supabase's PostGIS extension (schema `extensions`).
**Why:** owner decision (SPEC §1); each addition replaces a paid or broken part of the old app (NFR-4).
**Alternatives:** `react-map-gl`: a wrapper for a few dozen lines. Bounding boxes without PostGIS: hand-written distance SQL.
**Consequences:** rule 23 note per package.

### D2. Retailer catalogue: CSV, slug IDs, retire not delete
**Decision:** `data/retailers.csv` is the only source (FR-1). Its stable `id` is a slug (`starbucks`) and the primary key, so renames keep identity (FR-44) and IDs read well in issues and PRs. `scripts/import-retailers.ts` validates every row with one shared Zod schema and upserts all rows in **one transaction**; rows missing from the CSV get `retired_at` and their group items are deleted in the same transaction (FR-44). Logos are files in `public/retailers/`, never hotlinked (A-16). **Runs:** a GitHub Action on push to `main` touching the CSV (and manual dispatch), with the backup's `SUPABASE_DB_URL` secret (Template D14), so merging a CSV PR publishes it (FR-47); locally and in CI against the local DB.
**Why:** FR-1, FR-44, FR-46; self-hosted logos keep `img-src 'self'` and keep brand sites from seeing visitors.
**Alternatives:** a migration per edit: Builder-run and forward-only (Template D19), too heavy for data. Builder-run only: merged fixes wait. Legacy UUIDs: unreadable.
**Guards:** a run that would retire more than a handful of retailers (A-22) stops unless started by manual dispatch with an explicit allowance, since retiring deletes group items; re-adding a retired ID clears `retired_at`. A CI comment on CSV PRs lists any changed `website_url`/`store_finder_url` hosts for the owner's review.
**Consequences:** a CSV needing a new column waits for its migration (Template D19 order); the Action fails loudly otherwise.

### D3. Signed-out Discover is enforced by RLS
**Decision:** Signed out, the page queries through the Template's server client with no session, so Postgres runs it as `anon`, and RLS gives `anon` only popular, non-retired retailers. The prompt's count comes from `public.retailer_counts()` (definer, returns numbers only). `authenticated` reads all retailers (retired too, for History).
**Why:** FR-2's "not reachable by URL or API" holds even if code forgets a filter; an RLS test proves it.
**Alternatives:** filtering in the page: one missing `where` leaks. A copy table: duplicated data.

### D4. Birthday, time zone and one timing module
**Decision:** The profile holds birth month, day and an IANA time zone (detected at onboarding, editable; FR-10). All window, status, cycle and "today" logic is one pure module, `src/lib/birthday/timing.ts` (NFR-5), used by pages, actions, the reminder job and tests. It works on **civil dates**: "today" comes from `Intl.DateTimeFormat` in the profile's zone, and arithmetic uses UTC-midnight day numbers, so daylight saving can't shift a day. Retailer timing is three columns (§3) for FR-11's three types. Group pickups are a local date and local time, with no conversion. SQL never re-implements timing; where the database checks a cycle, the server passes the module's bounds (D7).
**Why:** FR-10/FR-11 edge cases and the old client/server split, with no date library.
**Alternatives:** a full date with a dummy year: invites the year back (NFR-3). `date-fns-tz` or Temporal (Node 24 support unverified): a dependency for conversions we avoid.
**Consequences:** changing time zone moves "today", not pickup times.

### D5. Premium: two source tables, one definer function
**Decision:** `premium_grants` and `subscriptions` (§3) are the sources. `private.is_premium(uid)` (`security definer`, empty `search_path`, `stable`) is true for an unrevoked grant **or** a subscription with Stripe status `active` whose period hasn't ended, or `past_due` (FR-37). `public.is_premium()` wraps it with `auth.uid()`; the server calls it once per request via `getEntitlement()` (React `cache`); triggers and premium DB functions call the private one. Users **select** their own rows in both tables and have **no write grants**; only the grant script (database owner) writes grants and only the webhook (`service_role`) writes subscriptions (NFR-2). `npm run grant-premium` (FR-36) finds the email in `auth.users` and upserts or revokes, idempotently.
**Why:** FR-35's one answer for server, UI and database; read-not-write is a grant the RLS test checks.
**Alternatives:** a `security_invoker` view: fine for reads, awkward in triggers. An `is_premium` column: a copy that drifts.
**Consequences:** `active` and `past_due` (Stripe still retrying the card) count as premium; `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, `trialing` and anything else count as free (FR-37; trials out of scope). The period-end check doesn't apply while `past_due`.

### D6. Plan limits are enforced in the database
**Decision:** `before insert` triggers on `reward_groups` and `reward_group_items` lock the owner's profile row, count, and raise a named error at FR-24/FR-25's limit for `private.is_premium(owner)`. Updates and deletes never check (FR-40). Composite foreign keys (§3) keep items in the owner's own groups and on enrolled retailers, so unenrolling cascades (FR-8).
**Why:** a server rule (NFR-2) that doesn't race on double clicks; the lock covers one user only.
**Alternatives:** checks in actions: racy.
**Consequences:** the values appear in trigger SQL (FR-24/FR-25 stay their home); actions map the error to BR- codes (BUILD §0.3).

### D7. Pickups: one per retailer per cycle, under a lock
**Decision:** The table is `pickups` (SPEC's word; old `source`/`proofUrl` dropped). Creating one goes through `public.create_pickup(...)` (`security invoker`, RLS applies): lock the profile row, refuse if that retailer has a pickup inside the cycle bounds the timing module passed, insert, and delete the retailer's group items (FR-26), in one transaction. A pickup's cycle is never stored; History groups by date (FR-19), so FR-9 regroups correctly.
**Why:** FR-17 without a race and without stored cycle data that drifts.
**Alternatives:** stored `cycle_start` + unique index: wrong after FR-9.
**Consequences:** forged bounds only affect the caller's own data (accepted). Undo (FR-18) is a delete.

### D8. Stripe: test mode, off by a flag, synced from source
**Decision:** `PAYMENTS_ENABLED` (BUILD §0.6) off: checkout and portal actions refuse (BR-15) and no control renders (FR-38). Checkout (mode `subscription`) uses a Customer the server creates and records first; the success page only says "processing" (NFR-8); cancelling is the Portal's "at period end" setting. **Webhook:** verify the signature on the raw body (Stripe's 5-minute default tolerance), claim the event ID in `stripe_events` (a known one returns 200 at once), then **ignore the payload's state**: fetch the customer's subscriptions from Stripe, upsert the current snapshot. The event ID is claimed in `stripe_events` before the sync and **deleted if the sync fails** (5xx), so Stripe's retry runs again instead of being dropped as a duplicate; no Stripe call is made inside a database transaction. Stripe doesn't guarantee order and says to track event IDs, not `created` (docs, 2026-10-06), so reading the source makes any order or replay converge.
**Why:** NFR-8, FR-37, metric 3.
**Alternatives:** applying each event's `data.object`: a late "active" after "canceled" restores premium.
**Consequences:** one Stripe call per event. Webhooks are processed with the flag off too, so tests run. Deleting an account (FR-37) cancels the subscription and then deletes the Stripe Customer; Stripe keeps its own payment records.

### D9. Store locations: ATP + Overture through DuckDB, on the Builder's machine
**Decision:** `scripts/import-stores.ts` uses DuckDB to read All The Places' per-spider GeoJSON for the matched brands (`runs/<id>/output/<spider>.geojson`; the run's `parquet_url` returned 404 on 2026-10-06) and Overture Places from its public S3 release (found from Overture's catalogue, not hard-coded), keeping US points of brands in `data/store-sources.csv` (slug → ATP spiders and Wikidata brand ID; Overture matched on `brand.wikidata` above a `confidence` threshold set in BUILD). Per (retailer, source) it replaces rows in one transaction **only when the new count is above 0** (FR-43) and prints matched vs missing (metric 6). The Builder runs it locally against local or production via `SUPABASE_DB_URL`, monthly or on demand.
**Why:** DuckDB scans multi-GB parquet cheaply by reading only needed row groups; ATP alone isn't enough (RESEARCH).
**Alternatives:** a scheduled Action: uses shared minutes (Template DESIGN §5.3) and runs a heavy job behind the DB secret.
**Consequences:** freshness depends on the Builder (DESIGN §5); storage: A-14.

### D10. Start location stays in browser memory; ZIPs from Census data
**Decision:** The start (FR-30) lives in a React context in the signed-in layout: memory only, gone on reload. Rounded coordinates (A-11) or the ZIP go only in the body of the premium actions that need them (D11), never logged, stored or put in URLs (bodies are already scrubbed, Template D15). **One exception, the Google Maps links (D12):** a ZIP start goes in the link as the origin; a browser-location start leaves the origin out, so Google uses the device's own location (A-23: behaviour to re-check at build). The privacy page names Google for these links. `zip_centroids` comes from the Census ZCTA Gazetteer (internal points) and the ZCTA-to-county file for the state (A-13); FR-5's state is the ZIP's, or the nearest centroid's for browser location. The Template's `Permissions-Policy: geolocation=()` becomes `geolocation=(self)` (a stated loosening, rule 16; `docs/decisions/` entry).
**Why:** NFR-3, and the Template's "empty web storage" e2e check (Template NFR-14) still passes.
**Alternatives:** `sessionStorage`: needs an exception to that check. The ZIP table in the browser: a large download (estimate) for a rare action. A geocoding API: cost (NFR-4).
**Consequences:** the start is re-entered after a reload.

### D11. Map data and CSP
**Decision:** Premium actions `findStops` (FR-31/32) and `getGroupRoute` (FR-33) return plain stop lists from `public.nearby_stores(...)` (definer; refuses non-premium; PostGIS `ST_DWithin` within FR-31's radius; a bounded number per brand). The stop list renders on the server (NFR-7); the map is a client component loaded with `next/dynamic` for premium users only. Style URL and hosts are constants in `src/config/map.ts`. **CSP additions** (Template D5): `connect-src https://tiles.openfreemap.org` (MapLibre `fetch`es style, tiles, glyphs and sprites, all on that host in the live style, 2026-10-06) and `img-src https://tiles.openfreemap.org` (MapLibre 6.12 falls back to `<img>` for raster tiles and sprites). **No `blob:` worker:** MapLibre 6 uses a same-origin module worker when one is set, so `setWorkerUrl()` points at its worker (and the shared chunk it imports) copied to `/vendor/maplibre/<version>/` at build, within the Template's `worker-src 'self'`. Glyphs are fetched, so `font-src` is unchanged.
**Why:** rule 16: narrow, stated additions; one host; no blob scripts.
**Alternatives:** `worker-src blob:` (MapLibre's default): any blob script can run as a worker. All stores sent to the browser: tens of thousands of rows per big chain.
**Consequences:** switching tile host (SPEC §1 risk) is a reviewed change to `map.ts` and the CSP. The e2e CSP console check (Template D18) covers the map.

### D12. Stops, order, Smart Grouping and Google links: pure TypeScript
**Decision:** `src/lib/route/`, run inside premium actions; distances are haversine (straight-line, FR-32). **Stop choice (FR-31):** each brand's nearest candidate, then a few rounds of swapping a brand to another nearby candidate (A-15) when it shortens the distance to the other stops. **Order (FR-32):** nearest-neighbour from the start, then 2-opt until no swap improves. Groups keep their own order (FR-33). **Smart Grouping (FR-29):** complete-linkage agglomerative clustering, never past FR-25's size, until FR-29's group count; singletons join the nearest group with room or are listed as left out. **Links (FR-34):** Google Maps URLs (`/maps/dir/?api=1`, origin, destination, `waypoints`), split by the device's stop limit.
**Why:** tens of stops: heuristics finish in milliseconds and unit-test with fixed coordinates.
**Alternatives:** k-means: needs k and ignores size caps. A routing API: cost or a new service.

### D13. Drag-and-drop: @dnd-kit with its keyboard sensor
**Decision:** `@dnd-kit/core` + `sortable` with `KeyboardSensor`, `sortableKeyboardCoordinates` and its screen-reader announcements; a drop sends the ordered IDs to `reorderGroupItems` (FR-27).
**Why:** keyboard reorder built in (NFR-6), MIT, React 19 peers, used by the old app.
**Alternatives:** `@dnd-kit/react` 0.5.0: pre-1.0. Native drag: no keyboard, weak touch.
**Consequences:** last published 2024-12-05: stable but quiet. It sets inline `style` attributes, which the Template's split style policy allows (Template D5).

### D14. Scheduled jobs on free tiers
**Decision:** **Vercel Cron** (Hobby: at most daily, fired anywhere in the hour, no retries, may fire twice; docs 2026-10-06) calls one daily route handler checked against `Authorization: Bearer CRON_SECRET`: `/api/cron/reminders` (D15). It reconciles everything outstanding, so missed or doubled runs are harmless. **GitHub Actions** runs the monthly staleness check (FR-47) from the CSV alone, and the daily report forwarding (D16); both open issues with the workflow's built-in `GITHUB_TOKEN`, and neither has database access. The reminder cron and the report Action query the database every day, which DESIGN §5 uses for NFR-10; the monthly staleness job has no database access.
**Why:** reminders need the app's code, env and email pipeline; staleness needs only the repo.
**Alternatives:** `pg_cron` + `pg_net`: an app secret in the database, email from SQL. Actions for everything: shared minutes and app secrets in GitHub. Hourly runs: Hobby refuses them.
**Consequences:** A-17.

### D15. Reminder emails
**Decision:** The daily job takes premium users with reminders on (FR-41/42), asks the timing module what's due, **claims** it with a unique `reminder_log` row, sends with the Template's `sendEmail` (Template D7), and deletes the claim if sending fails (the welcome-email pattern). Turn-off: a token (HMAC of user ID and purpose, `REMINDER_UNSUBSCRIBE_SECRET`) in a link and in `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058). `POST /api/reminders/unsubscribe` turns reminders off; `GET` shows a confirm button, so link scanners unsubscribe no one.
**Why:** FR-41/42, NFR-9; claim-then-send means a doubled run sends once.
**Alternatives:** Resend audiences: a second store of personal data.
**Send budget:** each run stops at a fixed daily budget well under Resend's daily limit (value: BUILD §0.4, A-24), leaving the rest for the next run, so WishJar keeps its share of the shared quota.
**Consequences:** the job and unsubscribe route use the service-role client (BUILD §0.1 allow-list).

### D16. Reward reports and the automatic check
**Decision:** `reportReward` stores a `reward_reports` row (one per user, retailer and cycle; rate limit BUILD §0.4). Reports carry a **reason only, no free text** (owner's decision 2026-10-06), so no personal text reaches GitHub and there's no planted-instruction channel beyond a fixed enum. A daily GitHub Action (`forward-reports.yml`) calls `GET /api/reports/pending` with `Authorization: Bearer REPORTS_EXPORT_SECRET`; the app returns a **summary only** (retailer ID, reason, count; no user ID, email or row ID) plus a batch ID, and records the claim. The Action opens or comments one issue per retailer with the built-in `GITHUB_TOKEN`, then calls `POST /api/reports/ack` with the batch ID, which sets `forwarded_at`. A batch never acked is offered again the next day. No GitHub credential is stored on Vercel. The **check** is the owner's Hermes bot running Claude overnight (A-18): it reads only `reward-report` issues, visits the brand's site, then comments or opens a CSV-fix PR. It holds **no database credential**, so it can't write the database, and only the owner merges (NFR-11).
**Why:** the narrowest path: report text reaches the checker only as quoted data, and the checker has nothing to misuse.
**Alternatives:** a read-only DB role or API route for the bot: a credential to user data on a laptop. An Action running Claude: paid API. A fine-grained GitHub token on Vercel pushing issues: a long-lived GitHub credential in the app (rejected 2026-10-06).
**The checker's own access:** a fine-grained GitHub token kept on the owner's machine, this repo only, Issues + Pull requests + Contents write, **no Workflows or admin permission**; its PRs may change only `data/retailers.csv` (a CI check fails any bot-branch PR touching another file), and Claude runs with tools limited to web fetch and `gh` issue/PR commands. **Heartbeat:** `/api/reports/pending` also returns the date of the last reminder run (no personal data), and `forward-reports.yml` fails, emailing the owner, if it's more than 2 days old, so a silently skipped cron gets noticed.
**Consequences:** GitHub holds only retailer IDs, reasons and counts, so account deletion leaves nothing personal there. One more shared secret (BUILD §0.6).

### D17. API style additions (Template D17)
**Decision:** Mutations are server actions returning `ActionResult<T>`. Route handlers only for outside callers: `POST /api/stripe/webhook`, `GET /api/cron/reminders`, `GET /api/reports/pending`, `POST /api/reports/ack` (bearer secret, called by the Action), `GET /reminders/unsubscribe` (confirm page) and `POST /api/reminders/unsubscribe` (also the `List-Unsubscribe` URL; Next.js doesn't allow a route beside a page in one segment). DB functions only for atomicity or privilege: `is_premium`, `retailer_counts`, `create_pickup`, `reorder_group_items`, `apply_group_suggestions`, `nearby_stores`, `zip_location` (by ZIP, and by point), `reminder_candidates`, `claim_report_batch`, `ack_report_batch`, the limit triggers. Action names: BUILD features.
**Consequences:** Template D18's signed-out refusal test covers every new action; each route handler tests its own check (signature, bearer, token).

### Sources
Opened 2026-10-06: npm registry for each D1 package (`https://registry.npmjs.org/<name>`) · MapLibre 6.12.0 package source (`dist/maplibre-gl-dev.mjs`: `defaultWorkerUrl`, `workerFactory`, `getImageUsingHtmlImage`) and CSP note: https://maplibre.org/maplibre-gl-js/docs/ · OpenFreeMap: https://openfreemap.org/quick_start/, live style https://tiles.openfreemap.org/styles/liberty · Stripe: https://docs.stripe.com/webhooks, https://docs.stripe.com/billing/subscriptions/webhooks · Vercel Cron: https://vercel.com/docs/cron-jobs/usage-and-pricing, https://vercel.com/docs/cron-jobs/manage-cron-jobs · GitHub schedule event: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows · Supabase: https://supabase.com/docs/guides/platform/free-project-pausing, https://supabase.com/pricing (500 MB), https://supabase.com/docs/guides/database/extensions/postgis · ATP: https://data.alltheplaces.xyz/runs/latest.json · Overture: https://docs.overturemaps.org/guides/places/ · Census: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
**Unverified:** Gazetteer and relationship-file column names; Temporal in Node 24; whether cron queries count as Supabase activity; MapLibre's `<img>` path in practice (e2e CSP check); where Stripe's period end sits in the API version pinned at build (item-level since 2025-03-31.basil).

## 2. Architecture

Only what the app adds to Template DESIGN §2 (browser, proxy, guards, Auth, Resend, Turnstile, Sentry, CI and backup are unchanged there). Every Supabase call still runs on the server (Template D21).

```mermaid
flowchart LR
  B[Browser<br/>start location in memory, D10]
  subgraph V[Vercel]
    APP[Pages + server actions<br/>timing, entitlement, route lib]
    RH[Route handlers<br/>webhook, cron, reports, unsubscribe]
    VC[Vercel Cron, daily]
  end
  DB[(Supabase Postgres + PostGIS<br/>RLS, triggers, definer functions)]
  OFM[OpenFreeMap tiles]
  ST[Stripe<br/>Checkout, Portal, events]
  RS[Resend]
  subgraph GH[GitHub]
    GA[Actions: retailers-import,<br/>stale-retailers, forward-reports, backup]
    GI[Issues + PRs]
  end
  HB[Hermes checker<br/>owner's laptop]
  BW[Brand websites]
  BM[Builder machine<br/>import-stores, import-zips, grant-premium]
  SRC[ATP, Overture, Census files]
  GM[Google Maps, link only]

  B --> APP
  B -- tiles, style --> OFM
  B -- user click --> GM
  B -- Checkout, Portal --> ST
  APP --> DB
  APP -- create customer, sessions --> ST
  ST -- signed events --> RH
  RH -- fetch snapshot --> ST
  VC -- bearer --> RH
  RH --> DB
  RH -- reminders --> RS
  GA -- bearer: pending, ack --> RH
  GA -- GITHUB_TOKEN --> GI
  GA -- SUPABASE_DB_URL --> DB
  HB -- reads issues, opens PRs --> GI
  HB -- reads only --> BW
  BM -- SUPABASE_DB_URL --> DB
  BM -- reads --> SRC
```

| Component | Responsibility | Details |
| --- | --- | --- |
| Pages + actions | Discover, onboarding, My Rewards, Plan, History, dashboard, settings additions; BUILD §0.2's order with the entitlement step | F-1–F-7, F-10, F-11, F-13; D3–D7, D11–D13 |
| Timing module | Every "today", window, status and cycle answer | D4, NFR-5 |
| Entitlement | One premium answer per request | D5, F-7 |
| Route lib | Stop choice, order, Smart Grouping, Google links (pure TS) | D12, F-10, F-11 |
| Postgres + PostGIS | App tables (DESIGN §3), limit triggers, `create_pickup`, `nearby_stores`, `zip_location`, `is_premium` | D5–D7, D11 |
| Webhook route | Verify, dedupe, sync subscription snapshot | D8, F-8 |
| Cron route | Daily reminder run | D14, D15, F-12 |
| Reports routes | Pending summary + ack for the Action | D16, F-13 |
| Unsubscribe route | Token check, reminders off | D15, F-12 |
| GitHub Actions | CSV import on merge, monthly staleness, daily report forwarding, backup (Template D14) | D2, D14, D16, F-1, F-13 |
| Hermes checker | Reads `reward-report` issues and brand sites; comments or opens CSV-fix PRs | D16, A-18, F-13 |
| Builder scripts | Store, ZIP and grant scripts against production by explicit flag | D5, D9, D10, F-7, F-9 |
| OpenFreeMap | Style, tiles, glyphs, sprites | D11, F-10 |
| Stripe | Customers, Checkout, Portal, subscription state (test mode until §5.6) | D8, F-8 |

### Data flows
- **Flow 101, signed-out Discover (FR-2):** `/discover` → server client with no session → `anon` RLS returns popular rows → `retailer_counts()` for the prompt (D3).
- **Flow 102, onboarding (FR-6, FR-7):** guard `requireOnboarded` → `saveOnboarding` (month, day, detected zone) → enrollments upsert → dashboard (F-2).
- **Flow 103, My Rewards (FR-10–FR-16):** page → profile + enrollments + pickups → timing module → list or out-of-window state (F-4).
- **Flow 104, pickup (FR-17–FR-20):** action → timing module computes cycle bounds → `create_pickup` (lock, check, insert, remove group items) (D7, F-5).
- **Flow 105, plan (FR-22–FR-28):** group/item actions → insert → limit trigger with `private.is_premium` (D6, F-6).
- **Flow 106, entitlement (FR-35):** `getEntitlement()` → `public.is_premium()` once per request → premium data or FR-39 (D5, F-7).
- **Flow 107, map and route (FR-30–FR-34):** button → browser location (rounded, A-11) or ZIP → kept in context → `findStops`/`getGroupRoute` body → `requirePremium` → `nearby_stores` → route lib → server-rendered stop list + Google legs → map component fetches tiles from OpenFreeMap (D10–D12, F-10).
- **Flow 108, Smart Grouping (FR-29):** `suggestGroups` → same store lookup → clustering → user applies → Flow 105 per group (F-11).
- **Flow 109, payment (FR-37, FR-38):** flag check → server creates Customer, records `subscriptions` row → Checkout → `/billing/return` "processing" only → Stripe event → webhook verifies, dedupes, fetches the customer's subscriptions, upserts (D8, F-8).
- **Flow 110, account deletion (FR-37 + Template Flow 13):** `deleteAccount` → live subscription cancelled at Stripe → Template deletion and cascade.
- **Flow 111, reminders (FR-41, FR-42):** Vercel Cron → bearer → premium users with reminders on → timing module → claim `reminder_log` → `sendEmail` with `List-Unsubscribe` → release claim on failure (D15, F-12).
- **Flow 112, unsubscribe (FR-42):** email link → `GET` confirm page → `POST` with token → `reminders_enabled = false` → same "done" page for any token (D15).
- **Flow 113, report → fix (FR-48, NFR-11):** `reportReward` → `reward_reports` → daily `forward-reports.yml` → `GET /api/reports/pending` summary → issue per retailer → `POST /api/reports/ack` → Hermes checker reads issue + brand site → comment or CSV PR → owner merges → Flow 114 (D16, F-13).
- **Flow 114, catalogue publish (FR-1, FR-44):** merge to `main` touching the CSV → `retailers-import.yml` → one-transaction upsert/retire (D2, F-1).
- **Flow 115, staleness (FR-47):** monthly `stale-retailers.yml` reads the CSV only → one issue (D14, F-13).
- **Flow 116, store and ZIP data (FR-43, FR-30):** Builder runs `import:stores` / `import:zips` → DuckDB reads sources → per-brand replace-if-nonzero → coverage report (D9, D10, F-9).
- **Flow 117, grant (FR-36):** Builder runs `grant-premium` → `premium_grants` upsert as DB owner (D5, F-7).

## 3. Data model

The only place the app's fields are defined; Template tables (`profiles`, `private.rate_limits`, registry) are in Template DESIGN §3 and only `profiles`' additions are here. BUILD's migrations implement these definitions.

**"Meets Template table rules"** means: RLS on with deny-by-default policies, the restrictive MFA policy (`private.mfa_satisfied()`, Template D8) for all commands, an `on delete cascade` path to `auth.users`, an entry in `USER_DATA_TABLES` with its owner column, an RLS test file, and coverage in export (read with the user's own client, Template D13) and deletion (by cascade, Template D12). `anon` has no privileges on these tables. Every user-data table below meets them; only its owner rules are listed.

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "cascade"
  AUTH_USERS ||--o{ ENROLLMENTS : "cascade"
  AUTH_USERS ||--o{ REWARD_GROUPS : "cascade"
  AUTH_USERS ||--o{ PICKUPS : "cascade"
  AUTH_USERS ||--o| PREMIUM_GRANTS : "cascade"
  AUTH_USERS ||--o| SUBSCRIPTIONS : "cascade"
  AUTH_USERS ||--o{ REWARD_REPORTS : "cascade"
  AUTH_USERS ||--o{ REMINDER_LOG : "cascade"
  RETAILERS ||--o{ ENROLLMENTS : ""
  RETAILERS ||--o{ RETAILER_STORES : "cascade"
  RETAILERS ||--o{ PICKUPS : "restrict"
  RETAILERS ||--o{ REWARD_REPORTS : "restrict"
  REWARD_GROUPS ||--o{ REWARD_GROUP_ITEMS : "cascade"
  ENROLLMENTS ||--o{ REWARD_GROUP_ITEMS : "cascade (user_id, retailer_id)"
  ZIP_CENTROIDS {
    char zip PK
  }
  STRIPE_EVENTS {
    text id PK
  }
```

### `public.profiles`: app additions
| Field | Type | Null | Default | Checks / notes |
| --- | --- | --- | --- | --- |
| `birth_month` | smallint | yes | null | 1–12; null until onboarding (FR-6) |
| `birth_day` | smallint | yes | null | valid for the month, Feb 29 allowed; both null or both set |
| `time_zone` | text | yes | null | IANA name, validated by Zod (BUILD §0.5); null until onboarding |
| `onboarded_at` | timestamptz | yes | null | set when FR-7 finishes; "isn't sent back" |
| `reminders_enabled` | boolean | no | true | FR-42; only matters while premium |

**RLS change:** `authenticated` gains update on these five columns of its own row (Template column-privilege pattern). No year column anywhere (NFR-3).

### `public.retailers` (not user data)
Owner: the CSV (D2). Written only by the import, connecting as the database owner.

| Field | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | text | no | PK; CSV stable slug `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `name` | text | no | unique |
| `category` | enum `retailer_category` | no | `food_drink`, `entertainment`, `retail`, `beauty` (FR-3) |
| `description`, `reward_description` | text | no | |
| `timing_type` | enum `timing_type` | no | `from_birthday`, `birth_month`, `around_birthday` (FR-11) |
| `days_before` | smallint | yes | only for `around_birthday` (≥1) |
| `days_after` | smallint | yes | `from_birthday`: the length N (1 = birthday only); `around_birthday`: M (≥0); null for `birth_month`. Length limits: A-1 |
| `reward_type` | enum `reward_type` | no | `free_item`, `discount`, `bogo`, `points`, `free_with_purchase` |
| `requires_purchase` | boolean | no | |
| `purchase_requirement`, `membership_requirement`, `other_requirement` | text | yes | |
| `logo_file` | text | yes | file in `public/retailers/` (A-16) |
| `website_url`, `store_finder_url` | text | yes | `https:` only |
| `states_scope` | enum | no | `all`, `listed`, `unknown` (FR-5's three cases) |
| `state_codes` | char(2)[] | no | `'{}'`; non-empty only when `listed`; valid US codes |
| `is_popular` | boolean | no | FR-2 |
| `last_checked_on` | date | no | FR-46/FR-47 |
| `source_url` | text | no | FR-46 |
| `retired_at` | timestamptz | yes | FR-44 |
| `created_at`, `updated_at` | timestamptz | no | |

A check constraint ties the timing columns to `timing_type`. Indexes: `category`, partial on `is_popular`.
**RLS:** `anon` selects rows with `is_popular and retired_at is null`; `authenticated` selects all rows; no insert/update/delete grants. `retailer_counts()` (definer) returns the counts for FR-2's prompt.

### `public.retailer_stores` (not user data)
Owner: the store import (D9).

| Field | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint identity | no | PK |
| `retailer_id` | text | no | FK `retailers` on delete cascade |
| `source` | enum | no | `atp`, `overture` |
| `source_ref` | text | no | the source's feature ID; unique with `source` |
| `name` | text | no | store name as the source gives it |
| `address`, `city`, `postal_code` | text | yes | |
| `state` | char(2) | yes | |
| `location` | `extensions.geography(Point, 4326)` | no | GiST index |
| `imported_at` | timestamptz | no | |

**RLS:** on, no policies, no grants to `anon`/`authenticated`. Read only through `nearby_stores(...)` (definer, refuses non-premium; D11).

### `public.zip_centroids` (not user data)
`zip` char(5) PK · `location` geography(Point) not null (Census internal point, GiST index) · `state` char(2) not null (A-13). Built by `import:zips` (BUILD §0.1).
**RLS:** on, no policies or grants; read only through `zip_location(zip)` and `nearby_stores`, both premium-checking definers.

### `public.enrollments` (user data)
`user_id` uuid (FK `auth.users` cascade) · `retailer_id` text (FK `retailers` restrict) · `created_at`. PK `(user_id, retailer_id)`, so enrolling twice is a no-op (`on conflict do nothing`, FR-8).
**RLS:** the owner selects, inserts and deletes their own rows; no updates. Meets Template table rules.

### `public.reward_groups` (user data)
| Field | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | uuid | no | PK, `gen_random_uuid()`; unique `(id, user_id)` for the item FK |
| `user_id` | uuid | no | FK `auth.users` cascade |
| `name` | text | no | 1–80 characters (A-19); unique per user on `lower(name)` (FR-23) |
| `pickup_date` | date | no | user's local date (D4) |
| `pickup_time` | time | no | user's local time |
| `created_at`, `updated_at` | timestamptz | no | |

**RLS:** the owner selects, inserts, updates and deletes their own rows. The limit trigger (D6) runs on insert. Meets Template table rules.

### `public.reward_group_items` (user data)
`id` uuid PK · `group_id` uuid · `user_id` uuid · `retailer_id` text · `position` int not null · `created_at`.
- FK `(group_id, user_id)` → `reward_groups(id, user_id)` on delete cascade: an item can only sit in its owner's group.
- FK `(user_id, retailer_id)` → `enrollments` on delete cascade: only enrolled retailers; unenrolling removes items (FR-8, FR-26).
- Unique `(group_id, retailer_id)` (FR-26). Order is `position`, then `id`.

**RLS:** the owner selects, inserts, updates (`position` only) and deletes their own rows. Limit trigger on insert (D6). Meets Template table rules (cascade via `auth.users` → groups/enrollments).

### `public.pickups` (user data)
| Field | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | FK `auth.users` cascade |
| `retailer_id` | text | no | FK `retailers` restrict (retailers are never deleted, FR-44) |
| `picked_up_on` | date | no | user's local date; never future (FR-17) |
| `note`, `location_label` | text | yes | each within FR-17's length limit (check constraint) |
| `created_at`, `updated_at` | timestamptz | no | |

Index `(user_id, retailer_id, picked_up_on)`. **RLS:** the owner selects and deletes their own rows, and updates `note` and `location_label` only (FR-20). No direct insert grant: inserts go through `create_pickup` (D7). Meets Template table rules.

### `public.premium_grants` (user data)
`user_id` uuid PK (FK `auth.users` cascade) · `granted_at` timestamptz not null · `revoked_at` timestamptz null (active while null) · `updated_at`.
**RLS:** the owner selects their own row; no insert/update/delete grants to anyone but the database owner (the grant script, D5). Meets Template table rules.

### `public.subscriptions` (user data)
| Field | Type | Null | Notes |
| --- | --- | --- | --- |
| `user_id` | uuid | no | PK; FK `auth.users` cascade |
| `stripe_customer_id` | text | no | unique; created before Checkout (D8) |
| `stripe_subscription_id` | text | yes | unique |
| `status` | text | yes | Stripe's status as last fetched |
| `current_period_end` | timestamptz | yes | |
| `cancel_at_period_end` | boolean | no | false |
| `synced_at` | timestamptz | no | when the snapshot was fetched |

**RLS:** the owner selects their own row; writes only by `service_role` (webhook and checkout set-up). Meets Template table rules.

### `public.stripe_events` (not user data)
`id` text PK (Stripe event ID) · `type` text · `received_at` timestamptz. No customer or user fields. Deleted after A-20's period by the webhook's own clean-up (A-20).
**RLS:** on, no policies; `service_role` only.

### `public.reward_reports` (user data)
`id` uuid PK · `user_id` uuid (FK cascade) · `retailer_id` text (FK restrict) · `reason` enum (`expired`, `different_reward`, `wrong_timing`, `store_closed`; FR-48) · `cycle_start` date not null (from the timing module) · `created_at` · `batch_id` uuid null (claimed by `/api/reports/pending`) · `forwarded_at` timestamptz null. Unique `(user_id, retailer_id, cycle_start)` (FR-48; a birthday change can shift `cycle_start`, accepted, A-21).
**RLS:** the owner inserts and selects their own rows (`forwarded_at` excluded from the insert grant); only `service_role` updates `batch_id` and `forwarded_at`. No user update or delete (a report is a record for the owner). Meets Template table rules.

### `public.reminder_log` (user data)
`id` uuid PK · `user_id` uuid (FK cascade) · `kind` enum (`plan_ahead`, `expiring`) · `cycle_start` date not null · `sent_on` date not null (user's local date) · `created_at`. Unique `(user_id, kind, cycle_start)` where `kind = 'plan_ahead'`; unique `(user_id, kind, sent_on)`. The 3-day spacing (A-9) is checked by the job against the latest `expiring` row.
**RLS:** the owner selects their own rows (export); only `service_role` inserts and deletes (claims, D15). Meets Template table rules.

### Registry additions
- `USER_DATA_TABLES`: `enrollments`, `reward_groups`, `reward_group_items`, `pickups`, `premium_grants`, `subscriptions`, `reward_reports`, `reminder_log` (owner column `user_id` each).
- `NON_USER_DATA_TABLES`: `retailers` (CSV catalogue), `retailer_stores` (public store locations), `zip_centroids` (Census data), `stripe_events` (event IDs only, 30-day retention).

### Assumptions (continuing SPEC)
- **A-11** Start coordinates are rounded to 3 decimal places (about 110 m) before leaving the browser.
- **A-12** (dropped 2026-10-06: reports have no note.)
- **A-13** A ZIP's state is the state holding most of its land (Census relationship file); browser location uses the nearest ZIP centroid's state, so it can be wrong near borders.
- **A-14** Store rows plus the ZIP table fit well inside Supabase Free's 500 MB; measured at the first import.
- **A-15** Stop choice considers a few nearest stores per brand (number set and tuned in BUILD).
- **A-16** Brand logos are copied into the repo and used only to identify the brand.
- **A-17** Reminder emails go out at one fixed UTC hour (Vercel Hobby cron).
- **A-18** The owner's Hermes bot runs nightly; if it doesn't, report issues wait.
- **A-19** Group names are 1–80 characters (the Template's display-name length).
- **A-20** Stripe event IDs are kept 30 days, longer than Stripe's retry period.
- **A-21** A birthday change may let a user report the same retailer twice in one cycle.
- **A-22** "A handful" of retirements per automatic import run is 5; more needs a manual dispatch with an allowance.
- **A-23** A Google Maps directions link with no origin starts from the device's location.
- **A-24** The reminder daily send budget (BUILD §0.4) leaves WishJar at least half of Resend's daily limit.

## 4. Security

### 4.1 Boundaries and checks
Template DESIGN §4.1 applies unchanged. New boundaries:

1. **Stripe → webhook:** untrusted until the signature on the raw body verifies; even then the payload's state is ignored (D8).
2. **Vercel Cron / GitHub Action → bearer routes:** a shared secret is the only check (BUILD §0.2 `cron` level; the reports routes use the same pattern with their own secret).
3. **Email-link holder → unsubscribe:** the token proves only "may turn this user's reminders off" (D15).
4. **Builder machine → production DB:** scripts connect as the database owner, bypassing RLS; production needs `--target=production` (BUILD §0.1).
5. **GitHub ↔ app data:** GitHub holds only retailer IDs, reasons and counts (D16); the CSV-import Action holds the DB URL (T-114).
6. **Web content → Hermes checker:** brand sites and issue text are untrusted data (NFR-11).
7. **Outside data → DB:** CSV PRs (D2) and ATP/Overture/Census files (D9) are validated, never trusted.
8. **Browser → OpenFreeMap and Google:** the browser talks to these directly; the app server never does.

**Where the app's checks happen:** the entitlement step in actions (BUILD §0.2); the same check again inside `nearby_stores`, `zip_location` and the limit triggers (D5, D6, D11), so a forgotten TypeScript check still fails closed; RLS and column grants per DESIGN §3; route-handler checks per D17.

**Secrets (names and readers: BUILD §0.6):**

| Secret | Lives in |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Vercel env; `.env.local` (test mode) |
| `CRON_SECRET`, `REMINDER_UNSUBSCRIBE_SECRET` | Vercel env; `.env.local` |
| `REPORTS_EXPORT_SECRET` | Vercel env and GitHub Actions secret |
| `STRIPE_TEST_SECRET_KEY` | GitHub Actions secret (metric 3), `.env.local` |
| `SUPABASE_DB_URL` | GitHub Actions secret (already, Template D14); Builder's `.env.local` for the scripts |
| Checker's GitHub credential | Owner's laptop (scope: D16) |

### 4.2 Threat model
Template T1–T22 apply to every app table and endpoint (Template DESIGN §4.2). Only the app's threats follow.

| ID | Asset | Threat | Impact | Stopped by | Residual |
| --- | --- | --- | --- | --- | --- |
| T-101 | Premium features | Free user calls a premium action, RPC or filter directly (own cookie, PostgREST) (E) | Free premium | `requirePremium` (BUILD §0.2); definer functions refuse non-premium (D11); limit triggers use `private.is_premium` (D6); server ignores FR-45/FR-5 filters; no premium data in free payloads; metric 2 tests (F-7) | Pure-TS premium logic (FR-29 clustering, FR-34 links) needs store data only `nearby_stores` returns, so it's useless without premium |
| T-102 | Entitlement | Forge premium: write `premium_grants`/`subscriptions`, hit `/billing/return`, or send a customer ID in metadata (E, T) | Free premium | No write grants (D5, NFR-2 RLS test); success page never grants (NFR-8); user ↔ customer mapping only from the row the server created before Checkout (D8) | – |
| T-103 | Entitlement, billing | Forged, replayed or out-of-order webhook (S, T) | Premium on/off wrongly | Signature + 5-minute tolerance; event-ID dedupe; snapshot fetched from Stripe, so order and replay converge (D8, NFR-8 tests) | If the snapshot fetch fails after the event ID is stored, Stripe's retry is absorbed as a duplicate; D8 deletes the claim on failure, so the retry runs |
| T-104 | Catalogue | Signed-out scraping of non-popular retailers (I) | Curation copied without sign-up | `anon` RLS (D3); non-popular detail pages 404 (BUILD §0.2); counts only from `retailer_counts()` | Logos are static files at guessable `/retailers/<slug>.*` paths, so probing confirms which brands exist (accepted: names only). A free account sees everything by design (FR-2) |
| T-105 | Plan, pickups | Parallel requests race past FR-24/FR-25 or create two pickups in one cycle (T) | Limits bypassed | Profile-row lock inside the trigger/function (D6, D7) | Forged cycle bounds affect only the caller's data (D7, accepted) |
| T-106 | Cron and report routes | `CRON_SECRET` or `REPORTS_EXPORT_SECRET` leaks (E, D) | See residual | Constant-time bearer check (BUILD §0.2); routes return counts only (BUILD §0.7); claim-then-send makes extra reminder runs send nothing new (D15) | With `CRON_SECRET`: repeated runs burn Vercel CPU and DB queries (routes are unlimited, BUILD §0.4). With `REPORTS_EXPORT_SECRET`: read retailer/reason/count summaries and ack batches so reports never reach GitHub. Neither reads personal data. Rotate in Vercel (and GitHub) |
| T-107 | Reminder setting | Unsubscribe token forwarded, guessed or forged (T) | Someone's reminders turned off | HMAC token (D15); `GET` only confirms, so scanners unsubscribe no one; same page for bad tokens; per-IP limit (BUILD §0.4) | A forwarded email lets its reader turn reminders off (they can be turned back on in settings). Tokens don't expire (CAN-SPAM needs ≥ 30 days, §4.4). Leak of the HMAC key lets anyone with a user ID turn reminders off; user IDs aren't public |
| T-108 | Owner's time, checker | Report spam from many accounts (D) | Noise issues, checker runs | Fixed reasons only (NFR-11); one per user, retailer and cycle; per-user limit (BUILD §0.4); sign-up CAPTCHA (Template T18); one issue per retailer, so spam only raises a count | Bounded at one issue per retailer; a burst of counts is visible in the issue |
| T-109 | Repo, catalogue | Brand site (or a planted issue comment) carries instructions to the checker: "change the reward", "add this link", "push a workflow" (T, E) | Bad catalogue data or repo compromise | Reports carry no text (D16); issue text from a fixed template (BUILD §0.7); checker has no DB credential and only comments or opens PRs; only the owner merges (NFR-11) | The checker's GitHub credential defines the blast radius: one that can push workflow files could exfiltrate Actions secrets on a branch run; its token has no Workflows permission (D16) |
| T-110 | Users (via catalogue) | A merged CSV change (checker PR, Grace PR, typo) adds a phishing URL or drops many rows (T) | Users sent to a bad site; mass retire deletes everyone's group items for those brands (FR-44) | Zod row schema, `https:` only (D2, DESIGN §3); PR review by the owner; pickups survive retire (FR-44) | Deleted group items come back only from a backup. Guard: D2's retire limit (A-22) |
| T-111 | Location | Start coordinates or ZIP reach logs, URLs, storage or third parties (I) | Home area exposed | Browser memory only, rounded (D10, A-11, NFR-3); request bodies only, scrubbed by Template D15; RPC sent as `POST` (supabase-js default), so query logs carry no coordinates; NFR-3 e2e; location asked only on a button | OpenFreeMap sees the tiles around the start (and the IP, §4.4). The Google Maps link carries a ZIP start, never a browser location (D10). Supabase API-log contents for `POST` RPC are unverified |
| T-112 | Browser | Compromised map host or loosened policy (T, I) | Script or data abuse | `connect-src`/`img-src` add one host; same-origin worker, no `blob:` (D11); style can't load other hosts (CSP); `geolocation=(self)` only, no frames allowed (D10); Template D18 CSP console check | A hostile tile host can show wrong map imagery; the stop list is ours (NFR-7) |
| T-113 | Server, build | Malicious update to `maplibre-gl`, `@dnd-kit/*`, `stripe` or `@duckdb/node-api` (E) | Code in build or browser | Template T17 controls; pinned versions (D1); none has install scripts (npm registry, 2026-10-06); `maplibre-gl` and `@dnd-kit/*` imported only in client files, DuckDB only in `scripts/` (BUILD §0.1) | DuckDB's native binary is installed in every CI and Vercel build (devDependency) though only the Builder runs it |
| T-114 | Database | `retailers-import.yml` holds `SUPABASE_DB_URL` (database owner) (E) | Full DB access if workflow code is hijacked | Runs only on push to `main` touching the CSV, or manual dispatch (D2); never on `pull_request`; secret exposed only to the import step; SHA-pinned Actions (Template D18) | Marginal over Template T12: the same secret is already in this repo for the backup. New exposure: the import runs repo code and `npm ci` dependencies with the secret, on every CSV merge |
| T-115 | Users (via stores) | Junk or planted store points from ATP/Overture (T) | Users sent to a closed or fake address | Overture confidence threshold (D9); replace-if-nonzero; names rendered as text (rule 10); "straight-line" and store-finder link (FR-31, FR-32) | Some wrong stops; reports (FR-48 "store closed") feed back |
| T-116 | Shared email quota | Reminder bug or doubled run floods Resend, starving WishJar and auth emails (D) | Missed emails in both apps | Unique claims per reminder (D15, DESIGN §3); NFR-9 sizing; cron routes not callable without the bearer | Per-run send budget (D15) |
| T-117 | Billing, personal data | Deleted account keeps being charged, or a late webhook recreates data (I, T) | Charge after deletion | Cancel at Stripe before deletion (FR-37); sync updates only rows found by `stripe_customer_id` and never inserts for unknown customers (D8) | If Stripe is unreachable, deletion stops with an error rather than proceeding (F-8 contract) |

### 4.3 Privacy
Template DESIGN §4.3 rows stand. App additions (all in `USER_DATA_TABLES`, so export reads them with the user's client and deletion cascades: Template rule 19, D12, D13). "Account" = until deletion, then backup retention (Template D14).

| Personal data (where) | Why | Who sees it | Retention | Export | Deletion |
| --- | --- | --- | --- | --- | --- |
| Birth month, day (`profiles`) | Window, countdowns (FR-6, FR-10) | User; Builder | account | Yes | Cascade |
| Time zone (`profiles`) | "Today" (D4) | User; Builder | account | Yes | Cascade |
| `onboarded_at`, `reminders_enabled` (`profiles`) | Flow state, FR-42 | User; Builder | account | Yes | Cascade |
| Enrolled programs (`enrollments`) | Core feature (FR-8); reveals shopping habits | User; Builder; Resend (in reminder bodies) | account | Yes | Cascade |
| Group names, pickup date/time, items (`reward_groups`, `reward_group_items`) | Plan (FR-23); names are free text | User; Builder | account | Yes | Cascade |
| Pickups: retailer, date, note, location label (`pickups`) | History (FR-17, FR-19); note/label may hold places | User; Builder | account | Yes | Cascade |
| Grant dates (`premium_grants`) | Entitlement (FR-36) | User; Builder | account | Yes | Cascade |
| Stripe customer and subscription IDs, status, period end, cancel flag (`subscriptions`) | Entitlement (FR-37) | User; Builder | account | Yes | Cascade, after the Stripe cancel (FR-37) |
| Email, name, card, billing address, invoices (at Stripe) | Payment; Stripe is a processor | Stripe; Builder (dashboard) | Per Stripe (not researched) | Invoices via the Portal | Subscription cancelled and the Customer deleted (D8); Stripe keeps payment records |
| Reports: retailer, reason, cycle (`reward_reports`) | FR-48 | User; Builder; GitHub sees counts only (D16) | account | Yes | Cascade; GitHub issues hold nothing personal |
| Reminders sent (`reminder_log`) | Once-per-cycle rule (FR-41) | User; Builder | account | Yes | Cascade |
| Reminder email content + address (Resend) | Delivery | Builder (dashboard) | Per Resend (Template row) | No | Provider listed |
| Start location / ZIP | Map, stops, state (FR-30) | User's browser; app server inside one request; Google if the user opens the link | Memory only, gone on reload (D10) | Nothing stored | Nothing stored |
| Map tile requests (OpenFreeMap) | Map (FR-32) | OpenFreeMap: area viewed; IPs not in logs by default, logs deleted after 7 days, up to 30 in incidents; may use Cloudflare as CDN (openfreemap.org/privacy, 2026-10-06) | Per OpenFreeMap | No | Provider listed |
| User ID in unsubscribe links | Token (D15) | Vercel request logs | Per Vercel (not researched) | No | – |

Not personal: `retailers`, `retailer_stores`, `zip_centroids`, `stripe_events` (DESIGN §3 registry).

### 4.4 Legal needs
Items for LAUNCH_CHECKLIST, pointing here:
- **Privacy policy additions:** Stripe as payment processor (when payments are on); OpenFreeMap receives tile requests, including the IP and viewed area, from the user's browser; Google receives the route when a user opens a directions link; reminder emails go through Resend and list the user's programs; reports reach GitHub only as anonymous counts.
- **Attribution:** map shows "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (MapLibre adds it; openfreemap.org, 2026-10-06; OSM data is ODbL). Store data: All The Places (CC0, no attribution required, credited anyway); Overture Places requires crediting each source and licence ("Data from … Available under CDLA Permissive 2.0"; Foursquare under Apache 2.0; docs.overturemaps.org/attribution, 2026-10-06), on an about/credits page. Census ZCTA data: US government (licence not checked).
- **CAN-SPAM (reminders, FR-42):** FTC lists: opt-out honoured within 10 business days, opt-out working ≥ 30 days after sending, and a **valid physical postal address** in each message; "transactional or relationship" is read narrowly (ftc.gov CAN-SPAM guide, 2026-10-06). D15 covers the first two; the address: owner decision pending (LAUNCH-CHECKLIST).
- **Vercel Hobby is non-commercial:** move to Vercel Pro before payments go live (SPEC §1; §5.6 step 1).
- **Terms:** reward data may be out of date; brands' own terms win; Stripe subscription terms and cancellation when payments are on.

## 5. Operations

Template DESIGN §5 (environments, failure modes, monitoring, backups, rollback, limits, risks) applies. App additions only.

### 5.1 Free-tier limits the app adds
Quotas themselves live in Template DESIGN §5.3; the app's use of them:

| Service | Limit (source, opened 2026-10-06) | App's use | Fits? |
| --- | --- | --- | --- |
| Supabase Free DB | 500 MB per project (supabase.com/pricing) | See estimate below | Yes, estimate; A-14 measures it |
| Supabase pausing | Paused after inactivity; "a few user requests to the database each day over the previous week" is typically enough; warning email ~1 week before (supabase.com/docs/guides/platform/free-project-pausing) | §5.2 | Method in §5.2 |
| Vercel Hobby Cron | 100 jobs per project, at most once per day, fired anywhere in the hour (±59 min) (vercel.com/docs/cron-jobs/usage-and-pricing) | 1 daily job (D14) | Yes |
| Resend Free | limits: Template DESIGN §5.3; shared with WishJar | Reminders: NFR-9; one sending domain | Yes (NFR-9); T-116 |
| GitHub Free Actions | 2,000 min/month, 500 MB artifacts, shared by all private repos (docs.github.com billing) | `forward-reports` ≈ 30 min/month (1 min × daily), `stale-retailers` ≈ 2 min, `retailers-import` ≈ 3 min per CSV merge, backup ≈ 60 (Template D14) | ≈ 100–130 min/month (estimate; per-job rounding not checked) |
| OpenFreeMap | No SLA: "I don't offer SLA guarantees" (openfreemap.org) | Map tiles | NFR-7 fallback; D11 host switch |
| Stripe test mode | Sandbox webhook retries only "three times over the course of a few hours"; live mode up to three days (docs.stripe.com/webhooks) | F-8 tests | A-20's 30 days covers live retries |

**Database size estimate** (assumptions stated; measured at first import, A-14):
- `retailer_stores`: ≈ 115 ATP brands (RESEARCH) plus Overture's extra brands; assume ≈ 1,500 US stores per covered brand on average, and both sources stored for overlapping brands (D9 keeps rows per source) → ≈ 200k–400k rows. At ≈ 350 bytes per row including the GiST and unique indexes → **≈ 70–140 MB**.
- `zip_centroids`: ≈ 33.8k ZCTAs (2020 Census count, from memory, not re-opened; the Gazetteer file is 1.0 MB, census.gov 2026-10-06) × ≈ 150 bytes with index → **≈ 5 MB**.
- PostGIS objects (`spatial_ref_sys` etc.): **≈ 7–10 MB** (estimate).
- User data for a few hundred users: **< 5 MB**.
- Total app additions **≈ 90–160 MB**: fits 500 MB with room for WAL and Template tables. If measured rows exceed ~600k, store one source per brand (ATP first) before adding more brands.

### 5.2 Pausing (NFR-10)
**Method:** the app's own daily workload, no synthetic ping. Each day the reminder cron (D14) runs its premium-user query through the API even when nobody is due, and `forward-reports.yml` calls `/api/reports/pending`, which queries `reward_reports`; the daily backup dump (Template D14) adds a direct connection. These are real "requests via your connected application", which the pausing page names as activity, so they're within Supabase's terms. **Unverified:** whether service-role API queries count as "user" activity the way signed-in traffic does. **Backstops:** Supabase's warning email (≈ 1 week before) reaches the owner, who signs in and uses the app; NFR-10's 30-day check after launch. Until F-12 and F-13 ship, only the backup runs daily, so watch for the warning email.

### 5.3 Monitoring
A silent failure must show up within a week (the weekly glance, Template DESIGN §5.2).

| Job | Failure shows as | How it's noticed |
| --- | --- | --- |
| Reminder cron (F-12) | Error → `logError` → Sentry alert. **Missed run** (Hobby: no retries) → nothing | Sentry email; weekly glance at Vercel's cron log (count summary per run, BUILD §0.7). Missed days reconcile on the next run (D14). Heartbeat: D16 |
| Stripe webhook (F-8) | 4xx/5xx → Stripe retries | Errors in Sentry; Stripe's event-deliveries tab in the weekly glance |
| `forward-reports.yml` | Workflow fails | GitHub's failed-workflow email (default notification; not re-checked) |
| `retailers-import.yml` | Fails loudly on a bad row or missing column (D2) | Failed-workflow email right after the merge; the merged CSV isn't live until fixed |
| `stale-retailers.yml` | Fails, or finds nothing | Failure email; the job writes a run summary either way, so "none stale" is distinguishable from "didn't run" |
| Store/ZIP import (F-9) | Builder-run; prints coverage | Monthly owner reminder (owner's own schedule); `imported_at` shows age; per-brand last-good rows mean a bad run degrades nothing |
| Hermes checker | Doesn't run (A-18) | Open `reward-report` issues without a checker comment |
| Quotas | Resend shared with WishJar; Actions minutes shared | Added to the weekly glance |

### 5.4 Backups and restore
- The app's tables live in the same Postgres database, so Template D14's dump covers them with no change: user-data tables, `retailers` (needed: `pickups` and `reward_reports` reference it with `restrict`, and retired rows exist only in the DB), `stripe_events`, `zip_centroids` (small).
- **Decision: exclude `public.retailer_stores`'s data** from the data dump (`-x public.retailer_stores`, the flag the backup already uses, Template BUILD F-12). It's public data, rebuilt by `import:stores` (Flow 116), and at §5.1's size 30 daily copies would strain the shared 500 MB artifact storage. Its schema stays in the schema dump.
- **Restore** = Template F-12, then `import:stores --target=production`, then a premium user checks one map. Recorded with the restore date.

### 5.5 Rollback
Template D19 applies (code only, never the database).
- **Payments:** set `PAYMENTS_ENABLED=false` and redeploy; Instant Rollback also works because it restores the old deployment's env (Template D19). Existing subscriptions keep syncing (D8).
- **Catalogue:** revert the CSV PR; the Action re-imports. Retired-then-restored rows come back, but group items deleted by the retire don't (T-110; D2's retire limit).
- **Store data:** re-run the import; a 0-result source never wipes a brand (FR-43).
- **Cron or Actions:** remove the entry from `vercel.json` and redeploy, or disable the workflow in GitHub.

### 5.6 Turning payments on (runbook outline)
Owner's decision (SPEC §1); BUILD F-8 holds the steps in full.
1. Move the Vercel project to **Pro** (Hobby is non-commercial); confirm cron and limits.
2. Set the price (SPEC §1 open question) and create the live Product/Price; set `STRIPE_PRICE_ID`.
3. Create a **restricted** live API key (only Customers, Checkout Sessions, Billing Portal sessions, Subscriptions read/cancel) as `STRIPE_SECRET_KEY`; configure the live Customer Portal ("cancel at period end").
4. Register the live webhook endpoint `https://thebirthdayrun.com/api/stripe/webhook` with only the subscription events F-8 lists; set its `whsec_` as `STRIPE_WEBHOOK_SECRET`.
5. Publish the privacy and terms additions (§4.4).
6. Set `PAYMENTS_ENABLED=true`, redeploy, make one real purchase and cancel with the owner's card, check `subscriptions` and FR-35, refund it.
7. Rollback: §5.5.

### 5.7 How the SPEC §2.1 metrics are collected
Targets and methods: SPEC §2.1. Results go into the `docs/decisions/` sign-off entry, as in Template DESIGN §5.5.
- **Metric 1:** the owner's per-FR checklist (pass/fail, date) and each sister's confirmation, in the sign-off entry; the `E2E_TARGET=deployed` Playwright report linked there.
- **Metric 2:** GitHub Actions history of the e2e and integration jobs on `main` (stranger account and premium-refusal tests).
- **Metric 3:** the Stripe integration test's CI log on `main` with `STRIPE_TEST_SECRET_KEY` set; a "skipped" result doesn't count for sign-off.
- **Metric 4:** the grant/revoke integration test in CI; the owner's production runs (own account, both sisters) noted in the sign-off.
- **Metric 5:** Template DESIGN §5.5 metrics 3–4, with the app's tables in the registry.
- **Metric 6:** the FR-43 import output, pasted into RESEARCH.md by the Builder with the run date.

### 5.8 Risks
App additions to Template DESIGN §5.4. Security residuals are in §4.2.

| Risk | Impact | Mitigation | Decision needed? |
| --- | --- | --- | --- |
| Service-role cron/API queries don't count as activity | Project pauses between birthdays | §5.2 backstops | No (watch in the 30-day check) |
| OpenFreeMap slows or stops | No map | NFR-7 stop list and links; D11 host switch | No |
| ATP spiders break for weeks; Overture junk | Missing or wrong pins | Last-good rows (FR-43); confidence filter; reports | No |
| Store table larger than estimated | Nears 500 MB | Measure at first import (A-14); one source per brand | Only if measured > ~300 MB |
| Hermes checker down or misled | Reports wait or bad PRs | A-18; owner merges (NFR-11); T-109 | D16 |
| Mass retire from a bad CSV merge | Users' group items lost | Review; D2 retire guard | Yes (D2, A-22) |
| Shared Resend quota with WishJar | Both apps' emails fail on a bad day | NFR-9; T-116 cap | D15 send budget |
| Vercel Pro cost when turning payments on | Breaks the $0 budget | Owner's go-ahead only (SPEC §1) | Owner, later |
| Reminder sent at an odd local hour (A-17) | Mild annoyance | Daily reconcile; content is about days, not hours | No |
