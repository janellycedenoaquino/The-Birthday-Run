# Template: Overview (read this first)

Last updated: 2026-09-30 · Status: v1 signed off 2026-09-30 (decisions/0016) · next: the gift registry, from 2026-10-01

**How to use this file:** read it at the start of every session, then only the sections the current phase lists in §8. Don't load whole documents. This file only points: if it disagrees with a doc, the doc wins, and this file gets rebuilt.

## 1. What it is
A reusable, secure Next.js + Supabase starter that every future app is created from ("Use this template"). Accounts, security, emails, legal pages, monitoring, backups, tests and deployment are done once. A new app changes only the config file and env vars (SPEC §1).
- **Done when:** success metrics 1–4 are met (SPEC §2.1): a new app in under an hour, full e2e green in CI, RLS tests on every table, and a clean security scan.
- **Time:** about 20 hrs/week, no fixed deadline. Target and flag point: ROADMAP.md. The gift registry starts after v1 sign-off (decisions/0003).

## 2. Scope
In (BUILD features):
- **F-1** Database foundations: migrations, types, `config.toml`, user-data registry
- **F-2** Security core: proxy, CSP and headers, guards, clients and cookies, rate limiter, Turnstile, safe redirects, errors, env and bundle scan
- **F-3** Config, branding and app shell: public pages, dashboard shell, 404/error, SEO, PWA, dark mode
- **F-4** Monitoring and analytics: Sentry with scrubbing, Web Analytics
- **F-5** Email pipeline: templates, build step, transport, welcome email
- **F-6** Sign-up (email first) and set password
- **F-7** Sign-in (password, magic link, Google) and sign-out
- **F-8** Password reset
- **F-9** Re-authentication for sensitive changes
- **F-10** Two-step sign-in (TOTP MFA)
- **F-11** Account settings: name, password, export, delete
- **F-12** Backups and restore
- **F-13** Change email: deferred

Out: SPEC §2.4. That includes payments, teams, languages, an admin panel, uploads, other providers, recovery codes and a contact form.

## 3. Architecture in ten lines
1. Every Supabase call happens on the server. There's no browser Supabase client (D21, DESIGN §2).
2. The proxy sets the CSP nonce and refreshes the session. It is **never** the security check (D2, F-2).
3. Every page, action and route calls `requireUser()` / `requireRecentSignIn()` (D2, BUILD §0.2).
4. RLS denies by default, plus a restrictive MFA policy on every user-data table (D8, DESIGN §3).
5. Auth emails: React Email → build step → Supabase templates → Resend SMTP. The app sends only the welcome email (D7, F-5).
6. Rate limits live in a Postgres table behind a service-role-only function and fail closed (D3, BUILD §0.4).
7. Turnstile runs through Supabase's built-in CAPTCHA on every auth form (D4).
8. A nonce CSP makes every page dynamic (D5, F-2).
9. Sentry sends through a same-origin tunnel with personal data off (D15, F-4).
10. Deploys go to Vercel Hobby; migrations are forward-only and pushed by the Builder; backups are encrypted artifacts kept by each app (D14, D19).

## 4. Decisions
All detail is in DESIGN §1. Changing one needs a file in `decisions/`.

| D | One line |
| --- | --- |
| D1 | Versions to target (the stack table) |
| D2 | Proxy refreshes only; guards call `getUser()` on every protected request |
| D3 | Postgres fixed-window rate limiter, HMAC keys, fail closed |
| D4 | Turnstile through Supabase's CAPTCHA; `verifyTurnstile()` only for future public forms |
| D5 | Nonce CSP, split style rule with a recorded fallback, static security headers |
| D6 | `server-only` boundary, Zod-validated env, bundle secret scan |
| D7 | Emails: React Email templates in Supabase via Resend SMTP; the deployed e2e run uses pasted links |
| D8 | TOTP MFA, enforced by the guards and restrictive RLS |
| D9 | "Recent sign-in" = the newest `amr` timestamp is within the window |
| D10 | Email-first sign-up: verify first, then set a password (closes pre-account takeover) |
| D11 | Magic link never creates accounts |
| D12 | One app table (`profiles`), user-data registry, hard delete by cascade |
| D13 | Data export as a JSON download through the user's own RLS client |
| D14 | Daily age-encrypted backups as GitHub artifacts, time-limited |
| D15 | Sentry: tunnel, personal data off, scrubber, errors only |
| D16 | One config file for branding; the site URL comes from env |
| D17 | Fixed operation names: server actions, a few route handlers, DB functions |
| D18 | Vitest unit + RLS through PostgREST, Playwright e2e, three CI jobs |
| D19 | Vercel Hobby, Builder-run migrations, instant rollback, pausing notes |
| D20 | Folder structure (BUILD §0.1) |
| D21 | HttpOnly session cookies set explicitly; no browser client |
| D22 | Password rule: long over complex |
| D23 | Podman first on Fedora 44, Docker as the fallback |
| D24 | 32 consistency-review resolutions (D24.1–D24.32), plus the user's answers U1–U4 |

## 5. Data
Fields and RLS rules are all in DESIGN §3.

| Entity | One line |
| --- | --- |
| `auth.users`, `auth.identities`, `auth.mfa_factors` | Supabase-owned; only the fields listed in §3 are relied on |
| `public.profiles` | One row per user, created by a trigger, removed by cascade; the only app table with user data |
| `private.rate_limits` | Limiter counters with hashed keys; not user data, no user access |
| Registry | `USER_DATA_TABLES` / `NON_USER_DATA_TABLES`; drives export, delete and the coverage test |
| `appConfig` | Name, colors, logo, support email, legal entity |
| Export file / backup artifact | Formats defined in F-11 / F-12 |

