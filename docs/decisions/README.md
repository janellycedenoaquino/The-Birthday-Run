# Decisions

One file per decision made after planning. Newest number wins; old files are never edited, only superseded.
Add one whenever an approved decision (the app's spec or design, or the stack) changes, or a choice would surprise someone reading the code later. Copy `0000-template.md`.

The Template's own decisions are in `docs/template/decisions/`.

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| 0001 | Planning decisions (DESIGN §1 D1–D17) | accepted | 2026-10-06 |
| 0002 | Permissions-Policy allows geolocation for this site | accepted | 2026-10-06 |
| 0003 | Guards gain `not_onboarded` and `not_premium` results | accepted | 2026-10-06 |
| 0004 | Own local Supabase name and ports | accepted | 2026-10-06 |
| 0005 | Sentry `traceLifecycle: "static"` (no per-request warning; transaction scrubber honoured) | accepted | 2026-11-22 |
| 0016 | Landing page look sets the app's brand (tunnel, pastel colours, pause control) | accepted | 2026-11-24 |
| 0017 | The whole retailer catalogue is public (signed-out Discover, every retailer page, sitemap) | accepted | 2026-11-24 |
| 0018 | My Rewards is the signed-in home; no separate dashboard | accepted | 2026-11-24 |
| 0019 | The plan-ahead email goes out when the user can first act (up to 32 days before) | accepted | 2026-11-24 |
| 0020 | Stripe: checkout and portal hosts in form-action; `stripe` 23.2.0 (API `2026-11-18.endive`) | accepted | 2026-11-25 |
| 0021 | Stripe webhook records the event after its sync; checkout asks Stripe first; Customer deleted last | accepted | 2026-11-25 |
