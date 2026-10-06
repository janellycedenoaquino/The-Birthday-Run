# Template: Overview (read this first)

Last updated: 2026-09-26 · Status: planning approved, build not started (Phase 1 next)

**How to use this file:** read it at the start of every session. It's the whole project on a few pages. Then read **only the sections the current phase lists** (bottom of this file), not whole documents. The full docs are the detailed reference; if this overview and a doc disagree, the doc wins. Fix this file in the same change.

## 1. What it is
A reusable, secure Next.js + Supabase starter. Every future app is created from it on GitHub ("Use this template"), then renamed in one config file. The Template itself is never deployed. It's tested by creating a throwaway app, deploying it to `*.vercel.app`, then deleting it.

**v1 is done when** (PRD metrics 1–4):
1. A new app goes from template to deployed with working sign-in in **under 1 hour**, following only the README.
2. The full e2e journey passes in CI and once against the deployed throwaway app.
3. Every user-data table has RLS tests.
4. The security scan is clean (npm audit, gitleaks, headers grade A).

**Time:** ~20 hrs/week from Sep 28, 2026; deadline Nov 16, 2026; estimate 103–168 hrs (fits only in the optimistic case; see ROADMAP).

## 2. Scope
**In v1:**
- **Accounts:** email-first sign-up, password, magic link (sign-in only), Google, optional TOTP MFA, reset, re-auth for sensitive changes
- **Settings:** name, password, MFA on/off, download my data, delete account
- **Shell:** landing, privacy/terms placeholders, dashboard placeholder, 404/error, dark mode, SEO, installable (PWA)
- **Plumbing:** one config file, 4 emails (verify, magic link, reset, welcome), Sentry, Vercel Web Analytics, encrypted daily backups (in apps), CI and review hooks

**Not in v1:** change email (FR-13, deferred), payments, teams, i18n, admin panel, file uploads (rule 18 explains how to add them), native apps, a deployed Template, anything app-specific.

