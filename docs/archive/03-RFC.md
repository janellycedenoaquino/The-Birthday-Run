# RFC: Template technical approach

Last updated: 2026-09-26 · Status: approved · Based on: 01-Project-Brief.md, 02-PRD.md, CLAUDE.md (rules 1–23)

## Summary
The Template is a Next.js 16 App Router app (TypeScript strict) where **every Supabase call happens on the server**: server components, server actions and a few route handlers use `@supabase/ssr` with HttpOnly session cookies, and there is no browser Supabase client. Supabase Auth does the heavy lifting (password, magic link, Google, TOTP MFA, identity linking, built-in Turnstile CAPTCHA). The app adds its own Postgres-backed rate limits, Zod validation, a re-authentication window, MFA (AAL) checks and restrictive RLS on top. Auth emails come from React Email templates exported to HTML at build time and sent by Supabase through Resend SMTP. The app sends only the welcome email itself (Resend API in production, the local Mailpit catcher in dev and CI). A `proxy.ts` sets a per-request CSP nonce and refreshes the session. It is never the security check. CI runs the full local Supabase stack plus Playwright on every push. Backups are age-encrypted `supabase db dump` files kept as 30-day GitHub Actions artifacts in each app's private repo.

## Decisions

### D1. Versions to target
- **Decision:** Start on these releases, which were current on npm on 2026-09-26. Use caret ranges with the committed lockfile. Pre-1.0 packages get tilde ranges.

  | Package | Version | Notes |
  | --- | --- | --- |
  | Node.js | 24.x LTS ("Krypton", 24.21.0) | `engines` + `.nvmrc`; Node 26 is not LTS yet |
  | `next` | 16.3.6 | **`middleware.ts` is deprecated and renamed `proxy.ts` since v16.0.0**; proxy runs on the Node.js runtime and `runtime` can't be set |
  | `react`, `react-dom` | 19.3.0 | |
  | `@supabase/ssr` | ~0.12.7 | pre-1.0, so tilde range; peer `@supabase/supabase-js ^2.114` |
  | `@supabase/supabase-js` | 2.117.2 | |
  | `supabase` (CLI, devDependency) | 2.118.0 | Run via `npx supabase`, so the version is pinned per repo; needs Node ≥ 20 |
  | `tailwindcss` (+ `@tailwindcss/postcss`) | 4.3.3 | CSS-first config, no `tailwind.config.js` |
  | `shadcn` (CLI) | 4.21.0 | Components are copied into `src/components/ui` |
  | `zod` | 4.6.5 | Zod 4 API (`z.email()`, `z.url()`) |
  | `react-email` | 6.11.0 | Components and `render()` now come from `react-email`; **`@react-email/components` is deprecated on npm** |
  | `resend` | 6.30.0 | Welcome email only |
  | `@sentry/nextjs` | 11.0.0 | New major (released 2026-09-23). Fallback: 10.75.x with the same `dataCollection` settings if 11 breaks the build |
  | `next-themes` | 0.4.6 | Has a `nonce` prop for its inline script |
  | `@vercel/analytics` | 2.0.1 | |
  | `server-only` | 0.0.1 | |
  | `@playwright/test` | 1.63.0 | Chromium only in CI |
  | `vitest` | 5.0.2 | |
  | `@axe-core/playwright` (dev) | 4.13.0 | NFR-23 a11y check |
  | `postgres` (dev) | 3.4.9 | Catalog queries in RLS and coverage tests (D18) |
  | `sonner` | 2.0.8 | shadcn's toast component (FR-22) |
  | gitleaks (binary) | 8.30.1 | Same tool as the pre-commit hook |
  | Local stack (bundled by CLI 2.118) | Postgres 17.6, GoTrue v2.197.0, Mailpit v1.30.2 | |
- **Why:** The PM asked for versions checked against real releases. Pinning the Supabase CLI as a devDependency means CI and every clone run the same stack (FR-44, FR-53).
- **Alternatives considered:** Next 15 with `middleware.ts`: deprecated path, so no. Using `@react-email/components`: deprecated. Using t3-env for env vars: that adds a dependency for about 30 lines of Zod (D6).
- **Consequences:** All docs say **"proxy" (`src/proxy.ts`)**, never "middleware". Sentry 11 is only 3 days old and its defaults collect personal data (D15), so its setup needs a careful first commit.

