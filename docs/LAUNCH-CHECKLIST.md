# The Birthday Run: Launch Checklist

Two launches (ROADMAP): **v1** after phase 4 and **v2 sign-off** after phase 7 (dates: ROADMAP). Items point to their home; details live there. Built from the Template's generic list (`docs/LAUNCH_CHECKLIST.md`).

## v1: Product
- [ ] Every [v1] FR works end to end on thebirthdayrun.com (SPEC §2.2; metric 1's checklist)
- [x] The e2e journey passes against production (`E2E_TARGET=deployed`) *(2026-11-26: passed in 3.7 min against www.thebirthdayrun.com with Turnstile test keys for the run, then the real keys were put back and the live scripts checked for the real site key. The first try failed at the confirm link because it had been clicked by mistake, which confirmed the account; so the passing run signed in through a magic link, and the `type=signup` confirm link was not exercised by it)*
- [ ] Google sign-in tried by hand: new account, existing account, cancel
- [ ] Tested on a real phone (iPhone and Android if possible) and one desktop browser
- [ ] Empty, error and loading states look right (SPEC §3.3)
- [ ] **F-14 done:** every retailer checked, with source and date; unverifiable ones held back (BUILD F-14); count recorded here: 100 live, 87 held back in `data/retailers-unverified.csv`, 4 removed (Golden Corral, Red Robin, Francesca's, Joann); checked 2026-11-23, PRs #31–#41. Most held-back rows state a reward but not its dates (app check: #21)
- [x] Signed-out Discover matches FR-2 (every non-retired retailer since decisions/0017, sign-up prompt at the end, removed retailers unreachable) *(2026-11-26: www.thebirthdayrun.com `/discover` signed out lists 100 retailers, the same 100 IDs as `data/retailers.csv`; the prompt shows; `/discover/` golden-corral, red-robin, francescas and joann return 404)*
- [ ] Owner and both sisters granted premium on production (metric 4)

## v1: Security and privacy
- [ ] `/pre-push-review` passed on the release; CI green
- [x] RLS tests pass, including every app table (metric 5; DESIGN §3) *(2026-11-27: `npm run test:rls` on `main` locally, 274 passed and 4 skipped (`stripe-sync.test.ts`, which needs a Stripe test key; payments are off); CI `integration` on `d30bf76` gave the same counts. `catalog.test.ts` checks that every app table has RLS on and sits in one registry list, and each user-data table has its own other-user and signed-out test file)*
- [x] Metric 2's free-account tests pass (no premium data or action reachable) *(2026-11-27: CI run 45922250398 on `d30bf76`, the last code commit on `main`, passed. `premium-refusal.test.ts` finds every action that calls `requirePremium()` and gets BR-2 from each one as a free user. The Playwright specs (62 passed) show free accounts no map or route links, no state or length filter, no Smart Grouping, no Duplicate and no reminder switch, and they hit the FR-24/FR-25 limits)*
- [ ] Threat items marked "before launch" done (DESIGN §4.2)
- [x] Privacy policy and terms filled in and linked in the footer, including the app's additions: OpenFreeMap and Google Maps links, Stripe as processor, store-data licences (DESIGN §4.3, §4.4)
- [x] Privacy policy lists the Template's service providers and says deleted data can stay in backups up to the backup retention (Template list)
- [x] Supabase auth audit log after deletion decided and stated (Template decisions/0017): decisions/0024
- [x] Lost-authenticator rule in the support notes (Template list): README "Operations"
- [x] `GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY` not on Vercel; only `main` deploys (`vercel.json` `git.deploymentEnabled`; CI builds and tests every PR instead), and previews stay behind Vercel Authentication if ever turned on
- [x] `Permissions-Policy` sends `geolocation=(self)` and nothing broader (decisions/0002) *(2026-11-26: checked on www.thebirthdayrun.com `/`, `/sign-in`, `/rewards`, `/plan`: `camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()`)*

## v1: Operations
- [x] Sentry receives a test error and the alert email arrives *(2026-11-26: browser error THEBIRTHDAYRUN-5, alert email arrived)*
- [ ] Daily encrypted backup on; first backup restored into a fresh project and the date recorded (DESIGN §5.4) *(2026-11-26: partial, see README "Last tested restore")*
- [x] Rollback tried once on a preview deploy (DESIGN §5.5) *(2026-11-26: done on Production, since preview deploys are off: Instant Rollback to the PR #86 build, www stayed 200 and served the older build; then promoted the current build back, and the build matched the one live before)*
- [ ] Production env vars set (BUILD §0.6), no test keys; `PAYMENTS_ENABLED` off
- [x] `supabase config push` with the `[remotes.production]` block filled in; SMTP still set afterwards
- [ ] Not paused, and the keep-alive in DESIGN §5.2 is running
- [x] Retailer import Action ran on `main` and the counts match the CSV (D2) *(2026-11-26: last run 2026-11-24, manual dispatch with `--allow-retire=86` after the push runs for PRs #40 and #41 stopped at the 5-retire limit (A-22) and wrote nothing: inserted 0 / updated 85 / unchanged 15 / retired 86, so 100 active, matching the 100 rows of `data/retailers.csv`; the CSV hasn't changed since, and signed-out `/discover` lists the same 100 IDs)*

## v1: Domain, email, SEO
- [x] thebirthdayrun.com on this repo's Vercel project, with HTTPS *(2026-11-26: www primary, bare domain 308 → www; decision 0025)*
- [ ] This app's own sending domain verified in Resend; `EMAIL_FROM` uses it; sign-up and reset emails arrive
- [x] Turnstile widget, Google OAuth client and Supabase redirect URLs list thebirthdayrun.com
- [x] Google Branding home page and privacy policy links point to thebirthdayrun.com, and thebirthdayrun.com is an authorized domain (they use the *.vercel.app address until launch)
- [ ] Title, description and share image look right when the link is pasted into a chat

## v1: Support
- [ ] Support email set in the config and working
- [x] Reports (FR-48) reach GitHub as issues (F-13, if built by then; otherwise the support email) *(2026-11-26: a test report (16 Handles, expired) filed on www.thebirthdayrun.com; `forward-reports.yml` on `main` gave "1 retailers, 1 reports acked" and opened issue #98 from the fixed template, labelled `reward-report`, with no user data; closed as a test)*

## v2 sign-off (after phase 7)
- [ ] Metrics 1–5 pass (SPEC §2.1; collected per DESIGN §5.7)
- [ ] Store coverage report saved in RESEARCH.md (metric 6)
- [ ] Map works with tiles blocked (NFR-7); OpenStreetMap credit shows
- [ ] Vercel Production has `CRON_SECRET` and `REMINDER_UNSUBSCRIBE_SECRET` (Sensitive; `openssl rand -hex 32` each), and Vercel → Cron Jobs lists `/api/cron/reminders` (decision 0015: without them no reminder is sent)
- [x] Reward reports (F-13, D16): the same new `REPORTS_EXPORT_SECRET` in Vercel Production (Sensitive) and in GitHub → Settings → Secrets → Actions; repo **variable** `SITE_URL` = `https://www.thebirthdayrun.com` (done 2026-11-24)
- [x] Once the app replaces the "Back soon" page: `gh workflow enable forward-reports.yml` (disabled 2026-11-24, since every path served the placeholder and the daily run would fail), then, after the reminder cron's first run (14:00 UTC; until then the D16 heartbeat fails the run on purpose), `gh workflow run forward-reports.yml --ref main` and check it succeeds ("0 retailers" with no reports yet) *(2026-11-26: enabled; manual run succeeded, "0 retailers, 0 reports acked")*
- [ ] The Hermes checker holds a GitHub credential for this repo only and no database, Supabase, Vercel or Stripe key; record its first three runs (BUILD F-13 checker contract, NFR-11)
- [ ] Reminder emails: a doubled run sends once; one-click turn-off works from Gmail's button; send budget respected (D15)
- [ ] In Gmail's "Show original" of a real reminder, Resend's DKIM signature covers `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058; BUILD F-12 "Unverified")
- [x] **Reminder emails and CAN-SPAM:** decide the postal-address question (DESIGN §4.4) before any reminder reaches someone outside the family: decisions/0024
- [ ] Report heartbeat check fails loudly when the reminder cron is stopped (D16)
- [x] **Sign-in links ask "Is this you?" first** (decision 0022, T22): opening a sign-in or confirm link shows the masked email of the account it signs into, and nothing signs in until the visitor confirms *(2026-11-26: built in PR #100 (decision 0026, S-113, T-118); on www.thebirthdayrun.com the owner's magic link showed her masked email and "Yes, that's me" signed her in)*
- [ ] The checker's GitHub token has only the scopes in D16, and expires within a year

## Before turning payments on (owner's decision; DESIGN §5.6)
- [ ] Vercel Pro (Hobby is non-commercial)
- [ ] A physical postal address for commercial email (DESIGN §4.4)
- [ ] Stripe test mode (F-8): a sandbox with the Premium Product and monthly Price, the customer portal set to cancel at period end with no plan switching, "if all retries fail: cancel the subscription", and a webhook endpoint for BUILD F-8's eight events; a second sandbox's secret key saved as the GitHub secret `STRIPE_TEST_SECRET_KEY`, and CI's integration job shows metric 3 passing (not SKIPPED)
- [ ] Live Stripe keys, webhook endpoint, price set; a real-card test and refund
- [ ] Privacy policy and terms updated for paid plans

## After each launch (first week)
- [ ] Check Sentry and the cron/Action runs daily
- [ ] Count the metrics on the "Decide" date in ROADMAP
