# The Birthday Run: Launch Checklist

Two launches (ROADMAP): **v1** after phase 4 and **v2 sign-off** after phase 7 (dates: ROADMAP). Items point to their home; details live there. Built from the Template's generic list (`docs/LAUNCH_CHECKLIST.md`).

## v1: Product
- [ ] Every [v1] FR works end to end on thebirthdayrun.com (SPEC §2.2; metric 1's checklist)
- [ ] The e2e journey passes against production (`E2E_TARGET=deployed`)
- [ ] Google sign-in tried by hand: new account, existing account, cancel
- [ ] Tested on a real phone (iPhone and Android if possible) and one desktop browser
- [ ] Empty, error and loading states look right (SPEC §3.3)
- [ ] **F-14 done:** every retailer checked, with source and date; unverifiable ones held back (BUILD F-14); count recorded here: 100 live, 87 held back in `data/retailers-unverified.csv`, 4 removed (Golden Corral, Red Robin, Francesca's, Joann); checked 2026-11-23, PRs #31–#41. Most held-back rows state a reward but not its dates (app check: #21)
- [ ] Signed-out Discover shows popular retailers only, and the "+N more" count is right (FR-2)
- [ ] Owner and both sisters granted premium on production (metric 4)

## v1: Security and privacy
- [ ] `/pre-push-review` passed on the release; CI green
- [ ] RLS tests pass, including every app table (metric 5; DESIGN §3)
- [ ] Metric 2's free-account tests pass (no premium data or action reachable)
- [ ] Threat items marked "before launch" done (DESIGN §4.2)
- [ ] Privacy policy and terms filled in and linked in the footer, including the app's additions: OpenFreeMap and Google Maps links, Stripe as processor, store-data licences (DESIGN §4.3, §4.4)
- [ ] Privacy policy lists the Template's service providers and says deleted data can stay in backups up to the backup retention (Template list)
- [ ] Supabase auth audit log after deletion decided and stated (Template decisions/0017)
- [ ] Lost-authenticator rule in the support notes (Template list)
- [ ] `GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY` not on Vercel; only `main` deploys (`vercel.json` `git.deploymentEnabled`; CI builds and tests every PR instead), and previews stay behind Vercel Authentication if ever turned on
- [ ] `Permissions-Policy` sends `geolocation=(self)` and nothing broader (decisions/0002)

## v1: Operations
- [ ] Sentry receives a test error and the alert email arrives
- [ ] Daily encrypted backup on; first backup restored into a fresh project and the date recorded (DESIGN §5.4)
- [ ] Rollback tried once on a preview deploy (DESIGN §5.5)
- [ ] Production env vars set (BUILD §0.6), no test keys; `PAYMENTS_ENABLED` off
- [ ] `supabase config push` with the `[remotes.production]` block filled in; SMTP still set afterwards
- [ ] Not paused, and the keep-alive in DESIGN §5.2 is running
- [ ] Retailer import Action ran on `main` and the counts match the CSV (D2)

## v1: Domain, email, SEO
- [ ] thebirthdayrun.com on this repo's Vercel project, with HTTPS
- [ ] This app's own sending domain verified in Resend; `EMAIL_FROM` uses it; sign-up and reset emails arrive
- [ ] Turnstile widget, Google OAuth client and Supabase redirect URLs list thebirthdayrun.com
- [ ] Google Branding home page and privacy policy links point to thebirthdayrun.com, and thebirthdayrun.com is an authorized domain (they use the *.vercel.app address until launch)
- [ ] Title, description and share image look right when the link is pasted into a chat

## v1: Support
- [ ] Support email set in the config and working
- [ ] Reports (FR-48) reach GitHub as issues (F-13, if built by then; otherwise the support email)

## v2 sign-off (after phase 7)
- [ ] Metrics 1–5 pass (SPEC §2.1; collected per DESIGN §5.7)
- [ ] Store coverage report saved in RESEARCH.md (metric 6)
- [ ] Map works with tiles blocked (NFR-7); OpenStreetMap credit shows
- [ ] Vercel Production has `CRON_SECRET` and `REMINDER_UNSUBSCRIBE_SECRET` (Sensitive; `openssl rand -hex 32` each), and Vercel → Cron Jobs lists `/api/cron/reminders` (decision 0015: without them no reminder is sent)
- [x] Reward reports (F-13, D16): the same new `REPORTS_EXPORT_SECRET` in Vercel Production (Sensitive) and in GitHub → Settings → Secrets → Actions; repo **variable** `SITE_URL` = `https://www.thebirthdayrun.com` (done 2026-11-24)
- [ ] Once the app replaces the "Back soon" page: `gh workflow enable forward-reports.yml` (disabled 2026-11-24, since every path served the placeholder and the daily run would fail), then `gh workflow run forward-reports.yml --ref main` and check it succeeds ("0 retailers" with no reports yet)
- [ ] The Hermes checker holds a GitHub credential for this repo only and no database, Supabase, Vercel or Stripe key; record its first three runs (BUILD F-13 checker contract, NFR-11)
- [ ] Reminder emails: a doubled run sends once; one-click turn-off works from Gmail's button; send budget respected (D15)
- [ ] In Gmail's "Show original" of a real reminder, Resend's DKIM signature covers `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058; BUILD F-12 "Unverified")
- [ ] **Reminder emails and CAN-SPAM:** decide the postal-address question (DESIGN §4.4) before any reminder reaches someone outside the family
- [ ] Report heartbeat check fails loudly when the reminder cron is stopped (D16)
- [ ] The checker's GitHub token has only the scopes in D16, and expires within a year

## Before turning payments on (owner's decision; DESIGN §5.6)
- [ ] Vercel Pro (Hobby is non-commercial)
- [ ] A physical postal address for commercial email (DESIGN §4.4)
- [ ] Live Stripe keys, webhook endpoint, price set; a real-card test and refund
- [ ] Privacy policy and terms updated for paid plans

## After each launch (first week)
- [ ] Check Sentry and the cron/Action runs daily
- [ ] Count the metrics on the "Decide" date in ROADMAP