### D2. Auth check pattern
- **Decision:**
  - **Proxy (`src/proxy.ts`)** does only three things: set the CSP nonce (D5), refresh the session by calling `supabase.auth.getClaims()` (as Supabase's Next.js guide requires), and send an *optimistic* redirect to `/sign-in?next=…` when there are no claims on a protected path. It never grants access.
  - **Every protected page, server action and route handler** calls one of two helpers in `src/server/auth/guards.ts`:
    - `requireUser()`: calls `supabase.auth.getUser()`, which asks the Auth server. It fails if the user was deleted or the session is gone. It then reads `getClaims()` for `aal` and `amr`. If `aal = 'aal1'` and the user has a verified factor (`user.factors`, from the Auth server, not from the cookie), it redirects to `/auth/mfa` (pages) or refuses (actions and handlers). Returns `{ supabase, user, claims }`.
    - `requireUser(options?)` takes `{ allowPendingMfa, allowPendingPassword }` (D24.2).
    - `requireRecentSignIn()`: runs `requireUser()`, then requires that the newest `amr[].timestamp` is **≤ 10 minutes old** (D9).
  - `getSession()` is never used on the server. The review checklist already flags it.
- **Why:** Rule 3 and NFR-3. Next.js's own proxy docs say to verify auth inside each Server Function, because a matcher change can silently skip it. `getClaims()` only checks the JWT locally, so a signed-out or deleted user's access token stays valid until it expires (`jwt_expiry` 3600 s). `getUser()` closes that gap for every protected request. The cost is one Auth round-trip per protected request, and security wins over speed here. `user.factors` in the session cookie is not signed, so the MFA decision must come from the Auth server (FR-58).
- **Alternatives considered:** `getClaims()` only: faster, but revoked sessions keep working for up to an hour and the MFA check would trust cookie data. A custom access-token hook adding an `mfa_enabled` claim: more moving parts. Worth revisiting only if latency matters for an app.
- **Consequences:** Protected pages render dynamically (they must anyway, D5). Forgetting the guard is the main risk. D18 adds a test that calls every action and handler while signed out.

### D3. Rate limiting
- **Decision:** Use a **Postgres fixed-window limiter**:
  - A table `private.rate_limits (key text, window_start timestamptz, count int, primary key (key, window_start))`, with RLS on and no policies.
  - A function `public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean`: `security definer`, `set search_path = ''`, EXECUTE revoked from `public`, `anon` and `authenticated` and granted only to `service_role`. It upserts the counter atomically and deletes rows older than 24 h.
  - It is called from `src/server/security/rate-limit.ts` through the service-role client. Keys are `"<action>:ip:<hmac(ip)>"`, `"<action>:email:<hmac(lower(email))>"` and `"<action>:user:<hmac(uid)>"`, HMAC-SHA256 with `RATE_LIMIT_HMAC_SECRET` (D24). The IP comes from `x-forwarded-for`, which Vercel overwrites so it can't be spoofed.
  - **Fail closed:** if the limiter errors, the action is refused.

  | Action | Per IP | Per email / user |
  | --- | --- | --- |
  | `signIn` | 20 / 10 min | 10 / 15 min (email) |
  | `signUp` | 5 / hour | 3 / hour (email) |
  | `requestMagicLink` | 10 / hour | 3 / hour (email) |
  | `requestPasswordReset` | 10 / hour | 3 / hour (email) |
  | `verifyMfaSignIn`, `confirmMfaEnrollment`, `disableMfa` | 30 / 15 min | 5 / 5 min (user) |
  | `reauthenticateWithPassword` | 20 / 10 min | 5 / 15 min (user) |
  | `changePassword`, `updatePasswordFromReset`, `setInitialPassword` | – | 5 / hour (user) |
  | Data export (`/account/export`) | – | 5 / hour (user) |
  | `deleteAccount` | – | 5 / hour (user) |
  | `updateDisplayName` | – | 30 / hour (user) |

  Extra rows added in D24.14 (`startMfaEnrollment`, `signInWithGoogle`, `/auth/confirm`, `/auth/callback`).

  A limited request always gets the same plain message ("Too many attempts. Please try again in a few minutes."), whether or not the email has an account (NFR-12).
- **How this interacts with Supabase Auth's own limits:**
  - Supabase's limits are per IP: sign-up and sign-in endpoints 30 / 5 min, `/token` (password sign-in, refresh) 150 / 5 min, verify 30 / 5 min, MFA challenge/verify 15 / min (not changeable). Per user: one OTP, magic link, confirmation or reset per 60 s. With custom SMTP, emails per project per hour can be configured.
  - Because our calls come from the server, **Supabase sees Vercel's egress IPs, not the user's.** Its per-IP limits therefore act as an app-wide ceiling.
  - The template keeps Supabase's defaults. Our limiter provides the per-user limits, and Supabase's limits plus CAPTCHA (D4) protect anyone calling the Supabase API directly with the public publishable key, which bypasses our server actions entirely.
  - The template sets `auth.rate_limit.email_sent = 30` per hour, so Supabase can't send much faster than Resend's 100/day allows.
  - The fix for the shared-IP ceiling is Supabase's `Sb-Forwarded-For` header. It needs a secret key on auth calls and a dashboard setting, and it is not in v1 (open question U3).
- **Why:** Free, no new service or dependency, and the data stays in the same backed-up database (NFR-10, NFR-21). Service role is justified under rule 6: no user-supplied IDs, and the table must not be writable by users.
- **Alternatives considered:**
  - Upstash Redis free tier (500K commands/month, 256 MB, 1 free DB): adds an account and env vars to every app for small benefit.
  - Vercel WAF rate limiting: available on Hobby, but only **1 rule per project**, IP or JA4 keys only, and a 10 min maximum window. It can't key on email.
  - Granting `rate_limit_hit` to `anon`: an attacker could call it directly to use up someone else's email budget.
- **Consequences:** Each limited action costs one extra DB round-trip. The limiter table is listed as a non-user-data table in the registry (D12). NFR-10 tests run against local Supabase.

### D4. Turnstile on auth forms
- **Decision:** Use **Supabase Auth's built-in CAPTCHA with provider `turnstile`** (`[auth.captcha]` in `supabase/config.toml`, secret via `env(TURNSTILE_SECRET_KEY)`).
  - Server actions pass the token through as `options.captchaToken` and **do not call siteverify themselves**, because Turnstile tokens are single-use and valid for 300 s.
  - From the Supabase Auth source, CAPTCHA covers `/signup`, `/recover`, `/resend`, `/magiclink`, `/otp` and `/token` with `grant_type=password`. It skips refresh, PKCE and id_token grants.
  - The re-authenticate form (D9) uses `signInWithPassword`, so it gets a widget too.
  - Zod rejects a missing token before anything else runs.
  - `src/server/security/turnstile.ts` has a `verifyTurnstile()` siteverify helper for **non-auth** public forms that apps add later (rule 14). No form in the Template uses it.
  - The widget is a small in-house client component (`src/components/auth/turnstile.tsx`) that loads `https://challenges.cloudflare.com/turnstile/v0/api.js` with the request nonce. Cloudflare documents that Turnstile then passes the nonce on and works with `'strict-dynamic'`.
  - Tests and CI use Cloudflare's dummy keys: site key `1x00000000000000000000AA` (always passes), secret `1x0000000000000000000000000000000AA`, and dummy token `XXXX.DUMMY.TOKEN.XXXX`. Test secrets reject real tokens. These values live in the CI workflow `env` and the README, **not** in `.env.example` (the placeholder check would flag them).
- **Why:** Only Supabase's CAPTCHA protects the Supabase endpoints that anyone can call with the public publishable key. Checking the token in our server action would only protect our own wrapper (NFR-11, FR-1/3/4/7).
- **Alternatives considered:** Checking the token ourselves with Supabase CAPTCHA off: the bypass above. Checking it in both places: impossible, because tokens are single-use. `@marsidev/react-turnstile`: an extra dependency for about 40 lines, and nonce control is easier in-house.
- **Consequences:** Local sign-in needs internet, because local GoTrue calls Cloudflare's siteverify. Turnstile Free allows 20 widgets per account and 10 hostnames per widget. Each app adds `localhost`, its `*.vercel.app` host and its domain. Supabase sends our server's IP as `remoteip`. That is harmless as far as we know, but unverified.

### D5. Security headers and nonce CSP
- **Decision:**
  - `src/proxy.ts` makes a nonce per request (`btoa(crypto.randomUUID())`). It sets `Content-Security-Policy` on both the request (Next.js reads the nonce from it and tags its own scripts) and the response, and passes `x-nonce` to the app.
  - The root layout reads `(await headers()).get('x-nonce')` and hands it to `next-themes` (`nonce`), the Turnstile loader and any `<Script>`.
  - Production policy (`src/server/security/csp.ts`, unit-tested):
    ```
    default-src 'self';
    script-src 'self' 'nonce-{N}' 'strict-dynamic' https://challenges.cloudflare.com;
    style-src-elem 'self' 'nonce-{N}';
    style-src-attr 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src 'self';
    frame-src https://challenges.cloudflare.com;
    form-action 'self' {SUPABASE_URL} https://accounts.google.com;
    frame-ancestors 'none'; base-uri 'self'; object-src 'none'; manifest-src 'self'; worker-src 'self';
    upgrade-insecure-requests
    ```
  - Dev adds `'unsafe-eval'` to `script-src`, which React needs in development only.
  - **Styles (decided with the user, 2026-09-26):** `<style>` elements need the nonce (`style-src-elem`); only inline `style=""` attributes are allowed (`style-src-attr 'unsafe-inline'`), because Radix/shadcn set them and attributes can't carry nonces. Attribute-only styles can't use selectors, which blocks CSS attribute-selector data theft.
  - **Fallback:** if a library injects un-nonced `<style>` tags that can't be fixed (to check in week 1: Sonner, next/font, next-themes), switch to `style-src 'self' 'unsafe-inline'` and record it in `docs/decisions/`. This is a stated loosening under rule 16; scripts stay nonce-only either way (NFR-13).
  - **What keeps inline styles low-risk (both variants):** `img-src`/`font-src`/`connect-src` stay same-origin (any new outside host is a security change); ESLint `react/no-danger` plus rule 10; user input is never placed in `style` props or `<style>`; brand colours are Zod-checked hex (D16).
  - `form-action` includes the Supabase and Google origins because Chrome applies `form-action` to redirects after a form POST (the Google button before hydration). This must be checked by the "no CSP violations" e2e step.
  - Static headers go in `next.config.ts` `headers()` for every path:
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (preload is a per-app domain decision)
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()`
    - `X-Frame-Options: DENY`
    - `Cross-Origin-Opener-Policy: same-origin`
  - Proxy matcher: everything except `_next/static`, `_next/image`, `monitoring` (Sentry tunnel), metadata files (`favicon.ico`, `icon*`, `apple-icon*`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `opengraph-image*`) and prefetch requests (the `missing` headers from the Next docs).
- **Compatibility:**
  - Sentry: bundled, sends through the same-origin tunnel (D15), so `'self'` is enough.
  - Vercel Web Analytics: `/_vercel/insights/*` is same-origin and injected by our nonce'd bundle, so `strict-dynamic` covers it.
  - next-themes: `nonce` prop (covers its inline script; check its style handling under `style-src-elem`).
  - Turnstile: nonce plus a host fallback for CSP2 browsers.
  - Google avatars: not shown in v1.
- **Consequences:**
  - **Every page renders dynamically.** No static generation, ISR or CDN page caching, and PPR/`cacheComponents` stay off (the Next docs say PPR doesn't work with nonces). This uses Vercel Hobby Active CPU (4 CPU-hrs/month included). That's fine at template scale, but apps should watch it.
  - Auth responses also send `Cache-Control: private, no-store`, per Supabase's warning about cached `Set-Cookie`.
  - There is no CSP reporting endpoint in v1. The e2e journey checks the console for violations instead (NFR-13).
  - Experimental SRI hashes (Next's alternative to nonces) were rejected because the feature is experimental.

### D6. Server-only code, env validation, bundle scan
- **Decision:**
  - Every module under `src/server/**` starts with `import "server-only"`. The service-role client (`src/server/supabase/admin.ts`) and all secrets live only there.
  - Env vars are validated by Zod:
    - `src/lib/env/schema.ts`: pure schemas, no values.
    - `src/server/env.ts`: parses `process.env` once, server-only.
    - `src/lib/env/public.ts`: `NEXT_PUBLIC_*`, each referenced literally so Next inlines it.
  - `next.config.ts` imports the schema and parses at build time. The error lists **variable names only**, never values (FR-52).
  - After `next build`, `scripts/check-bundle-secrets.sh` searches `.next/static/**` and pre-rendered `.next/server/**/*.html` for the actual values of `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and `SENTRY_AUTH_TOKEN`, plus the patterns `sb_secret_` and `"role":"service_role"`. Any match fails the build (NFR-4).
  - One deliberate bad import (a client component importing `@/server/env`) is done once, and the build failure is recorded in the PR (NFR-4 measure).
- **Env vars (fixed names):**

  | Name | Public? | Purpose |
  | --- | --- | --- |
  | `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL (FR-26). If unset on Vercel Preview, the app falls back to `https://${VERCEL_BRANCH_URL}` |
  | `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API URL |
  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | `sb_publishable_…` (the legacy anon key is deprecated by end of 2026) |
  | `RATE_LIMIT_HMAC_SECRET` | **secret** | HMAC key for rate-limit keys (D24) |
| `SUPABASE_SECRET_KEY` | **secret** | `sb_secret_…`, bypasses RLS; only `src/server/supabase/admin.ts` uses it |
  | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Widget |
  | `TURNSTILE_SECRET_KEY` | **secret** | Used by Supabase CAPTCHA (via `config.toml` `env()`) and `verifyTurnstile()` |
  | `EMAIL_TRANSPORT` | server | `resend` or `mailpit`; `mailpit` is refused when `VERCEL_ENV=production` |
  | `RESEND_API_KEY` | **secret** | Welcome email; also used as the SMTP password in `config.toml` |
  | `EMAIL_FROM` | server | e.g. `App <onboarding@resend.dev>` (FR-27 placeholder) |
  | `MAILPIT_URL` | server | `http://127.0.0.1:54324` locally and in CI |
  | `NEXT_PUBLIC_SENTRY_DSN` | public | Sentry DSN |
  | `SENTRY_AUTH_TOKEN` | **secret** | Source-map upload at build (Vercel only; optional locally) |
  | `SENTRY_ORG`, `SENTRY_PROJECT` | server | Build plugin |
  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **secret** (read only by `supabase/config.toml` `env()`) | Google provider |
- **Why:** Rules 5–8, NFR-4, NFR-5, FR-52. `server-only` can't be imported in `next.config.ts`, hence the split between schema and parser.
- **Alternatives considered:** `@t3-oss/env-nextjs` (0.13.11): works, but it's one more dependency (rule 23). A regex-only bundle scan: misses keys that don't match a pattern. Scanning for actual values catches every real key.
- **Consequences:** CI must have all env vars set (local-stack values and dummy keys) for the build to pass. Every new variable goes into both the schema and `.env.example`.

### D7. Emails
- **Decision:** **Supabase sends auth emails through Resend SMTP using templates built from React Email. The app sends only the welcome email.**
  - Templates live in `src/emails/`: `verify-email.tsx`, `magic-link.tsx`, `reset-password.tsx`, `welcome.tsx`, and `components/email-layout.tsx`, all branded from `appConfig` (D16).
  - `npm run email:build` runs `email export` (react-email CLI). Its `PreviewProps` contain Supabase Go-template placeholders. A small `scripts/email-build.mjs` then copies the output to `supabase/templates/{confirmation,magic_link,recovery}.html`, which is committed.
  - CI re-runs the build and fails on `git diff --exit-code supabase/templates` (templates must stay in sync with config).
  - `config.toml` maps them with `[auth.email.template.<name>] subject, content_path`.
  - **Links use the SSR token-hash pattern:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|magiclink|recovery>`. `/auth/confirm` calls `verifyOtp` (it works in any browser, with no PKCE verifier). The `next` path for magic links is kept in a short-lived HttpOnly `auth_next` cookie and re-checked by the safe-redirect function.
  - Logos in emails use `{{ .SiteURL }}/brand/logo.png` (PNG, because email clients handle SVG poorly).
  - **Hosted Supabase config:** `supabase config push` sends auth settings from `config.toml`. The CLI source confirms it covers email templates, SMTP and CAPTCHA.
    - Local SMTP stays off (Mailpit catches mail). Production values go in a `[remotes.production]` block (`project_id`, `site_url`, redirect URLs, `[auth.email.smtp]` with `host = "smtp.resend.com"`, `port = 465`, `user = "resend"`, `pass = "env(RESEND_API_KEY)"`, sender).
    - The block ships commented out, because the CLI rejects placeholder project IDs. The README step fills it in.
    - **Pushing without the remote block would clear production SMTP**: the CLI sends an empty host when SMTP is disabled.
  - **Welcome email (FR-30):**
    - `/auth/confirm`, `/auth/callback` and `signIn` each call `rpc('claim_welcome_email')`. This `security definer` function updates `profiles.welcome_email_sent_at` from null to `now()` for `auth.uid()` only and returns true if it made the change.
    - If it returns true, the app renders `welcome.tsx` and sends it. If sending fails, the app releases the claim (sets it back to null) and reports to Sentry, so the next sign-in retries.
    - Result: exactly one email, and never before a verified sign-in, because unverified users can't sign in.
  - **Transport** (`src/server/email/send.ts`): `resend` uses the Resend SDK. `mailpit` sends `POST {MAILPIT_URL}/api/v1/send` (the Mailpit source has this endpoint), with no SMTP dependency.
  - **Local:** the CLI's `[local_smtp]` catcher is **Mailpit** (image `axllent/mailpit`, UI on port 54324; the old `[inbucket]` key is deprecated). All auth and welcome emails land there, and e2e reads them through Mailpit's API.
  - **Deployed throwaway app (no domain):** `onboarding@resend.dev` **can only send to the Resend account owner's own address** (Resend docs). So the deployed e2e run:
    - signs up with `E2E_EMAIL` set to that owner address;
    - uses a `manual` mailbox adapter, which waits up to 5 min for the Builder to paste each link into a git-ignored `playwright/.manual-link` file;
    - deletes the account at the end, so the address can be reused.

    Resend's `delivered@resend.dev` test addresses don't help, because the test sender can't reach them and they still count against quota. **Real emails per deployed run: 3** (verify, welcome, reset). With a manual magic-link check it's 4. That fits NFR-22 (Resend Free: 3,000/month, 100/day). CI sends 0 real emails.
- **Why:** FR-29 and the brief say "Resend set as Supabase's SMTP", which rules out the Send Email hook. Building the templates keeps FR-26/28 true: the config file is the single source.
- **Alternatives considered:**
  - Supabase "Send Email" auth hook calling our route handler (render React Email, send via Resend API): contradicts FR-29, adds a public endpoint that needs a signature check, and sign-ups fail when the app is down. Rejected.
  - Pasting templates into the dashboard by hand: slow and easy to get wrong for metric 1.
  - Mailtrap-style inbox for deployed runs: another account, not in the brief.
- **Consequences:** Changing the config file needs `npm run email:build` and then `supabase config push` for hosted auth emails (in the README checklist). Previews' auth-email links point at the production `site_url`. Mailpit's send API being enabled in the CLI's container is **unverified**: check in week 1, and the fallback is exposing `smtp_port`.

### D8. MFA (TOTP)
- **Decision:**
  - Use Supabase TOTP. It is **free and enabled on all projects** (Supabase TOTP docs; the pricing page lists "Basic MFA" on Free, while phone MFA is a $75/month add-on).
  - Enroll: `mfa.enroll({ factorType: 'totp' })` returns an SVG QR data URI (allowed by `img-src data:`) and the secret for manual entry. Any stale unverified factor is removed first.
  - Confirm with `mfa.challengeAndVerify`. The UI allows one verified factor.
  - **Enforcement:**
    1. `requireUser()` (D2) refuses `aal1` when a verified factor exists.
    2. **Every user-data table has a restrictive RLS policy:** `as restrictive for all to authenticated using (private.mfa_satisfied())`. `private.mfa_satisfied()` is a `security definer` function with `set search_path = ''`. It returns true if `auth.jwt()->>'aal' = 'aal2'` or the user has no verified row in `auth.mfa_factors`. This is Supabase's documented "opted-in users" rule wrapped in a function, so `authenticated` doesn't need direct access to `auth.mfa_factors`.
  - Code attempts are limited by D3 (5 per 5 min per user) on top of Supabase's fixed 15/min per IP.
  - Disabling (FR-59): `requireRecentSignIn()` plus a fresh challenge-and-verify with a current code, then `mfa.unenroll`. Supabase itself requires aal2 to unenroll.
  - **Lost authenticator:** Supabase documents no recovery method. The support path is: the Builder deletes the factor in the Supabase dashboard (Auth → Users) or with `auth.admin.mfa.deleteFactor`, after checking identity through the support email. Written up in the launch checklist and README.
  - The Supabase Auth source (master, 2026-09-26) contains undocumented `/factors/recovery-codes` endpoints. They are out of scope for v1 (PRD) and worth revisiting when they're documented.
- **Why:** FR-57–59. Checking in two places means a missed server guard still can't read data.
- **Alternatives considered:** The "all users need aal2" policy: wrong, because MFA is optional. Putting the SQL on `auth.mfa_factors` directly in each policy: needs a grant on an `auth` table. Phone MFA: paid.
- **Consequences:** Every new user-data table needs the restrictive policy. The feature checklist and RLS coverage test enforce this (D18).

### D9. Re-authentication (FR-56)
- **Decision:**
  - "Recent" means **the newest `amr[].timestamp` in the verified JWT is ≤ 10 minutes old**. Supabase documents this timestamp as when that method was used, and it is not changed by token refresh.
  - If the check fails, the user is sent to `/auth/reauthenticate?next=<same-site path>`.
  - Users with a password identity re-enter their password (`reauthenticateWithPassword` → `signInWithPassword` with a Turnstile token, which creates a fresh session).
  - Users with no password (Google-only) click "Continue with Google" (a fresh OAuth round-trip through `/auth/callback`).
  - MFA users then pass `/auth/mfa` again, because the new session is aal1.
  - Also set `auth.email.secure_password_change = true` as defence in depth. From GoTrue's source, a password update on a session older than **24 h** then needs a reauthentication nonce, which protects direct API calls. Our 10-minute flow always creates a fresh session, so the nonce email is never needed and no fifth template is added.
- **Why:** The PRD says the RFC sets the mechanism. A single timestamp rule covers password, Google and magic-link users the same way.
- **Alternatives considered:** Supabase's `reauthenticate()` nonce: always emails a code (quota plus a template the PRD doesn't list), and its window is fixed at 24 h. Using session `iat`: changes on every refresh, so it's wrong. "Current password" only: doesn't work for Google-only users.
- **Consequences:** Google may re-consent silently if the Google session is live. The PRD accepts "signing in again", and forcing a Google login prompt is not in v1.

### D10. Email-first sign-up closes pre-account takeover (NFR-26)
*(Revised by the PM with the user, 2026-09-26. The first draft deleted unconfirmed accounts on re-sign-up; that still let whoever signed up last set the password the real owner then confirms.)*
- **Decision: verify the email first, then set the password.**
  - `signUp` takes **email + Turnstile only** and calls `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken, emailRedirectTo } })`. For a new email Supabase creates an unconfirmed user **with no password** and sends the sign-up confirmation email. For an existing email it sends a sign-in link. The page shows the same message in every case (NFR-12).
  - The link goes through `/auth/confirm` (D7), which verifies the email and signs the user in.
  - A user whose only identity is `email` and whose `profiles.password_set_at` is null is sent to **`/auth/set-password`** by `requireUser()` (pages) and refused by actions. `setInitialPassword` (Zod, D22 rule, rate limit) calls `updateUser({ password })`, then `mark_password_set()` (security definer, sets `password_set_at = now()` for `auth.uid()` only).
  - Google users skip this step (they have a `google` identity).
  - Keep automatic identity linking and `enable_manual_linking = false`. Supabase removes unconfirmed identities when linking, and with this flow an unconfirmed account never has a password anyway.
  - No service-role email lookup: `auth_email_status()` is dropped.
- **Why:** Only the person who controls the inbox can ever set the password, so nobody can pre-register a victim's email with a password they know. This closes the password-sign-up, magic-link and Google-linking variants together (NFR-26, rule 15), and removes a service-role use (rule 6).
- **Alternatives considered:**
  - Supabase defaults (the first sign-up's password is kept): an attacker who signs up first keeps a password on an account the owner then confirms.
  - Deleting unconfirmed accounts on re-sign-up (first draft): the last sign-up's password wins, so an attacker signing up between the owner's sign-up and their click still gets in.
  - A pg_cron job deleting unconfirmed users: shrinks the window, doesn't close it.
- **Consequences:**
  - FR-1/FR-2 wording changed in the PRD (approved by the user, 2026-09-26). About +1–2 hrs.
  - `signUp` and `requestMagicLink` both use `signInWithOtp`; only `signUp` sets `shouldCreateUser: true`, and only `signUp` is reachable from the sign-up page.
  - **To verify in week 1:** which template Supabase uses for a new user created by `signInWithOtp` (expected: "confirm sign-up"), and that `type` in the link matches what `/auth/confirm` handles.
  - Tests: an automated test that an unconfirmed account has no usable password; the Google-linking part stays a manual test on the throwaway app (accepted by the PM).

### D11. Magic link never creates accounts (FR-4)
- **Decision:**
  - `signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken, emailRedirectTo } })`.
  - From GoTrue's source, an unknown email returns 422 `otp_disabled` ("Signups not allowed for otp"). Our action turns every outcome (sent, unknown, rate limited by Supabase's 60 s rule) into the same message and status. The action pads its response to a minimum time (about 500 ms) to blunt timing differences.
  - `enable_signup` stays true, for the sign-up page (D10).
- **Why:** FR-4 and NFR-12.
- **Consequences:** Someone calling the Supabase API directly can still tell accounts apart through the 422, but only by solving a Turnstile per try. This is recorded as a residual risk.

### D12. Data model, user-data registry, account deletion
- **Decision:**
  - Only one app table, `public.profiles` (FR-11), plus the private limiter table (D3).
  - `profiles`:
    - Columns: `id uuid primary key references auth.users(id) on delete cascade`, `display_name text null check (char_length(display_name) between 1 and 80)`, `welcome_email_sent_at timestamptz null`, `password_set_at timestamptz null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
    - RLS on. Policies: `select` to `authenticated` using `id = (select auth.uid())`; `update` to `authenticated` using and with check the same; plus the restrictive MFA policy (D8).
    - No insert or delete policy: rows are created by a trigger and removed by cascade.
    - Column privileges: `revoke update on profiles from authenticated; grant update (display_name) on profiles to authenticated`.
    - Trigger `public.handle_new_user()` (security definer, `search_path = ''`) runs `after insert on auth.users` and inserts one row. It fills `display_name` from Google's `raw_user_meta_data->>'full_name'`, trimmed to 80 characters or left null. Metadata is treated as untrusted and always rendered as text. `set_updated_at` trigger.
  - **Registry (`src/server/data/registry.ts`, fixed name):**
    - `USER_DATA_TABLES`: `[{ schema: 'public', table: 'profiles', ownerColumn: 'id' }]`.
    - `NON_USER_DATA_TABLES`: `[{ schema: 'private', table: 'rate_limits', reason: 'hashed keys, 24 h retention' }]`.
    - The coverage test (D18) fails if any table in an app schema (`public`, `private`, and any schema an app adds) is in neither list. It also fails if a `USER_DATA_TABLES` entry lacks an RLS test file, lacks the restrictive MFA policy, or has no `ON DELETE CASCADE` foreign key path to `auth.users`.
  - **Delete account (FR-16):** the `deleteAccount` action runs:
    1. `requireRecentSignIn()`;
    2. Zod checks the typed email against `user.email` (case-insensitive);
    3. rate limit;
    4. `admin.auth.admin.deleteUser(user.id)`, with the id from `getUser()` and never from input;
    5. cascade removes all registry rows;
    6. `signOut({ scope: 'local' })` and redirect to `/?notice=account_deleted` (D24.31).

    Hard delete (no soft delete). Backups keep the data up to the retention period (D14, FR-17 privacy placeholder).
