# Template: Product Requirements (PRD)

Last updated: 2026-09-26 · Status: approved (FR-1/FR-2 amended 2026-09-26 after RFC review) · Based on: 01-Project-Brief.md

## Summary
The Template is a reusable, secure Next.js + Supabase starter that each of the Builder's future web apps is created from with GitHub's "Use this template". It gives every app the foundations, done once and tested: accounts, account settings, security, an app shell, one config file for branding, emails, monitoring and analytics, backups and rollback, CI, and docs. It has three kinds of user: the **Builder** (the developer creating a new app), a **signed-out visitor** of an app made from it, and a **signed-in user** of that app. Version 1 is done when a throwaway test app goes from "Use this template" to a deployed app with working sign-in in under an hour, and the e2e, RLS and security checks below all pass. Target date: Mon 2026-11-16.

## Goals and success metrics
All four are required for "v1 done" (brief).

| Goal | Metric | Target | By | How we measure it |
| --- | --- | --- | --- | --- |
| New app in under 1 hour | Time from clicking "Use this template" to a deployed throwaway app on a free `*.vercel.app` URL where sign-in works, following only the README. The clock starts with the service accounts and this app's keys already made (Supabase project, Google OAuth client, Turnstile widget, Sentry project, Resend key) | < 60 min, one real run-through | 2026-11-16 | Manual stopwatch run by the Builder. Start and end times and any README deviations are written in a `docs/decisions/` entry. The test app and its Supabase project are deleted afterwards. |
| Full e2e passes in CI | Playwright journey sign up → verify → sign in → reset password → delete account | Passes on every push; passes once against the deployed throwaway app | 2026-11-16 | GitHub Actions run history: the e2e job is green on every push to `main` in the last week before sign-off. The deployed run's Playwright report is kept as a CI artifact or saved locally and linked in the sign-off note. |
| RLS tests on every table | Share of tables with user data that have an RLS test covering another user (read, change, delete) and a signed-out visitor (read, change, delete) | 100% | 2026-11-16 | CI test that lists every table in the app's schema holding user data (from the database catalog) and fails if any is missing from the RLS test suite; the RLS suite itself passes in CI. |
| Security scan clean | `npm audit` high/critical count; gitleaks findings; securityheaders.com grade | 0 high/critical; 0 gitleaks findings; grade A or better | 2026-11-16 | `npm audit --audit-level=high` and gitleaks exit codes in CI; securityheaders.com scan of the deployed throwaway app, screenshot or result link saved in the sign-off note. |

## Users and key journeys
| User | Journey (short) |
| --- | --- |
| Builder | Create a new repo with "Use this template", clone it, switch on the git hooks |
| Builder | Rename and rebrand the app by editing only the config file |
| Builder | Fill in env vars from `.env.example` locally and on Vercel |
| Builder | Run the app, local Supabase and all tests on Fedora 44 with Docker or Podman |
| Builder | Deploy a throwaway test app to `*.vercel.app`, run e2e against it, then delete it |
| Builder | Take a database backup and restore it into a fresh project; roll back a bad deploy |
| Builder | Add an app feature safely by following the CLAUDE.md checklist and review skills |
| Signed-out visitor | Read the landing, privacy and terms pages; sign up or sign in (password, magic link, Google); reset a forgotten password |
| Signed-in user | Open the dashboard placeholder; change name and password; turn two-step sign-in (MFA) on or off; download their data; delete their account; sign out |

## Functional requirements