## 6. Features and operations
| F | Operations | Screens | BUILD |
| --- | --- | --- | --- |
| F-1 | migrations, `rate_limit_hit`, `claim/release_welcome_email`, `mark_password_set`, `mfa_satisfied`, triggers | none | F-1 |
| F-2 | proxy, `requireUser`, `requireRecentSignIn`, `rateLimit`, `verifyTurnstile`, `safeRedirectPath`, `toUserMessage`, env | C-4 | F-2 |
| F-3 | config, `getSiteUrl`, layout, metadata routes | S-1–S-3, S-12, S-19, S-20, C-1–C-3 | F-3 |
| F-4 | Sentry init, scrubber, `/monitoring` | S-20 | F-4 |
| F-5 | `email:build`, `sendEmail`, welcome email | E-1–E-4 | F-5 |
| F-6 | `signUp`, `GET /auth/confirm`, `setInitialPassword` | S-5, S-9, S-8 | F-6 |
| F-7 | `signIn`, `requestMagicLink`, `signInWithGoogle`, `GET /auth/callback`, `signOut` | S-4, S-8 | F-7 |
| F-8 | `requestPasswordReset`, `updatePasswordFromReset` | S-6, S-7 | F-8 |
| F-9 | `reauthenticateWithPassword` | S-11 | F-9 |
| F-10 | `startMfaEnrollment`, `confirmMfaEnrollment`, `verifyMfaSignIn`, `disableMfa` | S-10, S-16 | F-10 |
| F-11 | `updateDisplayName`, `changePassword`, `GET /account/export`, `deleteAccount` | S-12–S-18 | F-11 |
| F-12 | `scripts/backup.sh`, `backup.yml`, restore | none | F-12 |

## 7. Security, threats, operations: the non-obvious points
- `@supabase/ssr`'s default cookies aren't HttpOnly, so the options are set explicitly (D21, BUILD §0.7).
- MFA is decided from the Auth server's factors, never from the cookie (D2, D8).
- Every user-data table needs the restrictive MFA policy, a cascade path to `auth.users` and a registry entry, or CI fails (D12, F-1).
- All user-facing text lives only in SPEC §3.4. Code uses message IDs (BUILD §0.3).
- Enumeration: identical messages and a minimum response time (NFR-12, D24.10). The residual risks are in DESIGN §4.2 (T8).
- `supabase config push` without the production remote block clears production SMTP (D7, DESIGN §5.4).
- Supabase Free has no backups and pauses idle projects (DESIGN §5.3). Backups are each app's job (D14).
- Rollback on Hobby only goes back one deployment, and never rolls back the database (D19, BUILD "Rollback runbook").
- The week-1 checks can change D5, D7, D10, D23 and D24.6; results go in `decisions/` (BUILD "Week-1 checks").

## 8. Read for each phase
The home of these lists is ROADMAP.md; this is a copy for convenience.

| Phase | Read |
| --- | --- |
| 1. Foundations | BUILD §0.1, §0.6, §0.8, F-1, F-2 (env and bundle scan), CI · DESIGN D1, D6, D12, D18, D20, D23, §3 |
| 2. Security core + shell | BUILD §0, F-2, F-3, F-4 · DESIGN D2–D5, D15, D16, D21, §4.1 · SPEC §3.1, §3.2, S-1–S-3, S-12, S-19, S-20, §3.4, §3.6, §3.7 |
| 3. Accounts | BUILD §0.2–§0.5, §0.7, F-5–F-9 · DESIGN D7, D9–D11, D22, D24 · SPEC S-4–S-11, §3.4 |
| 4. Settings + MFA | BUILD §0.2, §0.4, §0.5, F-10, F-11 · DESIGN D8, D12, D13, §3 · SPEC S-10, S-13–S-18, §3.4 |
| 5. E2E, backups, docs | BUILD F-12, CI · DESIGN D14, D18, §5 · LAUNCH-CHECKLIST |
| 6. Sign-off | LAUNCH-CHECKLIST · BUILD CI · DESIGN D19 · SPEC §2.1 |

## 9. Where things live
| Need | Go to |
| --- | --- |
| Why we're building it, users, constraints, time | SPEC §1 |
| A requirement and its acceptance test | SPEC §2.2 / §2.3 (FR-, NFR-) |
| Which screen, component and design cover a requirement | SPEC §2.5 |
| A screen, its states and the exact wording | SPEC §3.3, §3.4 |
| Why something was decided | DESIGN §1 (D-) |
| Table fields and RLS rules | DESIGN §3 |
| Threats and privacy | DESIGN §4 (T1–T22) |
| Free-tier limits, failure modes, risks | DESIGN §5 |
| Folder layout, result shape, error codes, rate limits, env vars, cookies | BUILD §0 |
| How to build a feature and its tests | BUILD F-n |
| CI, deployment, rollback, week-1 checks | BUILD "CI, deployment and migrations" |
| Phases, hours, dates, cut list | ROADMAP.md |
| v1 sign-off list | LAUNCH-CHECKLIST.md (the generic app list is `docs/LAUNCH_CHECKLIST.md`) |
| Decisions made after planning | decisions/ |
| The old eight-document version (reference only) | `docs/archive/` |