- **Why:** Rule 1, rule 19, NFR-1/2/16. The registry means a forgotten table fails CI instead of being silently left out of the export.
- **Alternatives considered:**
  - A DB-side registry (a comment or table in SQL): harder to use from TypeScript export code.
  - Deleting rows one by one before the auth user: more code than a cascade, and easy to get wrong.
  - Letting users insert their own profile: a race and duplicate rows (FR-11 says exactly one).
- **Consequences:** Every app table holding user data must have a foreign key chain to `auth.users` with cascade, and be added to the registry in the same change (CLAUDE.md checklist).

### D13. Data export (FR-15)
- **Decision:**
  - `GET /account/export` route handler. It runs `requireUser()` and the rate limit, then queries each `USER_DATA_TABLES` entry **with the user's own client (RLS applies, no service role)**.
  - It returns JSON: `{ format: "account-data-export", version: 1, exported_at, app: appConfig.name, account: { id, email, created_at, email_confirmed_at, last_sign_in_at, providers: string[], mfa_enabled: boolean }, data: { "<schema>.<table>": Row[] } }`.
  - It contains no tokens, factor secrets or identities' provider tokens.
  - Headers: `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="<app-slug>-data-<YYYY-MM-DD>.json"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
  - No FR-56 re-auth (the PRD doesn't require it). aal2 applies through `requireUser()`.
- **Why:** A GET download is the simplest thing that works with a plain link and no JS. Other sites can't read the response (no CORS), and cookies are `SameSite=Lax`.
- **Alternatives considered:** A server action returning a blob: awkward for downloads. Emailing a file: uses quota and exposes data by email. ZIP/CSV: JSON is enough for one table.
- **Consequences:** The export test asserts that every registry table appears under `data`, even when empty (NFR-16).

### D14. Backups and restore
- **Decision:**
  - `scripts/backup.sh` runs three `supabase db dump --db-url "$SUPABASE_DB_URL"` passes:
    - `--role-only -f roles.sql`;
    - schema `-f schema.sql`;
    - `--data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f data.sql`. From the CLI source, the data dump **includes the `auth` schema data** (only migration tables are excluded), which covers FR-33.
  - The files are packed with `tar czf` and **encrypted with `age` to a public recipient** (`BACKUP_AGE_RECIPIENT`, a public key stored as a repo *variable*). The private key stays offline with the Builder, so leaking the repo or CI can't decrypt backups.
  - `.github/workflows/backup.yml` runs **daily at 03:17 UTC** plus manually. It uploads `backup-<date>.tar.gz.age` with `actions/upload-artifact` and **`retention-days: 30`**, so expiry is automatic (FR-34).
  - `SUPABASE_DB_URL` is a GitHub **secret** using the **session pooler** connection string (IPv4; direct connections are IPv6-only unless you buy the add-on).
  - It runs in each **app's** repo. The Template ships the workflow disabled (manual trigger only), because it has no hosted DB.
  - **Restore (FR-35):**
    1. Create a new Supabase project.
    2. `age -d` then `tar x`.
    3. `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$NEW_DB_URL"` (Supabase's documented procedure).
    4. Compare row counts with a script query, and check a test user can sign in.
    5. Record the date in `docs/decisions/` and the README.
  - Storage objects are not covered, because the Template ships no bucket (rule 21 applies once an app adds one).