### Accounts
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-1 | A visitor can sign up with email and password, **verifying the email before choosing a password**. | Given a valid email and a valid Turnstile token, when they submit, then a verification email is sent and the page shows the same message whether or not the email already had an account; no password exists on the account yet. After verifying (FR-2), the user must choose a password meeting the password rule before reaching the dashboard. Without a valid Turnstile token the request is rejected. *(Changed 2026-09-26, RFC D10: closes pre-account takeover.)* | must |
| FR-2 | A new user verifies their email by link. | Given an unverified account, when the user opens the verification link, then the email is marked verified and they land signed in on the set-password step (FR-1), then the dashboard. An expired or used link shows a plain message and a way to request a new one. Until verified, protected pages are not reachable. | must |
| FR-3 | A user can sign in with email and password. | Given a verified account and a valid Turnstile token, when correct credentials are entered, then they reach the dashboard (or a checked same-site `next` path). Wrong email or wrong password gives one identical generic message. | must |
| FR-4 | A user can sign in with an email magic link. | When a user requests a link (with a valid Turnstile token), the page shows the same "if that email exists, we sent a link" message for any email. For an email with no account, nothing is sent and no account is created (sign-up happens only on the sign-up page). The link signs them in once; an expired or reused link shows a plain message. | must |
| FR-5 | A user can sign up and sign in with Google. | When a user completes Google consent, then they are signed in and land on the dashboard; cancelling returns them to the sign-in page with a plain message. | must |
| FR-6 | A signed-in user can sign out. | After sign-out, session cookies are cleared, and opening a protected page redirects to sign-in. | must |
| FR-7 | A user can request a password reset. | Submitting any email (with a valid Turnstile token) shows the same generic message; if the account exists, a reset email is sent. | must |
| FR-8 | A user can set a new password from the reset link. | Given a valid reset link, when a new password meeting the password rule is submitted, then the password changes and the old one no longer works. The link works once; expired or reused links show a plain message. | must |
| FR-9 | Protected pages are for signed-in users only. | A signed-out request to any protected page redirects to sign-in with a same-site `next` path, and after sign-in returns there. The page itself also checks the user on the server (NFR-3). | must |
| FR-10 | Sessions refresh automatically. | Given an active signed-in user, when their access token expires, then their next request still works without re-entering credentials. | must |
| FR-11 | Every new user gets exactly one `profiles` row. | For each sign-up method (password, magic link, Google), after the account is created exactly one `profiles` row exists for that user, holding only what's needed (assumption: display name and timestamps). | must |

### Account settings
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-12 | A user can change their display name. | After saving a valid name, the settings page and dashboard show it; invalid input (empty, too long) shows a plain field error. | must |
| FR-13 | A user can change their email. | The change takes effect only after **both** the old and the new address confirm by link; until then, sign-in still uses the old email. Needs a recent sign-in (FR-56). | later (deferred 2026-09-26; build only if time allows after v1) |
| FR-14 | A user can change their password. | Needs a recent sign-in (FR-56). After a successful change, the new password works and the old one doesn't. | must |
| FR-15 | A user can download their data. | The download contains the user's account details (email, sign-up date, sign-in providers) and every row they own in every table holding user data, in a machine-readable file (assumption: JSON). It contains no other user's data and no secrets or tokens. | must |
| FR-16 | A user can delete their account. | After a recent sign-in (FR-56) and typing their email to confirm, the auth user and every row they own are deleted, they are signed out, and they can no longer sign in. Other users' rows are unchanged. | must |

### App shell
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-17 | Public pages: landing, privacy, terms. | Reachable signed out; privacy and terms are linked from the footer on every page and are visibly marked as placeholder text to fill in per app. The footer also has a `mailto:` link to the support email from the config file. The privacy placeholder mentions that backups keep data for a limited time after account deletion. | must |
| FR-18 | Auth pages: sign in, sign up, forgot password, reset password, auth error. | Each page works signed out; a signed-in user opening sign-in or sign-up is sent to the dashboard. | must |
| FR-19 | Signed-in pages: dashboard placeholder and settings. | Both are protected (FR-9); the dashboard shows only generic placeholder content. | must |
| FR-20 | Mobile-first layout. | Every page is usable at a phone width (assumption: 360 px) with no horizontal scrolling, and at desktop width. | must |
| FR-21 | Dark mode. | Pages follow the device's light/dark setting; both themes are readable on every page. A manual toggle is optional. | must (toggle: could) |
| FR-22 | Loading states and toasts. | Every form shows a pending state and can't be submitted twice while pending; each action's success or failure is shown as a toast or inline message. | must |
| FR-23 | 404 and error pages. | An unknown URL shows a 404 page; an unexpected error shows an error page. Both give a plain message and a link home, with no stack trace or internal IDs. | must |
| FR-24 | SEO basics. | Each public page has a title and description; an Open Graph image exists; `sitemap.xml` lists public pages only; `robots.txt` exists and does not expose protected paths as crawl targets. | must |
| FR-25 | Installable web app. | A web app manifest and icons exist, using the name and colors from the config file; a supported phone browser offers "Add to home screen / Install". | must |