## 3. Architecture in ten lines
1. **Every Supabase call happens on the server.** There's no browser Supabase client (D21).
2. **Session cookies are set explicitly** to `HttpOnly`, `Secure` and `SameSite=Lax`. `@supabase/ssr`'s defaults are *not* HttpOnly (D21).
3. **`src/proxy.ts`** (Next 16's renamed middleware) only sets the CSP nonce, refreshes the session with `getClaims()` and does optimistic redirects. **It is never the security check** (D2).
4. **The security check** is `requireUser()` / `requireRecentSignIn()` in `src/server/auth/guards.ts`, in every protected page, action and handler. They use `getUser()` (Auth server), plus AAL/MFA and password-set checks (D2, D24.2).
5. **Forms use server actions** returning `ActionResult<T>`. Route handlers exist only for email links, OAuth, export and the Sentry tunnel (D17).
6. **Supabase Auth** does passwords, OTP links, Google, TOTP and CAPTCHA (Turnstile). The app adds rate limits, Zod, re-auth, MFA enforcement and restrictive RLS.
7. **Auth emails** are React Email templates exported to `supabase/templates/`, sent by Supabase through Resend SMTP. The app sends only the welcome email (D7).
8. **Every page is dynamic** because of the nonce CSP: no static generation, ISR or PPR (D5).
9. **The database has one app table**, `public.profiles`, plus `private.rate_limits`. User data is tracked in a registry that export, delete and tests all use (D12).
10. **Backups:** a daily `supabase db dump` in a GitHub Actions workflow, age-encrypted, kept 30 days as artifacts in each app's repo (D14).

## 4. Decisions (RFC `docs/03-RFC.md`, all approved and fixed)
| # | Decision in one line |
| --- | --- |
| D1 | Versions pinned as of 2026-09-26: Node 24 LTS, Next 16.3, React 19.3, supabase-js 2.117, @supabase/ssr ~0.12.7, Zod 4, Tailwind 4, react-email 6, Sentry 11 (fallback 10.75), Supabase CLI as a devDependency |
| D2 | Proxy = nonce + refresh + optimistic redirect; guards with `getUser()` are the real check; never `getSession()` on the server |
| D3 | Postgres fixed-window rate limiter (`rate_limit_hit`, service-role only), HMAC-SHA256 keys, **fails closed**, same "Too many attempts" message everywhere |
| D4 | Turnstile through **Supabase's built-in CAPTCHA**. Actions pass `captchaToken` through and never call siteverify themselves (tokens are single-use). `verifyTurnstile()` is only for future non-auth forms |
| D5 | Nonce CSP with `strict-dynamic`; `style-src-elem` nonce plus `style-src-attr 'unsafe-inline'` (fallback recorded in decisions/); static security headers in `next.config.ts` |
| D6 | `src/server/**` all `server-only`; Zod-validated env (schema/parser/public split); a build-time bundle scan for real secret values |
| D7 | Supabase + Resend SMTP for auth emails, token-hash links through `/auth/confirm`; welcome email claimed atomically (`claim_welcome_email`), released on failure; Mailpit locally and in CI |
| D8 | Supabase TOTP (free); enforced by guards **and** a restrictive RLS policy `private.mfa_satisfied()` on every user-data table |
| D9 | "Recent sign-in" means the newest `amr` timestamp is ≤ 10 min old; otherwise `/auth/reauthenticate` (password, or Google for Google-only users) |
| D10 | **Email-first sign-up:** verify the email, then set the password (`/auth/set-password`). This closes pre-account takeover |
| D11 | Magic link never creates accounts; identical messages plus ~500 ms padding |
| D12 | `profiles` (trigger-created, cascade delete, only `display_name` updatable); `USER_DATA_TABLES` / `NON_USER_DATA_TABLES` registry; hard delete through the admin API with the id from `getUser()` |
| D13 | `GET /account/export` returns JSON of every registry table, read with the user's own client (RLS applies) |
| D14 | Backups: `backup.sh` (roles, schema, data incl. auth), tar + age to a public recipient, daily workflow, 30-day artifacts; documented restore |
| D15 | Sentry through the `/monitoring` tunnel, `dataCollection` all off, scrubber hooks (cookies, headers, bodies, query strings, emails, tokens), errors only |
| D16 | `src/config/app.ts` + Zod schema (hex colors); the site URL comes from env through `getSiteUrl()`; brand flows to CSS vars, manifest, OG image, emails, legal pages |
| D17 | Fixed operation and route names (§6 below); `safeRedirectPath()` for every `next` |
| D18 | Vitest unit + RLS tests through PostgREST with real users + catalog tests; signed-out refusal test for every action; Playwright journey; CI jobs `checks`, `secrets`, `integration` |
| D19 | Vercel Hobby; migrations pushed from the Builder's machine (expand-then-contract); rollback = Vercel Instant Rollback, never a DB rollback |
| D20 | The folder structure (§9 below) |
| D21 | Explicit HttpOnly cookie options; no browser client (Realtime later needs a decision) |
| D22 | Passwords: 12 characters min, 72 UTF-8 bytes max, no character-class rules |
| D23 | Docker or rootless Podman (`podman.socket` + `DOCKER_HOST`); `[storage] enabled = false` |
| D24 | 32 review resolutions: guard options, MFA enrollment needs re-auth, sign out other sessions after a password change, recovery-session detection (15 min), HMAC keys, `ActionResult.data`, `?notice=` enum, `/auth/error?reason=`, message IDs API-1…7 and more. **Read D24 when working on auth** |

## 5. Data model
| Entity | Key points |
| --- | --- |
| `public.profiles` | `id` (= `auth.users.id`, cascade), `display_name` (1–80, only updatable column), `welcome_email_sent_at`, `password_set_at` ("has a password" signal), `created_at`, `updated_at`. Policies: select/update own row + restrictive MFA. No insert/delete policies |
| `private.rate_limits` | `key`, `window_start`, `count`. RLS on, no policies, service role only, 24 h retention |
| Supabase `auth.*` | users, identities (`email`, `google`), `mfa_factors` (TOTP) |
| `appConfig` | `name`, `shortName`, `description`, `supportEmail`, `brand` (hex), `logo`, `legal` |

**Rule for every new user-data table:** it lives in `public`, has a cascade FK path to `auth.users`, RLS with the restrictive MFA policy, an RLS test, and an entry in `USER_DATA_TABLES` (the coverage test fails otherwise).

## 6. Operations
| Kind | Names | Detail |
| --- | --- | --- |
| Actions `actions/auth.ts` | `signUp`, `setInitialPassword`, `signIn`, `requestMagicLink`, `requestPasswordReset`, `updatePasswordFromReset`, `signInWithGoogle`, `signOut`, `reauthenticateWithPassword` | API §2 · DD §4.1–4.9 |
| Actions `actions/mfa.ts` | `startMfaEnrollment`, `confirmMfaEnrollment`, `verifyMfaSignIn`, `disableMfa` | API §3 · DD §4.10 |
| Actions `actions/account.ts` | `updateDisplayName`, `changePassword`, `deleteAccount` | API §4 · DD §4.12 |
| Route handlers | `GET /auth/confirm`, `GET /auth/callback`, `GET /account/export`, `/monitoring` (Sentry), metadata routes | API §5 |
| DB functions | `claim_welcome_email`, `mark_password_set` (authenticated); `rate_limit_hit`, `release_welcome_email` (service role); `private.mfa_satisfied`; triggers `handle_new_user`, `set_updated_at` | API §6 · DD §2 |

Rate limits per action: API §1.4. Exact user-facing messages: API §1.5 and UX "Exact messages". Zod schemas: API §1.3.

## 7. Screens (UX `docs/04-UX-Spec.md`)
| ID | Route | ID | Route |
| --- | --- | --- | --- |
| S-1 | `/` | S-11 | `/auth/reauthenticate` |
| S-2, S-3 | `/privacy`, `/terms` | S-12 | `/dashboard` |
| S-4 | `/sign-in` (password / email link / Google) | S-13 | `/settings` shell |
| S-5 | `/sign-up` (email + Turnstile only) | S-14–S-18 | Settings: Profile, Password, Two-step, Your data, Delete |
| S-6, S-7 | `/forgot-password`, `/reset-password` | S-19, S-20 | 404, error |
| S-8 | `/auth/error?reason=` | C-1–C-5 | header, footer, feedback/toasts, Turnstile, password field |
| S-9, S-10 | `/auth/set-password`, `/auth/mfa` | M-*, E-* | messages, emails |

Style: plain shadcn/ui, light and dark; brand colors come from the config, with contrast ≥ 4.5:1 checked by a test. WCAG 2.2 AA; phones first (360 px wireframes).

## 8. Security quick reference
The security rules are in `CLAUDE.md` (1–23). The specifics that are easy to get wrong here:
- **Guards on everything.** A signed-out test calls every exported action and handler.
- **Identical responses:** the same messages and ~500 ms minimum for `signUp`, `requestMagicLink`, `requestPasswordReset` and failed `signIn`. No account enumeration.
- **Ids never come from input:** `deleteAccount` and `release_welcome_email` use the id from `getUser()`.
- **Service-role functions** have EXECUTE revoked from `anon`/`authenticated`, and a catalog test enforces it.
- **`safeRedirectPath()`** accepts only single-slash same-site paths; `auth_next` and `auth_recovery` are HttpOnly cookies.
- **CSP:** scripts are nonce-only; images, fonts and connections are same-origin. Any new outside host is a security change.
- **Sentry:** nothing personal leaves (see D15). The scrubber has unit tests.
- **Threat model:** T1–T22 in System Design §Threat model, including the accepted residual risks: login CSRF via confirm links, per-email sign-in lockout, direct-API enumeration through Supabase's 422, and Sentry quota abuse.

## 9. Folders (D20)
```
src/proxy.ts · src/app/(public|auth|app)/… · src/app/auth/{confirm,callback}/route.ts · src/app/account/export/route.ts
src/components/{ui,layout,auth,settings} · src/config/{app,schema}.ts · src/emails/
src/lib/  (no secrets: env/schema, env/public, security/safe-redirect, validation/*, observability/scrub, messages.ts, types)
src/server/ (all server-only: env, supabase/{server,admin}, auth/guards, actions/*, security/{rate-limit,turnstile,csp}, email/*, data/{registry,export}, errors, site-url)
supabase/{config.toml,migrations,templates} · tests/{unit,rls,e2e} · scripts/{check-env-example,check-bundle-secrets,email-build,backup}
.github/workflows/{ci,backup}.yml · .github/dependabot.yml · vercel.json
```

## 10. Env vars (names only; contract in API §7)
- **Public:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`
- **Secret:** `SUPABASE_SECRET_KEY`, `RATE_LIMIT_HMAC_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`\*, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`\*, `SENTRY_AUTH_TOKEN`
- **Server config:** `EMAIL_TRANSPORT` (`resend` or `mailpit`), `EMAIL_FROM`, `MAILPIT_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **Scripts/CI only:** `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT`, `E2E_TARGET`, `E2E_EMAIL`

\*Read only by `supabase config push` on the Builder's machine, never set on Vercel. Turnstile test keys live in CI and the README, not in `.env.example`.

## 11. Testing and operations
- **Tests:** unit (schemas, redirects, CSP, scrubber, config, keys), RLS (users A/B/anon through PostgREST, MFA aal1 blocked, catalog checks), signed-out refusal, Playwright journey (sign up → verify → welcome → sign in → reset → MFA → export → delete) with header, CSP, cookie, a11y and enumeration checks. Plan: DD §9.
- **CI:** about 10–12 min per push (unverified); docs-only pushes skip it.
- **Free-tier watch:** Supabase pauses after 1 week idle, 2 projects; Resend 100 emails/day; Vercel Hobby is non-commercial and 4 CPU-hrs/month; GitHub 500 MB artifacts and 2,000 min; Sentry 5k errors.
- **Rollback:** Vercel only goes back to the previous deployment on Hobby. Migrations are forward-only and pushed before the code that needs them.

## 12. Week-1 checks (unverified, results go to `docs/decisions/`)
Podman runs the full stack · Mailpit send API is on in the CLI container · the template used by `signInWithOtp` sign-ups and its link `type` · recovery `amr` detection (else the `auth_recovery` cookie) · Sonner, next/font and next-themes under `style-src-elem` · `auth` tables keeping IPs after delete · Vercel Analytics sets no cookies · whether a daily backup stops Supabase pausing. List: DD §9 "Week-1 verification steps".

## 13. Where things live
| Need | Go to |
| --- | --- |
| Why a decision was made | RFC D-number |
| Requirement wording and acceptance | PRD `docs/02-PRD.md` (FR/NFR tables); traceability at the end |
| What a screen shows and says | UX S-/C- sections, "Exact messages", wireframes |
| Components, data flow, threats, privacy, ops | System Design `docs/05-System-Design.md` |
| Migrations, module internals, flows, edge cases, tests | Detailed Design `docs/06-Detailed-Design.md` §1–10 |
| Operation contracts (Zod, results, errors, limits) | API `docs/07-API-Spec.md` §1–8 |
| Phase plan and hours | `ROADMAP.md` |
| Launch sign-off | `docs/08-Launch-Checklist.md` (Template) · `docs/LAUNCH_CHECKLIST.md` (generic, for apps) |

## 14. Read for each phase (only these sections)
| Phase | Read |
| --- | --- |
| **1. Foundations** | RFC D1, D6, D12, D18, D20, D23 · DD §1, §2, §3.3, §3.4, §8 · API §7 · System Design "Data model" |
| **2. Security core + shell** | RFC D3, D4, D5, D15, D16 · DD §3.1, §3.5–3.11, §3.14, §3.15 · UX C-1–C-5, S-1–S-3, S-19, S-20, "Visual style", "Accessibility" · API §1.4, §1.5, metadata routes · System Design "Security", "Threat model" |
| **3. Accounts** | RFC D2, D7, D9, D10, D11, D21, D22, D24 · DD §3.2, §3.13, §4.1–4.9, §5 · UX S-4–S-11, "Exact messages", "Emails" · API §1.1–1.3, §1.6, §2, §5 (`/auth/confirm`, `/auth/callback`), §6 |
| **4. Settings + MFA** | RFC D8, D12, D13 · DD §3.12, §4.10, §4.12 · UX S-12–S-18 · API §3, §4, §5 (`/account/export`) |
| **5. E2E, backups, docs** | RFC D14, D18, D19 · DD §3.16, §6, §7, §9 · System Design "Failure modes and operations" · `docs/LAUNCH_CHECKLIST.md` |
| **6. Sign-off** | `docs/08-Launch-Checklist.md` · PRD "Goals and success metrics" · DD §7 · System Design "Metrics collection" |