- **Why:**
  - Supabase Free has no backups.
  - GitHub Free private repos include 500 MB artifact storage and 2,000 Actions minutes/month, and a dump job takes about 2 min per day (about 60 min/month).
  - Scheduled workflows are only auto-disabled after 60 days of inactivity in **public** repos.
  - age has one small binary (in Fedora's and Ubuntu's repos) and needs no passphrase in CI.
- **Alternatives considered:** Committing dumps to a private repo: git history never expires, which breaks retention. Cloudflare R2 free tier: another account and more credentials. GPG symmetric: the passphrase would have to live in CI, so a CI leak could decrypt backups.
- **Consequences:**
  - 500 MB is shared by **all** of the account's private repos. 30 copies of a small DB fit, but CI artifacts must be small (Playwright report only on failure, 7-day retention).
  - The DB password sits in GitHub secrets.
  - `supabase db dump` needs a container runtime, which GitHub runners have.
  - Whether a daily `pg_dump` counts as "activity" and stops Free projects pausing after 1 week is **unverified**.

### D15. Sentry
- **Decision:**
  - `@sentry/nextjs` set up with `instrumentation.ts` (`onRequestError`), `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` and `src/app/global-error.tsx`, and `withSentryConfig({ tunnelRoute: '/monitoring', widenClientFileUpload: true })`.
  - **Personal data off explicitly**, because Sentry 11's defaults collect user info, cookies, headers and bodies: `dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false }`.
  - Plus `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb` hooks (`src/lib/observability/scrub.ts`, unit-tested) that:
    - drop `request.cookies`, `headers`, `data` and `query_string`, and all of `user`;
    - strip query strings from every URL (they carry `token_hash` and `code`);
    - redact email-shaped strings and `sb_`/JWT-shaped tokens in messages and extra data.
  - `tracesSampleRate: 0` and no Replay in v1 (errors only).
  - Alerts: Sentry's default issue alert emails the single user (FR-31).
