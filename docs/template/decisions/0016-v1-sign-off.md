# 0016. v1 sign-off (throwaway app runs, 2026-09-29 and 2026-09-30)

Date: 2026-09-29, updated 2026-09-30 · Status: accepted (v1 signed off 2026-09-30; two items accepted with notes, below)

## Context
LAUNCH-CHECKLIST's run on a throwaway app, `template-signoff` (Vercel `template-flame-six.vercel.app`, Supabase project A, and project B for the restore), driven by a stage-by-stage setup wizard outside the repo. Raw results: `~/Projects/signoff-results.md` (no secrets).

## Results
| Check | Result |
| --- | --- |
| Metric 1, new app in under an hour | **Not measured.** The run took hours of wizard fixes, so it can't count as the stopwatch run. Needs a clean run on a new throwaway app. |
| Metric 2, full e2e | CI green on every push to `main`. **Deployed run accepted by the Builder, not an automated pass:** sign-up → email → set password → dashboard → name checked by hand on the live site. The last automated run passed Turnstile (test keys, decision 0015) and sign-up, then stopped on an empty pasted-link file (fixed in `tests/e2e/support.ts`). Earlier runs were blocked by Turnstile's bot check and then the sign-up rate limit (3 per email per hour, working as designed). |
| Metric 3, RLS on every table | RLS suite and registry test green in CI (`npm run test:rls`). |
| Metric 4, security scans | securityheaders.com **A+** (29 Sep 2026 19:27 UTC, all six headers; screenshots kept by the Builder). `npm audit --audit-level=high` and gitleaks green in CI. `x-powered-by` removed afterwards (`poweredByHeader: false`). |
| NFR-26 Google linking | PASS: a password set through a direct `/signup` stopped working after the owner signed in with Google (`invalid_credentials`). |
| Google sign-in (FR-5, M-9) | New account, existing account and cancel: PASS, once the OAuth client's redirect URI was corrected. |
| Restore (FR-35, NFR-18) | PASS: an encrypted backup loaded into project B, row counts match (auth.users 2, auth.identities 2, auth.mfa_factors 1, public.profiles 2). First try failed on a Supabase-managed grant in `roles.sql`, now filtered (`scripts/backup.sh`, README). Signing in on project B was **not** tried. |
| Rollback (FR-36) | PASS: Instant Rollback and undo on Vercel. |
| Orca (NFR-23) | PASS: sign up, sign in and delete by keyboard with speech (after restarting a stuck speech-dispatcher on the machine). |
| `supabase config push` (D7) | Run with the remote block filled; confirmation emails kept arriving through Resend SMTP afterwards. |
| Secrets not on Vercel (D24.28) | Only the 10 app variables were imported; the config-push-only secrets were not. |

## Not checked in the first run
Deployed CSP console and cookie flags (the automated run didn't get that far), the Sentry scrubbing event and alert email, Vercel Web Analytics, enumeration checks, the bundle-scan deliberate failure, Dependabot preview skips, and the Fedora-from-scratch README check.

## Second run (2026-09-30)
A new throwaway app, `template-signoff-2` (`template-signoff-2.vercel.app`, one Supabase project), made from the README alone for metric 1, then checked by hand in the browser. Raw results: `~/Projects/signoff-2-results.md` (no secrets).

| Check | Result |
| --- | --- |
| Metric 1, new app in under an hour | **PASS with a caveat: 54 min** (2026-09-29 17:41:32 → 18:36:30), README steps 1–8, deployed. Sign-up on the live site then failed ("Something went wrong"; `rate_limit_hit failed` in the Vercel logs): Vercel's `NEXT_PUBLIC_SUPABASE_URL` was the local `http://127.0.0.1:54321`, copied from the env file, so the server called a database on the Builder's computer. Fixed the next morning (the real `https://<ref>.supabase.co`, redeploy without the build cache); sign-up and sign-in then worked. A README gap, fixed (below). |
| FR-45, the README was the only guide | **Not met.** Finding the URL bug took Claude's help. The run's README gaps, all fixed in the README's "Start a new app": no `npm ci`; no `supabase login`; step 1 didn't say how to name and clone the repo; which env lines stay empty; step 6 needed the Vercel address before step 8 made it; which variables go on Vercel, and that production values must not be local; commits need the Claude review (hooks); unit tests hardcoded the placeholder name and emails, so every app failed CI after step 4 (tests now read `appConfig`, checked with a rebranded config: 400 unit tests pass, the placeholder check skips; RLS 54/54). |
| Enumeration (NFR-12) | PASS: sign-up, sign-in with a wrong password, magic link and reset give the same message for an existing and an unknown address. |
| CSP in the console (D5) | PASS: no violations signed in on `/dashboard` and `/settings` (Firefox and Chrome). Only Firefox's notes that `'self'` and the Turnstile host are ignored under `'strict-dynamic'` (they're the CSP2 fallback), and Sentry's `beforeSendTransaction` warning (decision 0018). |
| Session cookies (NFR-14, §0.7) | PASS: `sb-<ref>-auth-token.0/.1` and the PKCE verifier cookies are HttpOnly, Secure, SameSite=Lax, path `/`. No Supabase client runs in the browser, so no tokens are in browser storage (rule 17); storage wasn't inspected. |
| Sentry server event (NFR-17) | PASS: a throwaway route threw an error quoting an email, a JWT and the request body, called with a fake `sb-` cookie. The event showed `[email]`, `[jwt]`, the body's token as `[redacted]`, the request as the method only, no user. |
| Sentry browser event and alert (FR-31) | PASS: a thrown console error arrived as `browser sign-off test [email]`; Sentry notified the project on the new issue, and the alert email arrived for the server event. |
| Vercel Web Analytics (FR-32) | PASS: 3 visitors, 10 page views, after enabling it in the dashboard and redeploying (the package was already in the layout). |
| Dependabot previews skipped (D24.17, week-1 check 13) | PASS: a commit on `dependabot/signoff-check` got Vercel's status "Canceled by Ignored Build Step" (commit `b10c331`). The branch must carry its own commit: pushing `main`'s commit to it made no deployment at all. |
| Bundle scan (NFR-4) | PASS: `npm run check:bundle` exits 0 on a clean build and 1 with a planted `sb_secret_…` in `.next/static`, naming the file. |
| `/favicon.ico` "x-nonce missing" | Fixed: decision 0018. |

**Accepted with notes (the Builder, 2026-09-30):**
- Sign-in on the restored project (BUILD F-12 step 5) wasn't tried. The restore loaded every auth table with matching row counts (first run). The gift registry repeats the restore test for real before launch.
- The Fedora-from-scratch README check (FR-44) needs a fresh machine; deferred. The local setup steps were used on this machine throughout the build.

## Consequences
v1 is signed off: all four success metrics are met (metric 1 with the caveat above) and the gift registry starts 2026-10-01 (ROADMAP "Decide at v1 sign-off"). The two accepted items stay open in LAUNCH-CHECKLIST with this note. Lessons for the next run of this kind: a testing-only Gmail as the Resend account email, Turnstile test keys from the start, and production values checked for `127.0.0.1`/`localhost` before the first deploy.