### Config file
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-26 | One config file holds app name, description, URL, brand colors, support email and logo. The site URL is read from an env var so preview and production deploys each get the right one. | Changing a value in the config file changes it everywhere it's shown: pages, metadata, OG image, manifest, emails, legal pages. A search of the codebase finds no hard-coded copy of these values outside the config file. | must |
| FR-27 | Domain-specific values are placeholders. | Site URL and email sending domain/from-address ship as clearly marked placeholders, and the "start a new app" checklist tells the Builder where to fill each one in. | must |

### Emails
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-28 | Four email templates: welcome, verify email, magic link, password reset. (A fifth, confirm email change, comes with FR-13 later.) | Each shows the app name, logo, brand colors and support email from the config file, and renders readably in common email clients (manual check in at least one webmail and one phone mail app). | must |
| FR-29 | Supabase auth emails are sent through Resend. | With Resend set as Supabase's SMTP, verify, magic-link and reset emails arrive using the branded templates. Locally, they arrive in Supabase's local mail catcher. | must |
| FR-30 | New users get a welcome email. | Exactly one welcome email per new account, sent at the first sign-in with a verified email (for Google sign-ups, the first sign-in). | must |

### Monitoring and analytics
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-31 | Errors are reported to Sentry. | A deliberately thrown test error on the server and in the browser each appears in Sentry, and an alert email reaches the Builder. Scrubbing: NFR-17. | must |
| FR-32 | Vercel Web Analytics is on. | Page views from the deployed throwaway app show up in the Vercel Web Analytics dashboard. No other analytics tool is included. | must |

### Backups and rollback
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-33 | A backup script dumps the database. | Running the documented command produces a backup file containing everything needed to restore users' accounts (including the auth schema) and their data. | must |
| FR-34 | Backups can run on a schedule and are kept off Supabase, for a limited time. | Docs explain how to schedule the backup and where copies go; one scheduled run has produced a backup outside Supabase; backups older than the retention period are deleted automatically. (Storage location, encryption and retention days: RFC.) | must |
| FR-35 | Restore steps are written and tested. | Following the docs, a backup is restored into a fresh Supabase project; row counts match the source and a test user can sign in. The date of the last tested restore is recorded in the docs. | must |
| FR-36 | Bad deploys can be rolled back on Vercel. | Docs describe the rollback; it has been done once on the throwaway test app, and the rolled-back app works against the current (forward-migrated) database. | must |

### Quality and CI
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-37 | Strict TypeScript, ESLint and Prettier. | Typecheck, lint and format-check commands exist and pass with zero errors on `main`. | must |
| FR-38 | Unit tests with Vitest. | Validation schemas, the redirect check, config loading and other pure logic have unit tests that pass. | must |
| FR-39 | E2E tests with Playwright for the full account journey. | Sign up → verify → sign in → reset password → delete account passes locally, in CI and once against the deployed throwaway app. | must |
| FR-40 | GitHub Actions on every push. | Every push runs lint, typecheck, unit tests, RLS tests, e2e, build, secret scan (gitleaks), the `.env.example` check and `npm audit`; any failure fails the run. | must |
| FR-41 | Dependabot is on. | Dependabot opens update PRs for npm packages and GitHub Actions. | must |
| FR-42 | Existing hooks and review skills keep working. | `.githooks/pre-commit`, `.githooks/pre-push`, `scripts/check-env-example.sh` and the `pre-commit-review` / `pre-push-review` skills still block unreviewed or unsafe changes after the app code is added (checked with one deliberately bad staged change). | must |
| FR-43 | Database types are generated from the schema. | A documented command regenerates the TypeScript types after a migration, and the app typechecks against them. | must |