- **Why:** FR-31, NFR-17, rule 20. The tunnel keeps `connect-src 'self'` and gets past ad blockers.
- **Alternatives considered:** No tunnel: `connect-src` would need `*.ingest.sentry.io`, and ad blockers drop events. Tracing on: more URLs holding personal data, for no v1 need.
- **Consequences:** Developer plan (verified): 5k errors/month, 1 user, 30-day lookback, email alerts. The proxy matcher must exclude `/monitoring` (Sentry docs).

### D16. Config file and branding flow
- **Decision:**
  - **`src/config/app.ts`** exports `appConfig`, validated at import by `src/config/schema.ts` (Zod). Fields: `name`, `shortName`, `description`, `supportEmail`, `brand: { primary, primaryForeground, primaryDark?, primaryForegroundDark? }` (hex, `/^#[0-9a-f]{6}$/i`), `logo: { svg: '/brand/logo.svg', png: '/brand/logo.png', alt }`, `legal: { entityName }` (placeholder).
  - **The URL is not in the file.** `getSiteUrl()` in `src/server/site-url.ts` (server-only, D24) reads `NEXT_PUBLIC_SITE_URL` (falling back to the Vercel preview URL) (FR-26).
  - Where the values go:
    - The root layout writes `:root{--primary:…;--primary-foreground:…}` (and `.dark` overrides) in a nonce'd `<style>` that overrides shadcn's CSS variables in `globals.css`. Hex values are Zod-validated, so no CSS can be injected.
    - `src/app/manifest.ts` gets `name`, `short_name` and `theme_color`.
    - `src/app/opengraph-image.tsx` (`next/og`) gets name, description and colors.
    - Emails get them at build time (D7).
    - Legal pages and the footer `mailto:` link use them.
  - Logo files are the only brand assets outside the config and live in `public/brand/`.
  - A unit test searches the source for the config values (FR-26 "no hard-coded copy").
- **Why:** FR-25–28, FR-51. Hex works in email clients, manifests and OG images. OKLCH does not.
- **Alternatives considered:** A JSON config: loses type checking. Brand colors as Tailwind theme tokens at build time: needs a rebuild step and duplicates `globals.css`.
- **Consequences:** Rebranding means editing the config, swapping the two logo files, then `npm run email:build` and `supabase config push`.

