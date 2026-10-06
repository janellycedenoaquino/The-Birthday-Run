# Template: Project Brief

Last updated: 2026-09-26 · Status: approved (updated after PRD, RFC and design review)

## In one sentence
A reusable, secure Next.js + Supabase starter that every one of the user's future web apps is created from, so accounts, security, emails, legal pages, monitoring, backups, tests and deployment are done right once.

## Research verdict
Skipped by choice: this is internal infrastructure, not a product (see `docs/00-Research.md`). The RFC checks versions and free-tier limits instead.

## Problem and goal
- **Problem:** Every new app idea would otherwise rebuild sign-in, security, emails and deployment from scratch, and a security shortcut made under time pressure would repeat in each app.
- **Goal:** A new app starts from "Use this template" with all of the foundations working, tested and secure. It only needs a config file and environment variables changed.
- **Success looks like** (all four are required for "v1 done"):
  1. **New app in under 1 hour** (clock starts with accounts and this app's keys already made): a throwaway test app goes from "Use this template" to a deployed app with working sign-in on a free `*.vercel.app` URL, following only the README (timed on a real run-through, then the app and its Supabase project are deleted).
  2. **Full e2e passes in CI:** sign up → verify → sign in → reset password → delete account passes on every push, and once against the deployed throwaway test app.
  3. **RLS tests on every table:** each table with user data has a test showing another user and a signed-out visitor can't read, change or delete its rows.
  4. **Security scan clean:** `npm audit` (no high/critical), gitleaks, and a response-headers check (securityheaders.com grade A or better) all pass.

## Users
| User type | What they need to do | Account needed? |
| --- | --- | --- |
| Builder (the user, with Claude Code) | Create a new app from the Template, rename/rebrand it in one config file, set env vars, deploy, add app features safely following CLAUDE.md | GitHub, Supabase, Resend, Cloudflare, Google Cloud, Sentry, Vercel accounts |
| Signed-out visitor of an app | See the landing, privacy and terms pages; sign up or sign in | No |
| Signed-in user of an app | Use the dashboard placeholder; manage name and password; turn MFA on or off; download their data; delete their account; sign out | Yes |

## Version 1 must-haves
From the existing `README.md` and `CLAUDE.md`:

1. **Accounts:** sign up, sign in and sign out with email + password, email magic link and Google; email verification; forgot/reset password; protected pages with automatic session refresh; a `profiles` row created automatically for each new user; optional two-step sign-in (MFA) with an authenticator app, using Supabase's built-in TOTP.
2. **Account settings:** change name and password; turn MFA on/off; **download my data**; **delete my account**. Sensitive changes need a recent sign-in.
3. **Security:** RLS on every table with deny-by-default policies and RLS tests; server-only secrets, with a build that fails if the service-role key could reach the browser; security headers (CSP with nonces, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy); rate limits on sign-in, sign-up, password reset, magic link and public forms; Turnstile on every auth form (sign-up, sign-in, magic link, password reset) and public forms; Zod validation of every server input; safe redirects; plain error messages; no account enumeration.
4. **App shell:** landing page, auth pages, signed-in dashboard placeholder, settings; mobile-first layout, dark mode, loading states, toasts, accessible forms; 404 and error pages; privacy and terms placeholder pages; SEO basics (metadata, OG image, sitemap, robots.txt); installable web app (manifest + icons).
5. **One config file** holding the app name, description, URL, brand colors, support email and logo. Domain-specific values (site URL, email sending domain/from-address) are placeholders filled in per app.
6. **Emails:** welcome, verify email, magic link, password reset templates (React Email, branded from the config file), sent through Resend, with Resend also set as Supabase's SMTP.
7. **Monitoring:** Sentry error reporting, with personal data and secrets scrubbed; Vercel Web Analytics (free) switched on.
8. **Backups and rollback:** a backup script for the database (Supabase Free has no automatic backups), restore steps that have actually been tested, forward-only migrations, and app rollback on Vercel that never needs a database rollback.
9. **Quality and CI:** strict TypeScript, ESLint, Prettier; Vitest unit tests; Playwright e2e for the full account journey; GitHub Actions on every push (lint, typecheck, tests, build, secret scan, `.env.example` check); Dependabot; the existing pre-commit/pre-push hooks and review skills kept working.
10. **Docs:** README with Fedora local setup, "start a new app" checklist, and every env var explained; CLAUDE.md project structure and commands filled in; a generic launch checklist; a `docs/decisions/` log.

## Out of scope for version 1
- Payments, teams/organizations, multiple languages, admin panel: each app adds these only if it needs them.
- Analytics beyond Vercel's free Web Analytics.
- A permanent deployment or custom domain for the Template itself: it only lives on GitHub (private) and the user's PC. Deploys happen from throwaway test apps and real apps.
- Any app-specific tables, pages, wording or features (including anything gift-registry-specific).
- Native mobile apps (the installable web app covers phones).
- Changing email in settings: deferred to "later, if time allows" (users ask support meanwhile).
- File uploads: CLAUDE.md rule 18 says how an app adds them; the Template ships no bucket.

## Mode and stack
- **Mode:** template
- **Stack:** Next.js (App Router, TS strict), Supabase (Postgres, Auth, RLS, migrations, generated types), Tailwind CSS + shadcn/ui, Resend + React Email, Zod, Cloudflare Turnstile, Sentry, Vercel, Vitest, Playwright, GitHub Actions (as in `CLAUDE.md`).
- **Additions beyond the Template:** n/a (this is the Template). Any new package needs a stated reason (CLAUDE.md rule 23).

## Look and feel
Plain shadcn/ui defaults: neutral and clean, with light and dark mode. Brand colors and the logo come from the config file, so each app restyles by changing it rather than the components.

## Constraints
- **Budget:** free tiers only. Say so before anything paid.
- **Platforms:** web, mobile-first; installable on phones as a web app.
- **Dev machine:** Fedora 44; local Supabase in containers (Docker or Podman).
- **Legal and privacy:** privacy policy and terms pages (placeholders filled per app); data export and account deletion for all user data; collect only what's needed; Sentry events scrubbed of personal data.

## Time
- **Capacity:** about 20 hours/week, starting Mon 2026-09-28.
- **Deadline:** Mon 2026-11-16. The gift registry app starts from the Template then, and the user wants all of v1 done first.
- **Fits?** Rough estimate after PRD review (MFA and Turnstile on sign-in added): 92–148 hours (after deferring email change and adding email-first sign-up), which is 5–8 weeks at 20 hrs/week including a 15% buffer. That means **about Nov 4 to Nov 27**. The likely case fits; the worst case runs about 1.5 weeks over. **No cuts agreed in advance:** the roadmap marks the point where the plan is late, and the user then decides whether to cut something or move the date.

## Money
Not a goal for the Template. It stays on free tiers, and Vercel Hobby is fine because the Template itself isn't commercial. Each app decides on Vercel Pro once it earns money (Hobby is for non-commercial use only).

## Known risks
- **Podman + Supabase CLI:** the Supabase CLI expects Docker. On Fedora with Podman it may need the Podman socket and `DOCKER_HOST` set, or Docker instead. It could eat setup hours in week 1.
- **Email without a domain** *(PM-added)*: the Template has no domain. Locally, auth emails go to Supabase's local mail catcher. The throwaway test app has to use Resend's test sender, which (assumption, the RFC will verify) only delivers to the Resend account owner's address. The deployed e2e run must fit around that.
- **Free-tier limits** *(PM-added)*: Supabase Free pauses inactive projects and has no backups; Resend Free allows 100 emails/day. E2E runs against the deployed app must not burn through email quotas.
- **CSP with nonces** *(PM-added)*: nonce-based CSP makes pages dynamic in Next.js and interacts with Sentry, Turnstile and Vercel scripts. This is the part most likely to run over.

## Decisions log
| Date | Decision | Why |
| --- | --- | --- |
| 2026-09-26 | Skip market research | Internal infrastructure, not a product |
| 2026-09-26 | All of v1 before the gift registry; target Mon 2026-11-16 | User wants the full foundations first; gift registry start moved to mid-Nov |
| 2026-09-26 | No pre-agreed cuts; roadmap flags slippage and user decides cut vs move date | User's choice |
| 2026-09-26 | Plain shadcn defaults, branded via config file | Neutral base that is easy to rebrand per app |
| 2026-09-26 | Template stays on free tiers; Vercel Pro is a per-app decision | Template is non-commercial |
| 2026-09-26 | Sentry, backups and forward-only migrations are in v1 scope | Added to CLAUDE.md rules 20–22 |
| 2026-09-26 | Template is never deployed and has no domain; domain values are per-app placeholders | Template stays on GitHub and the user's PC |
| 2026-09-26 | Deploy path proven with a throwaway test app on `*.vercel.app`, deleted after v1 sign-off | Tests the real new-app flow without a permanent deployment |
| 2026-09-26 | Vercel Web Analytics included in the Template | User's choice; free tier |
| 2026-09-26 | Turnstile on all auth forms, including sign-in | Blocks distributed password guessing; protects email quota |
| 2026-09-26 | No contact form; `mailto:` support link in the footer | Every app needs support contact, not every app needs a form |
| 2026-09-26 | Optional TOTP MFA in v1, using Supabase's built-in MFA | Free and built in, so little custom code; security is the point |
| 2026-09-26 | Change email deferred to later; data export stays in v1 | Saves 4–7 hrs; export is required by CLAUDE.md rule 19 |
| 2026-09-26 | Metric 1 clock starts with the app's keys already made | User's choice |
| 2026-09-26 | Email-first sign-up: verify email, then choose password | Closes pre-account takeover (RFC D10) |
| 2026-09-26 | CSP styles: nonce for `<style>`, inline style attributes allowed; fallback to `style-src 'unsafe-inline'` if a library breaks it | shadcn/Radix need style attributes; scripts stay nonce-only (RFC D5) |
| 2026-09-26 | Backups daily, kept 30 days, age-encrypted; previews share prod DB behind Vercel Authentication; Supabase per-IP limits accepted for v1; Podman first | RFC U1–U4 |
| 2026-09-26 | Branch/PR workflow is a convention, not enforced | GitHub Free can't enforce branch protection on private repos |

## Open questions
- [x] Rate limiting: Postgres table + function (RFC D3)
- [x] Backups: age-encrypted GitHub Actions artifacts, 30 days (RFC D14)
- [x] Deployed e2e emails: the Builder pastes 3 links from their own inbox (RFC D7)
- [x] ~50 design-writer questions resolved in RFC D24 (PM consistency review, 2026-09-26)
- [ ] Week-1 checks (owner: Builder + Claude, phase 1–2; results go in `docs/decisions/`): Podman runs the full local Supabase stack; Mailpit's send API is on in the CLI container; which email template Supabase uses for `signInWithOtp` sign-ups; whether the `amr` `recovery` entry exists; whether the split CSP style rule survives Sonner/next-font/next-themes; which `auth` tables keep IPs/user agents after `deleteUser`; Vercel Web Analytics sets no cookies
- [ ] Whether a daily backup counts as activity for Supabase Free's 1-week pause (owner: per app, launch checklist)
- [ ] Real CI minutes per push vs the 10–12 estimate (owner: Builder, after the first CI runs)

## Existing material
- `README.md`: feature list, stack, new-app checklist, review workflow
- `CLAUDE.md`: stack, security rules 1–23, feature checklist, working rules
- `.claude/security-checklist.md`, `.claude/skills/pre-commit-review`, `.claude/skills/pre-push-review`, `.githooks/`, `scripts/check-env-example.sh`