### Docs
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-44 | README: Fedora local setup. | A fresh Fedora 44 machine reaches a running app, local Supabase and passing tests by following only the README, with Docker or Podman. | must |
| FR-45 | README: "start a new app" checklist. | The checklist alone is enough to complete metric 1 (new app in under 1 hour). | must |
| FR-46 | README: every env var explained. | Every variable in `.env.example` has a README entry: purpose, where to get it, public or secret. A check or review confirms no variable is missing. | must |
| FR-47 | CLAUDE.md: project structure and commands filled in. | The two placeholder sections list real paths and working commands. | must |
| FR-48 | Generic launch checklist. | `docs/LAUNCH_CHECKLIST.md` (the generic list each app copies and tailors; separate from the Template's own sign-off list in `docs/08-Launch-Checklist.md`) covers every operational item in this PRD (backups, rollback, Sentry, env vars, legal pages, sending domain). | must |
| FR-49 | Decision log. | `docs/decisions/` exists with a short "how to add an entry" note; decisions made during the build are recorded there. | must |

### Builder journeys
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-50 | Create a new app from the Template. | A repo created with "Use this template" contains no Template-only leftovers besides the config file values, and the README tells the Builder to switch on the hooks. | must |
| FR-51 | Rename and rebrand via the config file only. | Changing the config file (plus env vars) is the only edit needed for the new app's name, colors, logo and support email to show everywhere (FR-26). | must |
| FR-52 | Set env vars safely. | `.env.example` lists every variable with placeholders only. If a required variable is missing or malformed, the app fails at start or build with a message naming the variable (never its value). | must |
| FR-53 | Run locally on Fedora. | Documented commands start and stop local Supabase, apply migrations, start the dev server, and run each test suite (FR-44). | must |
| FR-54 | Deploy a throwaway test app. | Following the README, a test app deploys to a free `*.vercel.app` URL with working sign-in (password, magic link, Google), passes e2e once, and is then deleted with its Supabase project. | must |
| FR-55 | Restore a backup. | Covered by FR-35, performed by the Builder from the docs alone. | must |

### Added after PRD review (2026-09-26)
| ID | Requirement | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-56 | Sensitive account changes need a recent sign-in. | Changing password, deleting the account (and changing email, once FR-13 is built) are refused unless the user signed in (or re-confirmed) recently; the user is asked to re-confirm and then continues. Users without a password (Google-only) re-confirm by signing in again. Time window and mechanism: RFC. | must |
| FR-57 | A user can turn on two-step sign-in (MFA) with an authenticator app. | In settings, the user scans a QR code, enters a code to confirm, and MFA is on. Uses Supabase's built-in TOTP MFA (no SMS). | must |
| FR-58 | Users with MFA on must enter a code to finish signing in. | After the first factor (password, magic link or Google), a user with MFA on sees a code step; until a valid code is entered, protected pages and every server action/route handler refuse them (checked on the server, not only in the UI). A wrong code shows a plain message and is rate limited. | must |
| FR-59 | A user can turn MFA off. | From settings, after entering a current code (FR-56 also applies), MFA is removed and sign-in no longer asks for a code. Losing the authenticator: the user can remove it only through the documented support path (Builder deletes the factor), since recovery codes are not in v1 (assumption: RFC confirms what Supabase offers). | must |

## Non-functional requirements
Security rules refer to `CLAUDE.md` rules 1–23; the rule text is not repeated here.

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-1 | RLS enabled with deny-by-default policies on every table, in the same migration that creates it (rule 1). | CI query of the database catalog finds 0 tables in app schemas with RLS off. A signed-in user querying a table with no matching policy gets 0 rows. |
| NFR-2 | RLS tests for every table with user data (rule 2). | Metric 3: CI coverage test at 100% and RLS suite green. |
| NFR-3 | Server-side verified auth check in every server action, route handler and protected page; each validates its own input (rules 3, 4). | A test calls every server action and route handler signed out and gets a refusal, never data. Review checklist confirms no `getSession()`-only checks. |
| NFR-4 | Secrets stay server-only; the service-role client is used only where unavoidable, never with unchecked user IDs (rules 5, 6). | The build fails when a client component imports a server-only module (checked once with a deliberate bad import). A CI scan of the built browser bundle finds no service-role key. |
| NFR-5 | Env files stay out of git; `.env.example` has placeholders only (rules 7, 8). | `scripts/check-env-example.sh` passes in the pre-commit hook and CI; `git ls-files` shows no `.env*` file except `.env.example`. |
| NFR-6 | Every server input is validated with Zod (rule 9). | Each server action, route handler, route param and search param has a schema; unit tests show invalid input is rejected with a plain message. |
| NFR-7 | No unsanitized user HTML (rule 10). | A search finds no `dangerouslySetInnerHTML` on user content; review checklist item. |
| NFR-8 | Only same-site redirect targets (rule 11). | Unit tests: absolute URLs, `//host`, `/\host`, `javascript:` and encoded variants all fall back to a safe default path. |
| NFR-9 | Plain error messages to users (rule 12). | A forced server error returns a generic message and no stack trace, SQL text or internal ID; details appear in server logs / Sentry. |
| NFR-10 | Rate limits on sign-in, sign-up, password reset, magic link and public forms (rule 13). | A test exceeding the limit on each gets a plain "try again later" response and no further emails are sent. Limit values: RFC. |
| NFR-11 | Turnstile on every auth form (sign-up, sign-in, magic link, password reset) and on any public form an app adds (rule 14). | A server call to each of those without a valid Turnstile token is rejected (test). |
| NFR-12 | No account enumeration (rule 15). | Tests show identical status and message for existing and non-existing emails on sign-in failure, sign-up, magic link and password reset. |
| NFR-13 | Security headers with nonce-based CSP (rule 16). | securityheaders.com grade A or better on the deployed throwaway app (metric 4). An automated test checks every route returns CSP (no `unsafe-inline` for scripts), HSTS, frame-ancestors, Referrer-Policy and Permissions-Policy. The browser console shows no CSP violations on the e2e journey. |
| NFR-14 | Session cookies HttpOnly, Secure, SameSite; no tokens in browser storage (rule 17). | E2E checks cookie flags on the deployed app and that `localStorage`/`sessionStorage` hold no auth tokens after sign-in. |
| NFR-15 | Uploads rule carried forward (rule 18). | The Template ships no bucket; the rule stays in CLAUDE.md for apps. |
| NFR-16 | Data minimisation; export and deletion cover every user-data table (rule 19). | Tests for FR-15 and FR-16 fail if a table holding user data is missing from the export or not emptied for the deleted user. |
| NFR-17 | Sentry events are scrubbed of personal data and secrets (rule 20). | A test error raised during a request carrying an email, token, cookie and request body produces a Sentry event containing none of them (checked in the Sentry UI). |
| NFR-18 | Backups are kept working and restores tested (rule 21). | FR-35 done, with the last tested restore date recorded. |
| NFR-19 | Migrations only move forward; app rollback never needs a database rollback (rule 22). | The pre-commit review flags any edit to a committed migration; FR-36 rollback test passes against the forward-migrated database. |
| NFR-20 | Few, well-maintained dependencies; scans clean (rule 23). | `npm audit` 0 high/critical, gitleaks 0 findings, Dependabot on (metric 4); each added package has a stated reason in its commit or PR. |
| NFR-21 | Free tiers only. | Every service in the README stack table is on its free plan; nothing is added that needs a paid plan without the Builder's OK. |
| NFR-22 | Stay within free-tier quotas during testing. | The number of real emails a deployed e2e run sends is documented and fits Resend Free's 100/day with room for manual testing. CI e2e sends no real emails (local mail catcher). |
| NFR-23 | Accessible forms and pages, target WCAG 2.2 AA. | An automated accessibility check reports 0 serious/critical issues on every shell page; the sign-up and sign-in flows work with keyboard only; every form field has a label and errors are announced. |
| NFR-24 | Generic: nothing app-specific. | A search finds no app-specific wording, tables or pages (e.g. "gift", "registry"), except the README's "Apps built from this template" table; the pre-commit review checks this. |
| NFR-25 | Local development works on Fedora 44 with Docker or Podman. | FR-44 run-through succeeds; Podman-specific steps (if needed) are documented. |
| NFR-26 | No account pre-takeover through linking. | A Google sign-in is linked to an existing email/password account only if that email is verified; a test with an unverified password account and a Google sign-in on the same email shows the attacker's password can't be used to get in. Mechanism: RFC (check Supabase's identity-linking behaviour). |

## Out of scope (version 1)
From the brief:
- Payments, teams/organizations, multiple languages, admin panel.
- Analytics beyond Vercel's free Web Analytics.
- A permanent deployment or custom domain for the Template itself.
- Any app-specific tables, pages, wording or features (including anything gift-registry-specific).
- Native mobile apps.
- File uploads (the Template ships no bucket; rule 18 covers apps).

Added in PRD review (2026-09-26):
- Changing email in settings (FR-13): deferred to "later, if time allows". Until then a user asks support (the `mailto:` link) and the Builder changes it in Supabase.
- Sign-in providers other than Google; SMS/phone MFA (paid); MFA recovery codes.
- A "signed-in devices" list or "sign out everywhere".
- Contact/feedback form or any other public form: the footer has a `mailto:` support link instead. The public-form rules apply once an app adds one.
- Email preferences or unsubscribe management (the Template sends only transactional emails).
- Performance budgets or load targets.
- Enforced branch protection on `main`: GitHub Free can't enforce it on private repos (needs Pro). The branch/PR workflow stays a convention backed by CI and the local hooks.

## Assumptions and dependencies
- The Builder already has the GitHub, Supabase, Resend, Cloudflare, Google Cloud, Sentry and Vercel accounts, and this app's keys, before metric 1 is timed (decided 2026-09-26).
- Without a domain, the throwaway app uses Resend's test sender, which (assumption, RFC verifies) only delivers to the Resend account owner's address.
- Supabase Free pauses inactive projects and has no automatic backups; Resend Free allows 100 emails/day (from the brief).
- Vercel Hobby is non-commercial only; fine for the Template and throwaway app.
- The Supabase CLI may need the Podman socket and `DOCKER_HOST`, or Docker, on Fedora (brief risk).
- Password rule, rate-limit values, backup schedule and retention, and export file format are set in the RFC; this PRD only requires that they exist.
- Profile holds only display name and timestamps (assumption, per rule 19).
- Supabase TOTP MFA is free on all plans (assumption; RFC verifies against Supabase's pricing page).

## Questions for the PM
All 16 writer questions were resolved on 2026-09-26: public form → none, `mailto:` link (FR-17); Turnstile → all auth forms (NFR-11); welcome timing (FR-30); email change → 5th template, both addresses confirm (FR-13, FR-28), then FR-13 deferred to later by the user; re-authentication (FR-56); site URL from env (FR-26); backup retention and auth schema (FR-17, FR-33, FR-34); metric 1 → pre-made keys; WCAG 2.2 AA (NFR-23); no performance target; MFA → in, using Supabase TOTP (FR-57–59); account linking (NFR-26); magic link creates no account (FR-4); README date fix (PM, with the README update); branch protection → convention only (out of scope).

## Traceability
Added by the PM in the consistency review (2026-09-26). UX = screen IDs in `04-UX-Spec.md` (S-, C-, E-, M-); System Design = sections of `05-System-Design.md` (Flow n = data flow n, Tn = threat); Detailed Design = section numbers of `06-Detailed-Design.md`; API = operations in `07-API-Spec.md`. "n/a" means the requirement has no part in that doc (e.g. tooling has no screen); every requirement is covered by at least the Detailed Design and its test plan (§9).

| ID | UX | System Design | Detailed Design | API |
| --- | --- | --- | --- | --- |
| FR-1 | S-5, S-9, E-1 | Flow 1–2; Security/ops; T2 | 2.2, 4.1, 4.3 | signUp, setInitialPassword, handle_new_user, mark_password_set |
| FR-2 | S-9, S-8, E-1 | Flow 2 | 4.1–4.3 | signUp, /auth/confirm, setInitialPassword |
| FR-3 | S-4 | Flow 4 | 4.4 | signIn |
| FR-4 | S-4, S-8, E-2 | Flow 5 | 4.2, 4.5 | requestMagicLink, /auth/confirm |
| FR-5 | S-4, S-5, S-8 | Flow 6 | 4.6 | signInWithGoogle, /auth/callback |
| FR-6 | C-1, S-9, S-10 | Security/ops | 4.8 | signOut |
| FR-7 | S-6, E-3 | Flow 10 | 4.7 | requestPasswordReset |
| FR-8 | S-7, S-8, E-3 | Flow 10 | 4.2, 4.7 | /auth/confirm, updatePasswordFromReset |
| FR-9 | S-4, S-12, S-13 | Components; Flow 14 | 3.1, 3.2 | signIn (next), requireUser |
| FR-10 | — | Components; Flow 14 | 3.1, 3.3 | — (proxy session refresh) |
| FR-11 | — | Data model; Security/tables | 2.2 | handle_new_user, set_updated_at |
| FR-12 | S-14, S-12 | Data model; Security/ops | 4.12 | updateDisplayName |
| FR-13 | deferred | deferred | 4.13 (deferred) | later |
| FR-14 | S-15, S-11 | Flow 11 | 4.12 | changePassword |
| FR-15 | S-17 | Flow 12; Privacy | 3.12, 4.12 | GET /account/export |
| FR-16 | S-18, S-11, S-1 | Flow 13; Privacy | 2.2, 3.12, 4.12 | deleteAccount |
| FR-17 | S-1, S-2, S-3, C-2 | Privacy | 3.14 | n/a (no operation) |
| FR-18 | S-4–S-8 | Components; Flow 14 | 4.11 | n/a (no operation) |
| FR-19 | S-12, S-13 | Components; Flow 14 | 3.2, 4.11 | n/a (no operation) |
| FR-20 | all (Visual style) | n/a (UI) | 4.11 | n/a (no operation) |
| FR-21 | all, C-2 | n/a (UI) | 3.14 | n/a (no operation) |
| FR-22 | C-3 | n/a (UI) | 3.6, 4.11 | n/a (no operation) |
| FR-23 | S-19, S-20 | NFR-9; Failure modes | 4.11 | n/a (no operation) |
| FR-24 | S-1–S-3 | n/a (UI) | 3.14 | robots.ts, sitemap.ts, opengraph-image.tsx |
| FR-25 | Visual style | n/a (UI) | 3.14 | manifest.ts, icon.tsx, apple-icon.tsx |
| FR-26 | C-1, C-2, E-1–E-4 | Data model (appConfig); Environments | 3.11, 3.13, 3.14 | metadata routes, getSiteUrl |
| FR-27 | n/a (no UI) | Data model (appConfig); Environments | 3.4, 3.11 | n/a (no operation) |
| FR-28 | E-1–E-4 | Components; Flow 1, 3 | 3.13 | n/a (no operation) |
| FR-29 | n/a (no UI) | Components; Flow 1, 3; Failure modes | 2.5, 3.13 | n/a (no operation) |
| FR-30 | E-4 | Flow 3 | 2.2, 3.13 | claim_welcome_email, release_welcome_email |
| FR-31 | n/a (no UI) | Components; Ops/Monitoring | 3.15 | /monitoring |
| FR-32 | n/a (no UI) | Components; Privacy | 3.14 | n/a (no operation) |
| FR-33 | n/a (no UI) | Flow 15; Ops/Backups | 3.16 | n/a (no operation) |
| FR-34 | n/a (no UI) | Flow 15; Ops/Backups | 3.16 | n/a (no operation) |
| FR-35 | n/a (no UI) | Flow 16; Ops/Backups | 3.16 | n/a (no operation) |
| FR-36 | n/a (no UI) | Ops/Rollback | 7 | n/a (no operation) |
| FR-37 | n/a (no UI) | n/a (tooling) | 1, 8 | n/a (no operation) |
| FR-38 | n/a (no UI) | n/a (tooling) | 9 | n/a (no operation) |
| FR-39 | n/a (no UI) | Environments (CI); Metrics | 9 | n/a (no operation) |
| FR-40 | n/a (no UI) | Environments (CI); Metrics | 8 | n/a (no operation) |
| FR-41 | n/a (no UI) | T17 | 8 | n/a (no operation) |
| FR-42 | n/a (no UI) | Secrets; T16 | 8 | n/a (no operation) |
| FR-43 | n/a (no UI) | n/a (tooling) | 2.4, 8 | n/a (no operation) |
| FR-44 | n/a (no UI) | Environments (Local) | 1, 9 | n/a (no operation) |
| FR-45 | n/a (no UI) | n/a (README) | 7 | n/a (no operation) |
| FR-46 | n/a (no UI) | Environments (env vars) | 3.4 | n/a (no operation) |
| FR-47 | n/a (no UI) | n/a (CLAUDE.md) | 1 | n/a (no operation) |
| FR-48 | n/a (no UI) | Residual risks; Failure modes | 4.10, 7 | n/a (no operation) |
| FR-49 | n/a (no UI) | Ops/Backups | 3.8, 3.16 | n/a (no operation) |
| FR-50 | n/a (no UI) | Data model (appConfig) | 3.11 | n/a (no operation) |
| FR-51 | n/a (no UI) | Data model (appConfig) | 3.11 | n/a (no operation) |
| FR-52 | n/a (no UI) | Secrets | 3.4 | n/a (no operation) |
| FR-53 | n/a (no UI) | Environments (Local) | 1 | n/a (no operation) |
| FR-54 | n/a (no UI) | Overview; Environments (Prod) | 7, 9 | n/a (no operation) |
| FR-55 | n/a (no UI) | Flow 16 | 3.16 | n/a (no operation) |
| FR-56 | S-11, S-13, S-15, S-16, S-18 | Flow 9; T4 | 3.2, 4.9 | reauthenticateWithPassword, requireRecentSignIn users |
| FR-57 | S-16 | Flow 8; T4 | 4.10 | startMfaEnrollment, confirmMfaEnrollment |
| FR-58 | S-10 | Flow 7; Security/tables; T5 | 2.1, 3.2, 4.10 | verifyMfaSignIn, private.mfa_satisfied |
| FR-59 | S-16, S-10 | Flow 8; T4 | 4.10 | disableMfa |
| NFR-1 | n/a (no UI) | Security/tables; T7 | 2, 9 | private.mfa_satisfied, rate_limits RLS |
| NFR-2 | n/a (no UI) | Security/tables; T7 | 9 | n/a (no operation) |
| NFR-3 | n/a (no UI) | Guards; Security/ops; T6 | 3.2, 3.7, 9 | all actions and handlers |
| NFR-4 | n/a (no UI) | Secrets; T16 | 1, 3.3, 3.4 | n/a (no operation) |
| NFR-5 | n/a (no UI) | Secrets; T16 | 3.4 | n/a (no operation) |
| NFR-6 | n/a (no UI) | NFRs; T3 | 3.10 | all actions and handlers |
| NFR-7 | n/a (no UI) | NFRs; T10 | 1 | n/a (no operation) |
| NFR-8 | S-4, S-9, S-10, S-11 | Security/ops; T9 | 3.9 | safeRedirectPath users |
| NFR-9 | M-7, S-8, S-20 | NFRs | 3.7 | all actions and handlers |
| NFR-10 | M-5 | Abuse; T1 | 2.3, 3.5 | rate_limit_hit |
| NFR-11 | C-4, M-6 | Abuse; T18 | 3.6 | signUp, signIn, requestMagicLink, requestPasswordReset, reauthenticateWithPassword |
| NFR-12 | M-1–M-7, S-4–S-6 | Abuse; T8 | 3.5, 4.1, 4.4, 4.5, 4.7 | signUp, signIn, requestMagicLink, requestPasswordReset |
| NFR-13 | n/a (no UI) | T3, T20 | 3.1, 3.8 | n/a (no operation) |
| NFR-14 | n/a (no UI) | T20 | 3.3 | cookie contract §1.6 |
| NFR-15 | n/a (no UI) | Security/tables | 2.5 | n/a (no operation) |
| NFR-16 | n/a (no UI) | Privacy; Flow 12–13 | 3.12, 4.12 | /account/export, deleteAccount |
| NFR-17 | n/a (no UI) | Privacy; T10 | 3.15 | /monitoring |
| NFR-18 | n/a (no UI) | Ops/Backups; T15 | 3.16 | n/a (no operation) |
| NFR-19 | n/a (no UI) | Ops/Rollback; T15 | 2, 7 | n/a (no operation) |
| NFR-20 | n/a (no UI) | T17 | 8 | n/a (no operation) |
| NFR-21 | n/a (no UI) | Free-tier limits | 3.4, 7 | n/a (no operation) |
| NFR-22 | n/a (no UI) | Free-tier limits | 8, 9 | n/a (no operation) |
| NFR-23 | Accessibility, all | NFRs | 3.11, 4.11 | n/a (no operation) |
| NFR-24 | S-1, S-12 | NFRs | 9 | n/a (no operation) |
| NFR-25 | n/a (no UI) | Environments (Local) | 9 | n/a (no operation) |
| NFR-26 | S-5, S-9 | Flow 1, 6; T2 | 2.2, 4.1, 4.6 | signUp, setInitialPassword, /auth/callback |