### D17. API style (fixed operation names)
- **Decision:** Server actions return `ActionResult<T = void> = { ok: true; message?: string; data?: T }` (D24.21; shown here in its original form: `{ ok: true; message?: string }` | { ok: false; error: string; fieldErrors?: Record<string, string[]> }`. Every action validates input with Zod, checks auth (except the signed-out auth actions), and applies its rate limit.

  | Kind | Name | Location | FR |
  | --- | --- | --- | --- |
  | Server action | `signUp` (email + Turnstile only), `setInitialPassword`, `signIn`, `requestMagicLink`, `requestPasswordReset`, `updatePasswordFromReset`, `signInWithGoogle`, `signOut`, `reauthenticateWithPassword` | `src/server/actions/auth.ts` | FR-1–8, 56 |
  | Server action | `startMfaEnrollment`, `confirmMfaEnrollment`, `verifyMfaSignIn`, `disableMfa` | `src/server/actions/mfa.ts` | FR-57–59 |
  | Server action | `updateDisplayName`, `changePassword`, `deleteAccount` | `src/server/actions/account.ts` | FR-12, 14, 16 |
  | Route handler | `GET /auth/confirm` (verifyOtp by `token_hash`, `type` ∈ signup/magiclink/recovery/email; recovery → `/reset-password`) | `src/app/auth/confirm/route.ts` | FR-2, 4, 8, 30 |
  | Route handler | `GET /auth/callback` (OAuth PKCE `exchangeCodeForSession`; cancel → `/sign-in?error=oauth_cancelled`) | `src/app/auth/callback/route.ts` | FR-5, 30, 56 |
  | Route handler | `GET /account/export` | `src/app/account/export/route.ts` | FR-15 |
  | Route handler (generated) | `/monitoring` Sentry tunnel | `withSentryConfig` | FR-31 |
  | Metadata routes | `manifest.ts`, `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `icon.tsx`, `apple-icon.tsx` | `src/app/` | FR-24, 25 |
  | DB trigger | `handle_new_user` (after insert on `auth.users`), `set_updated_at` | migrations | FR-11 |
  | DB function (authenticated) | `claim_welcome_email()`, `mark_password_set()` | migrations | FR-1, FR-30 |
  | DB function (service_role only) | `rate_limit_hit(p_key, p_max, p_window_seconds)`, `release_welcome_email(p_user_id)` (D24) | migrations | NFR-10, FR-30 |
  | DB function (internal) | `private.mfa_satisfied()` | migrations | FR-58 |

  **Pages (fixed routes):** `/`, `/privacy`, `/terms`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/auth/error`, `/auth/mfa`, `/auth/set-password`, `/auth/reauthenticate`, `/dashboard`, `/settings` (one page with sections Profile, Password, Two-step sign-in, Your data, Delete account).
  - Protected: `/dashboard`, `/settings`, `/auth/reauthenticate`, `/auth/set-password` (signed in, password not yet set).
  - `/auth/mfa` requires an aal1 session.
  - `/reset-password` requires a recovery session.
  - All redirect targets (`next`) go through `safeRedirectPath()` in `src/lib/security/safe-redirect.ts`. It allows only paths starting with a single `/`, rejects `//`, `/\`, schemes and encoded variants (NFR-8), and falls back to `/dashboard`.
- **Why:** Forms use server actions (progressive enhancement, built-in Origin check). Route handlers only where something outside the app calls in: email links, OAuth redirects, file downloads. DB functions only where atomicity or privilege boundaries need them.
- **Alternatives considered:** A REST `/api/*` layer: duplicates the actions and doubles the public surface. Supabase Edge Functions: another runtime to secure and deploy.
- **Consequences:** Server-action IDs are public endpoints. The signed-out refusal test (D18) calls every exported action.

### D18. Testing and CI
- **Decision:**
  - **Unit (Vitest, `tests/unit`):** Zod schemas, `safeRedirectPath`, CSP builder, Sentry scrubber, config schema, env schema, rate-limit key building, email render snapshot.
  - **RLS and DB (Vitest project `rls`, `tests/rls`, local Supabase):**
    - Setup creates users A and B with `auth.admin.createUser({ email_confirm: true })` (local secret key only) and signs them in with supabase-js on the publishable key. So tests go through PostgREST, grants and RLS exactly as the app does.
    - Per registry table: B and anon cannot select, update or delete A's rows.
    - An aal1 session of a user with MFA can't read their own rows. (Tests enroll a TOTP factor and generate codes with a tiny RFC 6238 helper in the test code, no new dependency.)
    - Catalog tests (`postgres` client on `127.0.0.1:54322`): RLS on for every table in app schemas (NFR-1), registry completeness (D12), restrictive policy present, cascade FK present, service-role-only functions not executable by `anon` or `authenticated`.
  - **Signed-out refusal test (NFR-3):** an integration test imports every export of `src/server/actions/*` and calls each with an empty cookie jar (mocking `next/headers`), expecting `{ ok: false }` or a redirect. HTTP tests hit every route handler signed out.
  - **E2E (Playwright, `tests/e2e`):**
    - Runs against `next build && next start` with local Supabase and Turnstile dummy keys.
    - The mailbox adapter reads Mailpit `GET /api/v1/search?query=to:"…"` then `GET /api/v1/message/{id}`.
    - Journey: sign up → verify → welcome received → sign in → reset → MFA on/off → export → delete (FR-39).
    - Also: header check on every route (NFR-13), CSP-violation console listener, cookie flags and empty `localStorage`/`sessionStorage` (NFR-14), axe on shell pages (NFR-23), enumeration checks (NFR-12).
    - `E2E_TARGET=deployed` switches `baseURL` and the mailbox to `manual` (D7).
  - **CI (`.github/workflows/ci.yml`, on push and PR, `concurrency` cancel-in-progress, `paths-ignore: ['docs/**', '**/*.md']`)** has three jobs:
    1. `checks`: `npm ci`, `scripts/check-env-example.sh`, lint, format check, typecheck, unit tests, `npm audit --audit-level=high`, `npm run email:build` + diff.
    2. `secrets`: gitleaks CLI 8.30.1 (pinned release, checksum-verified) running `gitleaks git`. It's free for personal repos without the action's licence question, and it's the same tool as the hook.
    3. `integration`: `supabase/setup-cli@v1` (version from `package.json`), then `supabase start -x studio,imgproxy,realtime,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta`, `supabase db reset`, the `rls` project, `next build`, `check-bundle-secrets.sh`, `next start`, and Playwright (Chromium). The report is uploaded on failure only, with 7-day retention.
  - Actions are pinned by commit SHA.
  - **Dependabot (`.github/dependabot.yml`):** `npm` and `github-actions` weekly, with minor and patch updates grouped.
- **Why:** FR-37–42, NFR-1–3, NFR-13/14/23, metric 2 and 3. Going through PostgREST with real users catches missing grants and column privileges that SQL-only pgTAP tests would miss.
- **Alternatives considered:** pgTAP (`supabase test db`) for RLS: fast, but it bypasses the API grant layer and adds a second test language. Keep it available for apps. Hosted Supabase branch for CI: paid.
- **Consequences:**
  - Estimated **10–12 CI minutes per push** (unverified until the first runs). Against 2,000 free minutes/month, that's about 150 pushes plus about 60 backup minutes per app. Docs-only pushes skip CI.
  - Local sign-in and CI e2e need internet for Turnstile siteverify.
  - Adds one devDependency (`postgres`) for catalog access.

### D19. Deployment, migrations, rollback, free-tier pausing
- **Decision:**
  - **Vercel Hobby.**
    - Production env vars are set on Production.
    - Preview uses the same Supabase project (open question U2) with Vercel Authentication on previews (included in Hobby).
    - The Supabase redirect allow-list adds `https://*-<vercel-scope>.vercel.app/**` for previews.
  - **Migrations:**
    - Forward-only files in `supabase/migrations` (rule 22).
    - Applied **by the Builder from their machine**: `npx supabase link --project-ref …` then `npx supabase db push`, **before** promoting code that needs them. Changes are expand-then-contract, so the previous deploy keeps working (NFR-19).
    - Types via `npx supabase gen types typescript --local > src/lib/types/database.types.ts` (FR-43).
  - **Rollback (FR-36):**
    - Vercel Instant Rollback. On Hobby it can only go back to the **immediately previous** production deployment.
    - The rolled-back build keeps its **original** env vars.
    - Auto-assignment of production domains turns off until "Undo Rollback" or `vercel promote`.
    - Bad code is fixed forward with a new commit; the database is never rolled back.
  - **Pausing:**
    - Supabase Free pauses projects after **1 week of inactivity** and allows **2 active projects**.
    - The throwaway app is deleted after sign-off, so it doesn't matter there.
    - For real apps, the daily backup job *may* count as activity (unverified). The launch checklist tells apps to check the pause state.
- **Why:** Brief (Template never deployed) and rules 21–22. Running `db push` from GitHub would need `SUPABASE_ACCESS_TOKEN`, an **account-wide** personal token, stored in GitHub. That's too much reach for a template.
- **Alternatives considered:** A GitHub Action `db push` on merge: automatic, but it's the token risk above. It's a per-app option later. A separate staging Supabase project for previews: uses the second free project slot.
- **Consequences:** The README "start a new app" list gains `supabase link`, `db push` and `config push` steps (FR-45). The Hobby non-commercial rule is a per-app decision.

### D20. Folder structure (fixed names for all docs)
```
src/
  proxy.ts                         # nonce + session refresh + optimistic redirects (not the security check)
  instrumentation.ts, instrumentation-client.ts
  app/
    layout.tsx, globals.css, not-found.tsx, error.tsx, global-error.tsx
    manifest.ts, robots.ts, sitemap.ts, opengraph-image.tsx, icon.tsx, apple-icon.tsx
    (public)/page.tsx, (public)/privacy/page.tsx, (public)/terms/page.tsx
    (auth)/sign-in, sign-up, forgot-password, reset-password  (page.tsx each)
    auth/error/page.tsx, auth/mfa/page.tsx, auth/set-password/page.tsx, auth/reauthenticate/page.tsx
    auth/confirm/route.ts, auth/callback/route.ts
    (app)/layout.tsx (requireUser), (app)/dashboard/page.tsx, (app)/settings/page.tsx
    account/export/route.ts
  components/ui/        # shadcn (generated)
  components/layout/    # site-header, site-footer, theme-provider
  components/auth/      # forms, turnstile.tsx
  components/settings/  # settings sections
  config/app.ts, config/schema.ts
  emails/               # React Email templates + components/email-layout.tsx
  lib/                  # isomorphic, no secrets
    env/schema.ts, env/public.ts
    security/safe-redirect.ts
    validation/auth.ts, validation/account.ts   # Zod schemas shared by forms and actions
    observability/scrub.ts
    types/database.types.ts (generated), utils.ts (shadcn cn)
  server/               # every file: import "server-only"
    env.ts
    supabase/server.ts (user client, HttpOnly cookie options), supabase/admin.ts (secret key)
    auth/guards.ts (requireUser, requireRecentSignIn)
    actions/auth.ts, actions/mfa.ts, actions/account.ts
    security/rate-limit.ts, security/turnstile.ts, security/csp.ts
    email/send.ts, email/welcome.ts
    data/registry.ts, data/export.ts
    errors.ts (logError → Sentry; toUserMessage)
    site-url.ts (getSiteUrl, D24)
supabase/config.toml, supabase/migrations/, supabase/templates/ (generated, committed)
tests/unit/, tests/rls/, tests/e2e/
scripts/check-env-example.sh, check-bundle-secrets.sh, email-build.mjs, backup.sh
sentry.server.config.ts, sentry.edge.config.ts, next.config.ts
.github/workflows/ci.yml, backup.yml; .github/dependabot.yml
```
- **Added during design (D24 review):** `vercel.json` (Ignored Build Step for `dependabot/*`), `scripts/check-supabase-env.ts`, `src/lib/messages.ts` (message catalogue keyed by the UX/API message IDs), `src/app/(app)/loading.tsx`.
- **Why:** `src/server/**` vs `src/lib/**` makes the server-only boundary visible in every import path (rule 5). Route groups keep URLs as in D17.
- **Consequences:** An ESLint `no-restricted-imports` rule blocks `@/server/*` from files containing `"use client"`, so the mistake is caught at lint time, before `server-only` catches it at build time.

### D21. Session cookies and no browser Supabase client
- **Decision:**
  - The Supabase server client uses `cookieOptions: { httpOnly: true, secure: <true unless the site URL is plain http on a non-localhost host>, sameSite: 'lax', path: '/' }`.
  - **There is no browser Supabase client in v1.** All auth and data calls go through server actions and route handlers.
- **Why:** NFR-14 and rule 17. **`@supabase/ssr` 0.12.7's default cookie options are `httpOnly: false` with no `secure`** (read from the package source), because its browser client needs to read the cookie. `SameSite=Lax` (not Strict) is needed so the email-link and Google redirects arrive with cookies.
- **Alternatives considered:** Keeping the defaults and using the browser client: tokens become readable by JS, which contradicts NFR-14.
- **Consequences:** Apps that later want Realtime or client-side queries need a deliberate decision (a token-passing pattern or loosening HttpOnly). The CSP `connect-src 'self'` reflects this.

### D22. Password rule
- **Decision:**
  - Minimum **12** characters, maximum **72 UTF-8 bytes** (bcrypt limit, D24.15), no character-class rules.
  - Set in Supabase (`minimum_password_length = 12`) and mirrored in `src/lib/validation/auth.ts`.
  - Leaked-password (HaveIBeenPwned) protection is **Pro-only**, so it's not in v1.
- **Why:** The PRD leaves the rule to the RFC. Long-over-complex is the modern guidance, and no paid features are allowed.
- **Consequences:** The e2e test password must be 12 or more characters.

### D23. Podman on Fedora 44
- **Decision:**
  - Support both runtimes.
  - **Docker:** Docker Engine (`dnf` from Docker's Fedora repo, or `moby-engine`) with the user in the `docker` group.
  - **Podman** (Supabase lists it as a supported Docker-compatible runtime):
    - `systemctl --user enable --now podman.socket`;
    - `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock` in the shell profile.
  - Known issue (supabase/cli #3099, Fedora 40, rootless Podman, closed): permission errors. Workarounds: `DOCKER_HOST`, `[storage] enabled = false`, `--ignore-health-check`. The Template doesn't use Storage, so `[storage] enabled = false` is the default in `config.toml`. Analytics/vector are excluded as in CI.
- **Why:** NFR-25, FR-44. This is the brief's week-1 risk.
- **Consequences:** The README gets a tested Podman section after the week-1 run. If Podman can't pass the full suite, the README says Docker is required, recorded in `docs/decisions/`.

### D24. PM consistency-review resolutions (2026-09-26)
Answers to the design writers' questions. Same status as D1–D23: fixed for all docs. None loosens a security setting; the user's decisions (brief, U1–U4, D5, D10) are unchanged.

**Auth and sessions**
1. **"Has a password" = `profiles.password_set_at is not null`** (not identity type). `mark_password_set()` is called by `setInitialPassword`, `updatePasswordFromReset` and `changePassword`, and it checks that a password hash really exists before recording it. Re-auth form (D9) and the settings Password section use this signal. Google-only users (null) don't see the Password section; they can add a password through "Forgot password".
2. **Guards:** `requireUser(options?)` with `{ allowPendingMfa?: boolean; allowPendingPassword?: boolean }` (both default false). `verifyMfaSignIn` / `/auth/mfa` use `allowPendingMfa`; `setInitialPassword` / `/auth/set-password` use `allowPendingPassword`. `signOut` needs no guard (it's a no-op when signed out). `requireRecentSignIn()` is unchanged.
3. **MFA enrollment needs a recent sign-in:** `startMfaEnrollment` and `confirmMfaEnrollment` use `requireRecentSignIn()` (stops a stolen session from locking the owner out).
4. **Sign out other sessions** after `updatePasswordFromReset` and `changePassword` (`signOut({ scope: 'others' })`).
5. **Reset + MFA:** the recovery session is aal1, so an MFA user passes `/auth/mfa` before `/reset-password`. Intended: reset must not bypass MFA.
6. **Recovery session detection:** `amr` method check (week-1 verification); fallback approved: an HttpOnly, `SameSite=Lax`, 15-minute `auth_recovery` cookie set by `/auth/confirm` for `type=recovery` and cleared after `updatePasswordFromReset`. Either marker counts only for **15 minutes** (the `amr` `recovery` timestamp ≤ 15 min old, or the cookie's `Max-Age=900`).
7. **`/auth/confirm` types:** allow-list `signup | magiclink | recovery | email` (D17's list; `email` is kept because `signInWithOtp` links may use it; week-1 check decides whether it's needed).
8. **`next` carries through** `/auth/mfa`, `/auth/set-password` and `/auth/reauthenticate`, always through `safeRedirectPath()`. The `auth_next` cookie (HttpOnly, 1 h) is used for magic link, Google and re-auth. Cancelling Google always returns to `/sign-in?error=oauth_cancelled` in v1.
9. **Login CSRF via `/auth/confirm`** (a victim opens a link for the attacker's account): accepted residual risk for v1. Mitigation: the header always shows the signed-in email. Recorded in the threat model.

**Enumeration and abuse**
10. **Identical messages and a ~500 ms minimum response time** for `signUp`, `requestMagicLink`, `requestPasswordReset` and failed `signIn`. Supabase's 60 s per-user resend rule maps to the same message.
11. **`release_welcome_email(p_user_id uuid)` is `service_role` only**, called by the server with the id from `getUser()` (rule 6: id never from input). `claim_welcome_email()` stays `authenticated`. Stops users resetting the flag to resend the welcome email.
12. **`rate_limit_hit` returns `true` when the request is allowed**, `false` when over the limit. A unit test and an RLS/DB test lock this in (getting it backwards fails open).
13. **Rate-limit keys use HMAC-SHA256 with a server secret** `RATE_LIMIT_HMAC_SECRET` (new env var, secret, server-only) for IPs, emails **and** user ids. Plain SHA-256 of an IPv4 address or email can be reversed by guessing.
14. **Extra D3 rows:** `startMfaEnrollment` 10 / hour (user); `signInWithGoogle` 20 / 10 min (IP); `/auth/confirm` and `/auth/callback` 30 / 10 min (IP). `signOut` has no limit. Accepted: the per-email sign-in limit lets someone block a victim's *password* sign-in for 15 min; magic link and Google still work.
15. **Password length checks UTF-8 bytes:** 12 characters minimum, **72 bytes** maximum (bcrypt), via `TextEncoder` in the Zod schema.
16. **`/monitoring` (Sentry tunnel)** is a documented exception to "Zod + rate limit": it forwards only to the configured DSN; quota abuse is an accepted residual risk (Sentry's own spike protection, 5k errors/month).
17. **Dependabot previews:** a Vercel "Ignored Build Step" skips preview builds for `dependabot/*` branches, so un-reviewed dependency code never runs with preview env vars. (Previews otherwise stay as decided in U2.)

**Data, export, privacy**
18. **User-data tables live in `public`** (the exposed schema), so export can reach them; the registry coverage test enforces it.
19. **`/account/export` never shows a bare error page:** signed out → `/sign-in?next=/settings`; aal1 with a factor → `/auth/mfa`; rate limited or failed → `/settings?export=<rate_limited|failed>` with the message shown inline.
20. **Privacy placeholder lists the service providers** (Supabase, Vercel incl. Web Analytics, Resend, Cloudflare Turnstile, Sentry, Google for sign-in) and the 30-day backup retention. **Week-1 checks:** which `auth` tables keep IPs/user agents after `deleteUser` (e.g. audit log), and that Vercel Web Analytics sets no cookies.

**API shape, config, env**
21. **`ActionResult<T = void>`** adds an optional `data?: T` on success (needed by `startMfaEnrollment`: factor id, QR SVG, secret, `otpauth://` URI).
22. **MFA setup on a phone:** S-16 shows an "Open in authenticator app" link with the `otpauth://` URI, next to the QR code and secret.
23. **`getSiteUrl()` is server-only:** moves to `src/server/site-url.ts` (reads `NEXT_PUBLIC_SITE_URL`, falls back to `https://${VERCEL_BRANCH_URL}` on Preview).
24. **Brand contrast:** a config unit test checks that `primary`/`primaryForeground` (and the dark pair) reach at least 4.5:1 (NFR-23).
25. **Email subjects are generic** (no app name, e.g. "Confirm your email"), so `config.toml` holds no copy of `appConfig` values (FR-26). The sender name comes from `EMAIL_FROM`.
26. **Profile shows the email read-only** with "To change your email, contact support" and the `mailto:` link (FR-13 stays deferred).
27. **`/auth/error?reason=link|oauth|rate_limited`** (Zod enum, unknown → `link`) picks one of three plain messages; `rate_limited` shows M-5 and is used when `/auth/confirm` or `/auth/callback` hit their limit.
28. **Env vars added to `.env.example` and the README (FR-46), placeholders only:** `RATE_LIMIT_HMAC_SECRET=`; scripts/CI only: `SUPABASE_DB_URL=`, `BACKUP_AGE_RECIPIENT=`, `E2E_TARGET=` (empty means local; `check-env-example.sh` rejects a value there), `E2E_EMAIL=`. **`GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY` are not set on Vercel**: only `supabase config push` on the Builder's machine reads them, so the env schema has a separate `supabaseConfigEnv` part that the Next build doesn't require.
29. **Lost authenticator:** the Builder removes a factor only when the request comes from, or is confirmed by, the account's own email address (launch checklist + README).
30. **FR-56 test:** a unit test of the guard with an injected clock, plus a manual check; no env-controlled window (that would be a security setting someone could loosen).
31. **Arrival notices after a redirect use `?notice=<value>`**, a Zod enum: `account_deleted` (on `/`), `password_set` ("You're all set.", after `setInitialPassword`), `password_changed` ("Password changed.", after `updatePasswordFromReset`). Any other value is ignored. Replaces `?account=deleted`.
32. **Guard and edge-case messages** API-1 to API-7 in `docs/07-API-Spec.md` are part of the UX message set.

## Core entities (fixed names for all docs)
| Entity | Owned by | Key fields | Related to |
| --- | --- | --- | --- |
| `auth.users` (Supabase) | Supabase Auth (user = self) | `id`, `email`, `email_confirmed_at`, `created_at`, `last_sign_in_at` | identities, factors, `profiles` |
| `auth.identities` (Supabase) | user | `provider` (`email`, `google`), `user_id` | `auth.users` |
| `auth.mfa_factors` (Supabase) | user | `id`, `factor_type = 'totp'`, `status` (`verified`/`unverified`), `user_id` | `auth.users`, `private.mfa_satisfied()` |
| `public.profiles` | the user (`id = auth.uid()`) | `id`, `display_name`, `welcome_email_sent_at`, `password_set_at`, `created_at`, `updated_at` | `auth.users` (1:1, cascade) |
| `private.rate_limits` | system (no user access) | `key`, `window_start`, `count` | none (not user data) |
| `USER_DATA_TABLES` / `NON_USER_DATA_TABLES` | code (`src/server/data/registry.ts`) | `schema`, `table`, `ownerColumn` / `reason` | export, delete, RLS coverage test |
| `appConfig` | code (`src/config/app.ts`) | `name`, `shortName`, `description`, `supportEmail`, `brand`, `logo`, `legal` | layout, manifest, OG, emails, legal pages |
| Data export file | user | `format`, `version`, `exported_at`, `account`, `data` | registry tables |
| Backup artifact | Builder (app repo) | `backup-<date>.tar.gz.age` (roles.sql, schema.sql, data.sql) | the app's Supabase DB |

## Risks and unknowns
| Risk | Impact | Mitigation | Decision needed from user? |
| --- | --- | --- | --- |
| Supabase per-IP auth limits see Vercel egress IPs (30 sign-in/sign-up per 5 min, MFA verify 15/min, per IP) | Launch spikes could be throttled app-wide | Our per-user limits; documented upgrade path (`Sb-Forwarded-For` + IP forwarding) | Decided: accept for v1 (U3) |
| Nonce CSP breaks a third-party script (Turnstile, analytics, Sentry) or the Google form redirect | Blank widget or blocked sign-in; the part most likely to run over (brief) | Build CSP first in week 1 with an e2e console-violation check; `form-action` includes Supabase/Google | No |
| Sentry 11 is 3 days old and collects personal data by default | Personal data in events (NFR-17) | Explicit `dataCollection` off + scrubber tests; fallback to 10.75.x | No |
| Podman + Supabase CLI (#3099) | Lost setup hours | Docker documented as fallback; storage disabled | No |
| Mailpit send API may be disabled in the CLI container | Welcome email not testable locally | Verify week 1; fallback: expose `smtp_port` and add an SMTP client | No |
| Deployed e2e needs a human to paste links (resend.dev only sends to the owner) | Metric 2's deployed run is semi-manual | `manual` mailbox adapter; 3 emails per run | PM (see questions) |
| Direct Supabase API allows enumeration via magic-link 422 | Account existence leaks to CAPTCHA-solving attackers | Turnstile + Supabase per-IP limits; documented residual risk | No |
| Pre-account takeover via unconfirmed password accounts (GoTrue keeps the old password) | Attacker keeps a password on the victim's account | Email-first sign-up (D10): unconfirmed accounts never have a password | Decided (user, 2026-09-26) |
| CI minutes (about 10–12 per push, 2,000/month shared with backups) | CI stops late in the month | Path filters, cancel-in-progress, trimmed `supabase start -x` | No |
| 500 MB artifact storage shared across all private repos | Backups or reports fail to upload | Reports on failure only (7 days); 30-day backups | Decided (U1) |
| All pages dynamic (nonce) on Hobby's 4 CPU-hrs | Throttling at larger traffic | Per-app watch; Pro is a per-app decision | No |
| `supabase config push` without the `[remotes.production]` block clears production SMTP | Auth emails silently fall back or fail | README step and launch checklist; review the push diff | No |
| Free project pausing (1 week of inactivity) | App down until resumed | Daily backup *may* count as activity (unverified); checklist item | No |
| `getUser()` on every protected request | About 50–150 ms added latency (estimate) | Accepted for security; per-app option to switch | No |

## Open questions for the user
All answered on 2026-09-26:
- [x] **U1. Backups:** daily at 03:17 UTC, kept **30 days**. The privacy placeholder says deleted data can stay in backups up to 30 days.
- [x] **U2. Previews:** share the production Supabase project, previews behind Vercel Authentication. Apps can add staging later.
- [x] **U3. Supabase per-IP limits:** accepted for v1; IP forwarding documented as a per-app step once there's real traffic.
- [x] **U4. Container runtime:** Podman 5.8.7 is installed (no Docker). Try Podman in week 1 (D23); fall back to Docker Engine only if #3099-type errors appear. Also missing today: the Supabase CLI (comes via npm, D1), gitleaks and age (week-1 setup); Node is 26, so install Node 24 LTS to match D1 and Vercel.
- [x] **Style CSP:** split rule with fallback (D5).
- [x] **Sign-up flow:** email first, then password (D10).

## Questions for the PM
Resolved by the PM on 2026-09-26:
- CLAUDE.md rule 17 (cookie defaults), rule 14 (Turnstile scope) and the Stack list (Sentry, Vercel Web Analytics), plus the stale README items (change email, bot-protection scope, branch protection, gift registry date): the PM proposes CLAUDE.md and README edits to the user as diffs at the end of planning.
- D10: replaced by email-first sign-up (user decision).
- NFR-26: the Google-linking part is a documented manual test on the throwaway app; accepted.
- Metric 2: the deployed run with pasted links counts as "passes once against the deployed throwaway app".
- FR-15 export: no FR-56 re-auth; aal2 via `requireUser()` is enough.
- FR-30: at-most-once with retry on failure meets "exactly one".
- Launch checklist: generic items (MFA support path, `config push` remote block, pause check) go in `docs/LAUNCH_CHECKLIST.md`; the Template's own sign-off list is `docs/08-Launch-Checklist.md`.

## Sources
All opened on 2026-09-26.
- npm registry `latest` versions: https://registry.npmjs.org/{next, react, @supabase/ssr, @supabase/supabase-js, supabase, tailwindcss, shadcn, zod, react-email, @react-email/components (deprecated flag), resend, @sentry/nextjs, @playwright/test, vitest, next-themes, @vercel/analytics, server-only, @axe-core/playwright, postgres, sonner, @t3-oss/env-nextjs}
- Supabase CLI latest release: https://api.github.com/repos/supabase/cli/releases/latest (v2.118.0)
- Node.js releases: https://nodejs.org/dist/index.json
- gitleaks release: https://api.github.com/repos/gitleaks/gitleaks/releases/latest; licence: https://github.com/gitleaks/gitleaks-action
- Next.js proxy (middleware renamed, Node runtime, verify auth in Server Functions): https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next.js CSP / nonces / dynamic rendering / SRI: https://nextjs.org/docs/app/guides/content-security-policy
- Supabase SSR for Next.js (proxy, getClaims, publishable key): https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase SSR advanced guide (PKCE, caching warning): https://supabase.com/docs/guides/auth/server-side/advanced-guide
- getClaims: https://supabase.com/docs/reference/javascript/auth-getclaims
- JWT signing keys: https://supabase.com/docs/guides/auth/signing-keys
- JWT fields (amr, aal): https://supabase.com/docs/guides/auth/jwt-fields
- MFA overview + RLS policies (doc source): https://supabase.com/docs/guides/auth/auth-mfa and https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/auth-mfa.mdx
- TOTP (free, enabled on all projects): https://supabase.com/docs/guides/auth/auth-mfa/totp
- Auth rate limits (+ Sb-Forwarded-For): https://supabase.com/docs/guides/auth/rate-limits
- Auth CAPTCHA: https://supabase.com/docs/guides/auth/auth-captcha
- GoTrue source (CAPTCHA routes, recovery-codes routes, secure password change 24 h, signup keeps unconfirmed user, magic link for unconfirmed, OTP create_user): https://github.com/supabase/auth, files `internal/api/{api.go,middleware.go,user.go,signup.go,magic_link.go,otp.go}` (master)
- Identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- signInWithOtp: https://supabase.com/docs/reference/javascript/auth-signinwithotp
- Password security (leaked-password protection Pro-only): https://supabase.com/docs/guides/auth/password-security
- API keys (publishable/secret, legacy deprecated end of 2026): https://supabase.com/docs/guides/api/api-keys
- Local email templates: https://supabase.com/docs/guides/local-development/customizing-email-templates
- config push: https://supabase.com/docs/reference/cli/supabase-config-push; CLI source `apps/cli-go/pkg/config/{auth.go,config.go,templates/config.toml,templates/Dockerfile}`: https://github.com/supabase/cli (develop)
- db dump: https://supabase.com/docs/reference/cli/supabase-db-dump; CLI `pkg/migration/{dump.go,scripts/dump_data.sh}`
- Backup and restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Connecting (IPv6 direct, IPv4 pooler): https://supabase.com/docs/guides/database/connecting-to-postgres
- Managing environments (setup-cli, db push secrets): https://supabase.com/docs/guides/deployment/managing-environments
- Supabase pricing (2 projects, pause after 1 week, no backups, TOTP free, phone MFA $75): https://supabase.com/pricing
- Supabase CLI getting started (Podman supported, npm install, Node ≥ 20): https://supabase.com/docs/guides/local-development/cli/getting-started
- Rootless Podman issue: https://github.com/supabase/cli/issues/3099
- `@supabase/ssr` 0.12.7 package source (`DEFAULT_COOKIE_OPTIONS`): `npm pack @supabase/ssr@0.12.7`
- React Email manual setup / render: https://react.email/docs/getting-started/manual-setup, https://react.email/docs/utilities/render
- Mailpit API routes (source): https://raw.githubusercontent.com/axllent/mailpit/develop/server/server.go
- Resend pricing (3,000/month, 100/day, 3 domains): https://resend.com/pricing
- Resend test addresses (count against quota): https://resend.com/docs/dashboard/emails/send-test-emails
- resend.dev only to own address: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- Resend SMTP for Supabase: https://resend.com/docs/send-with-supabase-smtp
- Turnstile testing keys: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- Turnstile CSP: https://developers.cloudflare.com/turnstile/reference/content-security-policy/
- Turnstile server-side validation (300 s, single use): https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Turnstile plans (20 widgets, 10 hostnames): https://developers.cloudflare.com/turnstile/plans/
- Upstash pricing: https://upstash.com/pricing/redis
- Vercel WAF rate limiting (Hobby: 1 rule): https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel request headers (x-forwarded-for overwritten): https://vercel.com/docs/headers/request-headers
- Vercel Hobby plan (limits, non-commercial, 50k analytics events): https://vercel.com/docs/plans/hobby
- Vercel Instant Rollback: https://vercel.com/docs/instant-rollback
- Sentry pricing (Developer: 5k errors, 1 user, 30 days, email alerts): https://sentry.io/pricing/
- Sentry Next.js manual setup (tunnelRoute, proxy matcher): https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- Sentry options (`dataCollection`, v11 defaults): https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/
- GitHub Actions billing (Free: 2,000 min, 500 MB): https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Artifact retention (default 90 days): https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts
- Scheduled workflows disabled after 60 days (public repos): https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow
- Unverified (stated as such in the text): whether new projects default to asymmetric JWT keys; Mailpit send API enabled in the CLI container; whether a daily dump counts as Supabase activity; the CI minutes-per-push estimate; the effect of Supabase sending our server IP as Turnstile `remoteip`; `config push` showing a diff before applying.
