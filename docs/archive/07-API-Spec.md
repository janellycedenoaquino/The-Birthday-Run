# Template: API Specification

Last updated: 2026-09-26 · Status: draft (PM answers applied, RFC D24) · Based on: 01-Project-Brief.md, 02-PRD.md, 03-RFC.md (D2–D24), 04-UX-Spec.md, CLAUDE.md rules 1–23

This is the contract for every operation the Template exposes: the server actions, route handlers and database functions fixed by RFC D17. Names, entities and fields are the RFC's, and user-facing strings are the UX spec's (M-1 to M-7 and the screen texts). Anything marked **Assumption** is a choice this spec makes where the RFC and UX spec are silent.

## 1. Conventions

### 1.1 Who may call (access levels)
Each operation names one level. Every check runs on the server (NFR-3). Proxy redirects never count as a check. The guards live in `src/server/auth/guards.ts` (D2, D24.2).

| Level | Meaning | Checked by |
| --- | --- | --- |
| `public` | Anyone, no session needed | none |
| `signed-out` | Meant for signed-out visitors. A signed-in caller isn't refused; the call just starts a new session or sends a link | none (Turnstile, rate limit) |
| `aal1-pending` | Verified user, `aal = aal1`, with a **verified** TOTP factor in `user.factors` (from the Auth server) | `requireUser({ allowPendingMfa: true })` |
| `password-unset` | Verified user whose only identity is `email` and whose `profiles.password_set_at` is null (D10). MFA must be satisfied | `requireUser({ allowPendingPassword: true })` |
| `user` | Verified user (`getUser()`); `aal2` **or** no verified factor; and not `password-unset` | `requireUser()` |
| `recovery` | `user`, plus a recovery marker (D24.6): the JWT `amr` has a `recovery` entry at most 15 min old, **or** (fallback) the `auth_recovery` cookie (15 min) is present | `requireUser()` + recovery check |
| `recent` | `user`, and the newest `amr[].timestamp` is ≤ 10 min old (D9) | `requireRecentSignIn()` |
| `service_role` | Only the server's secret-key client (`src/server/supabase/admin.ts`) | Postgres `EXECUTE` grants |

**"Has a password"** means `profiles.password_set_at is not null` (D24.1). This single signal drives the re-auth form (S-11) and the Password section (S-15).

**What a refusal looks like in an action** (D2: pages redirect, actions and handlers refuse):
- No verified user: `{ ok: false, error: API-1 }`
- `aal1` with a factor: `{ ok: false, error: API-2 }`
- `password-unset`: `{ ok: false, error: API-3 }`
- `recent` fails: the action calls `redirect('/auth/reauthenticate?next=/settings')` (D9). The `next` value is a constant, never taken from input.

### 1.2 Signature and result
```ts
type ActionResult<T = void> =                                   // D17 + D24.21
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Action<T = void> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
```
- Every action is a `"use server"` export that works with `useActionState` and without JS.
- Input is `Object.fromEntries(formData)`, parsed with the `.strict()` Zod schema shown. Only the Next.js-internal `$ACTION_*` keys are stripped first.
- **On a Zod failure:** `{ ok: false, error: API-4, fieldErrors: z.flattenError(err).fieldErrors }`.
  - **Exception:** a missing or invalid `turnstileToken` returns `{ ok: false, error: M-6 }` as a form alert, not a field error (UX C-4).
- `error` and `message` only ever hold strings from §1.5. Raw Supabase/Postgres errors go to `logError()` (`src/server/errors.ts` → Sentry, scrubbed per D15), never to the user (rule 12, NFR-9).
- Actions that finish a flow call `redirect()`. Every redirect target taken from input goes through `safeRedirectPath()` (`src/lib/security/safe-redirect.ts`: single leading `/` only; rejects `//`, `/\`, schemes and encoded variants; fallback `/dashboard`) (rule 11, NFR-8).
- `next` carries through `/auth/mfa`, `/auth/set-password` and `/auth/reauthenticate`, and is always re-checked (D24.8).

**Order inside every action:**
1. Zod
2. Guard
3. Rate limit
4. Supabase call
5. Side effects
6. Result or redirect

Signed-out actions have no guard step. `deleteAccount` runs its guard first (D12 order). Because Zod runs first, a missing Turnstile token is rejected before anything else (D4), and malformed requests don't use up rate-limit budget.

**Minimum response time (D24.10):** `signUp`, `requestMagicLink`, `requestPasswordReset` and a **failed** `signIn` each wait until at least ~500 ms have passed since the action started before returning.

### 1.3 Shared Zod schemas (`src/lib/validation/auth.ts`, `src/lib/validation/account.ts`)
```ts
import { z } from "zod"; // zod 4.6.x

export const emailSchema = z.string().trim().toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "Enter a valid email address.")
  .pipe(z.email("Enter a valid email address."));

// D22 + D24.15: at least 12 characters, at most 72 UTF-8 BYTES (bcrypt limit). Mirrors minimum_password_length = 12.
export const passwordSchema = z.string()
  .min(12, "Use at least 12 characters.")
  .refine(p => new TextEncoder().encode(p).length <= 72, "Use 72 characters or fewer.");

// Form field `cf-turnstile-response` is mapped to this key before parsing (Assumption). Failure → M-6 form alert.
export const turnstileTokenSchema = z.string().min(1).max(2048);

export const nextSchema = z.string().max(2048).optional();      // never rejected; always passed through safeRedirectPath()

export const totpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

// UX C-5: one new-password field, no "confirm password" field.
export const newPasswordSchema = z.object({ password: passwordSchema });

export const displayNameSchema = z.string().trim()
  .min(1, "Enter a name.")
  .max(80, "Use 80 characters or fewer.");                     // DB check: char_length between 1 and 80 (D12)
```
"Use 72 characters or fewer." is the UX's wording for what is really a 72-byte limit. See the mismatch notes.

### 1.4 Rate limits (D3 + D24.12–14)
- **Helper:** `src/server/security/rate-limit.ts` calls `public.rate_limit_hit(key, max, windowSeconds)` through the service-role client.
- **Keys** (D24.13): `"<action>:ip:<hmac(ip)>"`, `"<action>:email:<hmac(lower(email))>"`, `"<action>:user:<hmac(uid)>"`, where `hmac` is HMAC-SHA256 (hex) keyed with `RATE_LIMIT_HMAC_SECRET`.
  - IP = the first `x-forwarded-for` value (Vercel overwrites it); `"unknown"` when the header is absent (local).
- If there are two keys, the IP key is checked first, and checking stops at the first limit hit.
- **Limited:** `{ ok: false, error: M-5 }`. The text is identical whether or not the email has an account (NFR-12).
- **Limiter error (fail closed):** `{ ok: false, error: M-7 }`, logged.
- Every call counts.

| Operation | Per IP | Per email / user |
| --- | --- | --- |
| `signIn` | 20 / 600 s | 10 / 900 s (email) |
| `signUp` | 5 / 3600 s | 3 / 3600 s (email) |
| `requestMagicLink` | 10 / 3600 s | 3 / 3600 s (email) |
| `requestPasswordReset` | 10 / 3600 s | 3 / 3600 s (email) |
| `verifyMfaSignIn`, `confirmMfaEnrollment`, `disableMfa` (a separate key per action) | 30 / 900 s | 5 / 300 s (user) |
| `startMfaEnrollment` | – | 10 / 3600 s (user) |
| `reauthenticateWithPassword` | 20 / 600 s | 5 / 900 s (user) |
| `signInWithGoogle` | 20 / 600 s | – |
| `changePassword`, `updatePasswordFromReset`, `setInitialPassword` | – | 5 / 3600 s (user) |
| `GET /account/export` | – | 5 / 3600 s (user) |
| `deleteAccount` | – | 5 / 3600 s (user) |
| `updateDisplayName` | – | 30 / 3600 s (user) |
| `GET /auth/confirm`, `GET /auth/callback` (a separate key each) | 30 / 600 s | – |

Unlimited: `signOut` (D24.14), and `/monitoring`, which is a documented exception (D24.16).

**Accepted (D24.14):** the per-email `signIn` limit lets someone block a victim's *password* sign-in for 15 min. Magic link and Google still work.

### 1.5 Message catalogue (exact user-facing strings)
The M- IDs and the screen texts are the UX spec's; the API- IDs are added here for guard and edge cases the UX doesn't cover (see the mismatch notes). **Bold** rows must be byte-identical for existing, non-existing, unconfirmed and Google-only emails, with the same `ActionResult` shape and HTTP status (NFR-12, rule 15). `{email}` is the normalised address the user typed, returned as text.

| ID | Text (`error` / `message`) | Returned by |
| --- | --- | --- |
| **M-1** | We've sent a link to {email}. Open it to continue. If you already have an account, the link signs you in instead. | `signUp` success (every non-validation outcome) |
| **M-2** | If there's an account for {email}, we've sent it a sign-in link. The link works once. | `requestMagicLink` success (every non-validation outcome) |
| **M-3** | If there's an account for {email}, we've sent it a link to reset your password. The link works once. | `requestPasswordReset` success (every non-validation outcome) |
| **M-4** | Wrong email or password. Try again, or reset your password. | `signIn` failure (unknown email, wrong password, unconfirmed, no password yet, Google-only) |
| **M-5** | Too many attempts. Please try again in a few minutes. | every rate-limited operation |
| **M-6** | The security check didn't work. Please try again. | Turnstile missing (Zod) or rejected by Supabase |
| M-7 | Something went wrong. Please try again. | unexpected errors, limiter errors |
| MFA-WRONG | That code didn't work. Check the app and try the newest code. | `verifyMfaSignIn`, `confirmMfaEnrollment`, `disableMfa` (S-10, S-16) |
| REAUTH-WRONG | That password isn't right. Try again. | `reauthenticateWithPassword` (S-11) |
| MFA-SETUP-FAIL | Couldn't start setup. Please try again. | `startMfaEnrollment` (S-16) |
| DELETE-MISMATCH | That doesn't match your email address. | `deleteAccount`, `fieldErrors.email` (S-18) |
| NO-PASSWORD | You sign in with Google, so there's no password to change. | `changePassword` when `password_set_at` is null (S-15 text) |
| `message` toasts | "Name saved." · "Password changed." · "Two-step sign-in is on." · "Two-step sign-in is off." | `updateDisplayName`, `changePassword`, `confirmMfaEnrollment`, `disableMfa` |
| API-1 | Your session has ended. Please sign in again. | guard: no verified user |
| API-2 | Enter the code from your authenticator app to continue. | guard: aal1 with a factor |
| API-3 | Choose a password to finish setting up your account. | guard: `password-unset` |
| API-4 | Please check the fields below. | any Zod failure (details in `fieldErrors`) |
| API-5 | Two-step sign-in is already on. | `startMfaEnrollment` when a verified factor exists |
| API-6 | Your password is already set. | `setInitialPassword` when `password_set_at` is set |
| API-7 | Choose a password you haven't used for this account. | password setters: Supabase `same_password`, as `fieldErrors.password` |

Field errors come from the schemas in §1.3. They match UX S-4, S-5, S-9, S-10, S-14 and C-5, plus "Enter your password." for an empty password on `signIn` and `reauthenticateWithPassword`.

### 1.6 Cookies set by this API
| Cookie | Set by | Flags | Content |
| --- | --- | --- | --- |
| Supabase session `sb-*` | `@supabase/ssr` server client | `HttpOnly; Secure`\*; `SameSite=Lax; Path=/` (D21) | session |
| PKCE verifier `sb-*-code-verifier` | `signInWithGoogle` (via `@supabase/ssr`) | same | verifier |
| `auth_next` | `requestMagicLink`, `signInWithGoogle` (sign-in and Google re-auth) (D24.8) | `HttpOnly; Secure`\*; `SameSite=Lax; Path=/auth; Max-Age=3600` | `safeRedirectPath(next)` |
| `auth_recovery` (fallback, D24.6) | `/auth/confirm` for `type=recovery` | `HttpOnly; Secure`\*; `SameSite=Lax; Path=/; Max-Age=900` | `"1"` (Assumption: a marker only; the session is still what authenticates) |

\* `Secure` unless the site URL is plain http on a non-localhost host (D21).
- `auth_next` is read and deleted by `/auth/confirm` and `/auth/callback`, and re-checked with `safeRedirectPath()` on read.
- `auth_recovery` is deleted by `updatePasswordFromReset` on success.

## 2. Server actions: `src/server/actions/auth.ts`

### `signUp` (FR-1, FR-2, NFR-10, NFR-11, NFR-12, NFR-26)
- **Who:** `signed-out` · **Screen:** S-5
- **Input:** `z.object({ email: emailSchema, turnstileToken: turnstileTokenSchema }).strict()`. Email and Turnstile only (D10).
- **Turnstile:** yes, passed as `options.captchaToken`. The action does not call siteverify itself (D4).
- **Rate limit:** 5/h per IP, 3/h per email.
- **Call:** `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken, emailRedirectTo: getSiteUrl() + "/auth/confirm" } })`
- **Returns:** `{ ok: true, message: M-1 }` after ≥ ~500 ms. This covers:
  - a new email;
  - an existing (confirmed or unconfirmed, password or Google) email;
  - Supabase's 60 s per-user rule and its per-IP 429;
  - any other non-CAPTCHA Supabase error (logged).
- **Errors:** field errors (email), M-6, M-5 (our limiter), M-7 (limiter error)
- **Side effects:**
  - A new email gets an unconfirmed `auth.users` row with **no password**, `handle_new_user` inserts its `profiles` row, and Supabase sends E-1.
  - An existing email gets E-2.
  - There is no redirect and no `next`.

### `setInitialPassword` (FR-1, FR-2, NFR-26)
- **Who:** `password-unset`, via `requireUser({ allowPendingPassword: true })` · **Screen:** S-9
  - A caller with `password_set_at` already set gets API-6.
- **Input:** `newPasswordSchema.extend({ next: nextSchema }).strict()`
- **Rate limit:** 5/h per user.
- **Call:** `updateUser({ password })`, then `rpc("mark_password_set")`.
- **Returns:** redirects to `safeRedirectPath(next)` (default `/dashboard`). appends `?notice=password_set` (D24.31) for S-9's arrival toast "You're all set.".
- **Errors:**
  - field errors, and API-7 on the `password` field
  - M-5, M-7
  - If the password saves but the RPC fails: M-7 (logged); a retry succeeds.
- **Side effects:** the password is stored and `profiles.password_set_at = now()`.

### `signIn` (FR-3, FR-9, FR-30, FR-58, NFR-10, NFR-11, NFR-12)
- **Who:** `signed-out` · **Screen:** S-4, Password tab
- **Input:**
  ```ts
  z.object({ email: emailSchema,
             password: z.string().min(1, "Enter your password.")
               .refine(p => new TextEncoder().encode(p).length <= 72, "Use 72 characters or fewer."),
             turnstileToken: turnstileTokenSchema, next: nextSchema }).strict()
  ```
  There is no 12-character minimum at sign-in.
- **Turnstile:** yes. **Rate limit:** 20/10 min per IP, 10/15 min per email.
- **Call:** `signInWithPassword({ email, password, options: { captchaToken } })`
- **On success:**
  1. `rpc("claim_welcome_email")`. If it returns `true`, send `welcome.tsx` (E-4) through `src/server/email/send.ts`.
  2. If the send fails, release the claim with `admin.rpc("release_welcome_email", { p_user_id: user.id })`, where the id comes from `getUser()` (D24.11), and `logError`. A welcome failure never fails the sign-in.
  3. Redirect to `/auth/mfa?next=<safeRedirectPath(next)>` if the user has a verified factor; otherwise to `safeRedirectPath(next)`.
- **Errors:**
  - M-4 for every credential-type failure (`invalid_credentials`, `email_not_confirmed`, no password, unknown email), after ≥ ~500 ms
  - M-6
  - M-5 (ours, or Supabase's 429)
  - field errors, M-7

### `requestMagicLink` (FR-4, NFR-10, NFR-11, NFR-12)
- **Who:** `signed-out` · **Screen:** S-4, Email link tab
- **Input:** `z.object({ email: emailSchema, turnstileToken: turnstileTokenSchema, next: nextSchema }).strict()`
- **Turnstile:** yes. **Rate limit:** 10/h per IP, 3/h per email.
- **Call:** `signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken, emailRedirectTo: getSiteUrl() + "/auth/confirm" } })`
- **Returns:** `{ ok: true, message: M-2 }` after ≥ ~500 ms, for:
  - sent;
  - unknown email (GoTrue 422 `otp_disabled`);
  - Supabase's 60 s rule or 429;
  - any other non-CAPTCHA error (logged).
- **Errors:** field errors, M-6, M-5 (ours), M-7 (limiter error)
- **Side effects:** sets `auth_next`. Sends E-2 to existing users only. **Never creates an account** (D11).

### `requestPasswordReset` (FR-7, NFR-10, NFR-11, NFR-12)
- **Who:** `signed-out` (signed-in callers allowed, UX S-6) · **Screen:** S-6
- **Input:** `z.object({ email: emailSchema, turnstileToken: turnstileTokenSchema }).strict()`
- **Turnstile:** yes. **Rate limit:** 10/h per IP, 3/h per email.
- **Call:** `resetPasswordForEmail(email, { captchaToken, redirectTo: getSiteUrl() + "/auth/confirm" })`
- **Returns:** `{ ok: true, message: M-3 }` after ≥ ~500 ms, for every outcome except the ones listed under Errors. That includes the 60 s rule (D24.10).
- **Errors:** field errors, M-6, M-5 (ours), M-7 (limiter error)
- **Side effects:** E-3 is sent to existing accounts only. It is also how a Google-only user adds a password (D24.1).

### `updatePasswordFromReset` (FR-8)
- **Who:** `recovery` · **Screen:** S-7
  - An MFA user passes S-10 first, because `requireUser()` refuses aal1; the reset must not bypass MFA (D24.5). The check is therefore "`amr` *contains* `recovery`", not "is newest".
  - A `password-unset` user is sent to S-9 by `requireUser()`.
- **Input:** `newPasswordSchema.strict()`
- **Rate limit:** 5/h per user.
- **Steps:**
  1. `updateUser({ password })`.
  2. `rpc("mark_password_set")` (D24.1).
  3. `signOut({ scope: "others" })` (D24.4).
  4. Delete `auth_recovery`.
  5. `redirect("/dashboard?notice=password_changed")` (D24.31), which shows the toast "Password changed."
- **Errors:**
  - No recovery marker: the S-7 page shows the S-8 link content. If the action is called anyway, it returns API-1.
  - API-7 / field errors, M-5, M-7
- **Side effects:** the old password stops working, and other sessions are signed out.

### `signInWithGoogle` (FR-5, FR-56)
- **Who:** `public`. Used for sign-in and sign-up (S-4, S-5) and for Google re-auth (S-11, D9).
- **Input:** `z.object({ next: nextSchema }).strict()`
- **Turnstile:** no (D4). **Rate limit:** 20/10 min per IP.
- **Call:** `signInWithOAuth({ provider: "google", options: { redirectTo: getSiteUrl() + "/auth/callback" } })`, then `redirect(data.url)`.
- **Side effects:** sets the PKCE verifier cookie and `auth_next`.
- **Errors:** M-5, M-7 (no URL returned)

### `signOut` (FR-6)
- **Who:** no guard, so it works in any session state, including S-9 and S-10 (D24.2). With no session it's a no-op.
- **Input:** `z.object({}).strict()`. **Rate limit:** none.
- **Call:** `signOut({ scope: "local" })` (Assumption: this device only, since "sign out everywhere" is out of scope). The cookies are cleared even if Supabase errors (logged).
- **Returns:** redirects to `/` with no toast (UX assumption).

### `reauthenticateWithPassword` (FR-56)
- **Who:** `user` who has a password (`password_set_at` not null) · **Screen:** S-11
- **Input:** `z.object({ password: z.string().min(1, "Enter your password.").refine(p => new TextEncoder().encode(p).length <= 72, "Use 72 characters or fewer."), turnstileToken: turnstileTokenSchema, next: nextSchema }).strict()`
- **Turnstile:** yes (D4, D9). **Rate limit:** 20/10 min per IP, 5/15 min per user.
- **Call:** `signInWithPassword({ email: user.email, password, options: { captchaToken } })`. The email comes from `getUser()` and is never taken from input.
- **Returns:** a redirect.
  - With a verified factor: `/auth/mfa?next=<safeRedirectPath(next)>` (the new session is aal1).
  - Otherwise: `safeRedirectPath(next)`. S-11 always sends `next`, and its page falls back to `/settings`.
- **Errors:** REAUTH-WRONG, M-6, M-5, API-1, API-2, M-7

## 3. Server actions: `src/server/actions/mfa.ts`

### `startMfaEnrollment` (FR-57)
- **Who:** `recent` (D24.3) · **Screen:** S-16, "Set up"
- **Input:** `z.object({}).strict()`. **Rate limit:** 10/h per user.
- **Steps:**
  1. If there is a verified TOTP factor: return API-5.
  2. Otherwise `mfa.unenroll` each **unverified** factor.
  3. Then `mfa.enroll({ factorType: "totp" })`.
- **Returns:**
  ```ts
  ActionResult<{ factorId: string; qrCode: string /* data:image/svg+xml… */; secret: string; uri: string /* otpauth://… */ }>
  ```
  - `qrCode` is rendered only as `<img src>` (CSP `img-src data:`).
  - `uri` is used for S-16's "Open in authenticator app" link (D24.22).
  - None of the values are logged.
- **Errors:** API-5, MFA-SETUP-FAIL, M-5, plus the reauthenticate redirect

### `confirmMfaEnrollment` (FR-57)
- **Who:** `recent` (D24.3)
- **Input:** `z.object({ factorId: z.uuid(), code: totpCodeSchema }).strict()`
- **Ownership:** `factorId` must be an **unverified TOTP factor in this user's `user.factors`** (from `getUser()`); otherwise MFA-WRONG. Supabase also scopes factors to the caller (rule 6).
- **Rate limit:** 30/15 min per IP, 5/5 min per user.
- **Call:** `mfa.challengeAndVerify({ factorId, code })`. The session becomes aal2.
- **Returns:** `{ ok: true, message: "Two-step sign-in is on." }`
- **Errors:** MFA-WRONG (`fieldErrors.code`), field errors, M-5, M-7, plus the reauthenticate redirect

### `verifyMfaSignIn` (FR-58)
- **Who:** `aal1-pending`, via `requireUser({ allowPendingMfa: true })` · **Screen:** S-10
- **Input:** `z.object({ code: totpCodeSchema, next: nextSchema }).strict()`. The factor is the single verified TOTP factor from `user.factors`; it is never taken from input.
- **Rate limit:** 30/15 min per IP, 5/5 min per user. Supabase's fixed 15/min per IP also applies.
- **Call:** `mfa.challengeAndVerify({ factorId, code })`
- **Returns:** redirects to `safeRedirectPath(next)`. An aal2 caller is just redirected.
- **Errors:** MFA-WRONG, field errors, M-5, API-1, M-7

### `disableMfa` (FR-59, FR-56)
- **Who:** `recent`, which means aal2 for an MFA user
- **Input:** `z.object({ code: totpCodeSchema }).strict()`
- **Rate limit:** 30/15 min per IP, 5/5 min per user.
- **Steps:**
  1. Take the verified factor from `user.factors`.
  2. A fresh `mfa.challengeAndVerify` with the code.
  3. `mfa.unenroll({ factorId })`.
- **Returns:** `{ ok: true, message: "Two-step sign-in is off." }`
- **Errors:** MFA-WRONG, field errors, M-5, M-7, plus the reauthenticate redirect
- **Lost authenticator:** there is no action. The Builder deletes the factor, and only when the request comes from, or is confirmed by, the account's own email (D8, D24.29).

## 4. Server actions: `src/server/actions/account.ts`

### `updateDisplayName` (FR-12)
- **Who:** `user` · **Screen:** S-14
- **Input:** `z.object({ displayName: displayNameSchema }).strict()`
- **Rate limit:** 30/h per user.
- **Call:** the user's own client (RLS applies): `from("profiles").update({ display_name }).eq("id", user.id).select("id")`. If exactly one row doesn't come back: M-7, logged.
- **Returns:** `{ ok: true, message: "Name saved." }`, then `revalidatePath("/settings")` and `revalidatePath("/dashboard")`.
- **Errors:** field errors, M-5, API-1, API-2, M-7. The name can't be cleared back to null.

### `changePassword` (FR-14, FR-56)
- **Who:** `recent`, and the user must have a password · **Screen:** S-15
  - If `password_set_at` is null, it returns NO-PASSWORD. The section is hidden for these users anyway (D24.1).
- **Input:** `newPasswordSchema.strict()`. There is no current-password field (D9).
- **Rate limit:** 5/h per user.
- **Steps:**
  1. `updateUser({ password })`.
  2. `rpc("mark_password_set")`.
  3. `signOut({ scope: "others" })` (D24.4).
- **Returns:** `{ ok: true, message: "Password changed." }`
- **Errors:** API-7 / field errors, NO-PASSWORD, M-5, M-7, plus the reauthenticate redirect

### `deleteAccount` (FR-16, FR-56, NFR-16)
- **Who:** `recent` · **Screen:** S-18
- **Input:** `z.object({ email: emailSchema }).strict()`, where the email is typed to confirm.
- **Steps (D12):**
  1. `requireRecentSignIn()`.
  2. Zod, then a case-insensitive compare with `user.email`. On a mismatch: `fieldErrors.email = [DELETE-MISMATCH]`.
  3. Rate limit, 5/h per user.
  4. `admin.auth.admin.deleteUser(user.id)`, with the id from `getUser()` and never from input (rule 6).
  5. The cascade removes every `USER_DATA_TABLES` row.
  6. `signOut({ scope: "local" })`, ignoring errors; the cookies are cleared.
  7. `redirect("/?notice=account_deleted")`.
- **Errors:** field errors, M-5, M-7 (nothing deleted), plus the reauthenticate redirect
- **Notes:**
  - S-1 parses `account` with `z.enum(["deleted"]).optional()`.
  - Backups keep the data for up to 30 days (D14).

## 5. Route handlers

All route handlers:
- set `Cache-Control: private, no-store` (D5);
- get the static security headers from `next.config.ts`;
- Zod-check their `searchParams`.

No handler ever shows a bare error page.

### `GET /auth/confirm` (FR-2, FR-4, FR-8, FR-30): `src/app/auth/confirm/route.ts`
- **Who:** `public`. The link is the credential.
- **Query:**
  ```ts
  z.object({ token_hash: z.string().min(1).max(512),
             type: z.enum(["signup", "magiclink", "recovery", "email"]) })  // D24.7
  ```
  `next` is never read from the query; it comes from `auth_next`.
- **Rate limit:** 30/10 min per IP. When limited: redirect to `/auth/error?reason=rate_limited`.
- **Steps:**
  1. `verifyOtp({ token_hash, type })`, which sets the session.
  2. Welcome claim and send, as in `signIn`, for every type (D7).
  3. Redirect:
     - `type = recovery`: set `auth_recovery` (fallback, D24.6) and redirect to `/reset-password`.
     - Otherwise: redirect to `safeRedirectPath(auth_next)` (default `/dashboard`) and delete `auth_next`.
  4. The destination's `requireUser()` then sends MFA users on to S-10 and `password-unset` users on to S-9 (FR-2).
- **Errors:** a Zod failure, or an expired, used or invalid token, redirects to `/auth/error?reason=link` (logged when unexpected).
- **Accepted residual risk (D24.9):** login CSRF through a link to the attacker's own account. It is mitigated by the header showing the signed-in email.

### `GET /auth/callback` (FR-5, FR-30, FR-56, NFR-26): `src/app/auth/callback/route.ts`
- **Who:** `public`
- **Query:** `z.object({ code: z.string().min(1).max(512).optional(), error: z.string().max(200).optional(), error_description: z.string().max(1000).optional() })`
- **Rate limit:** 30/10 min per IP. When limited: redirect to `/auth/error?reason=rate_limited`.
- **Steps:**
  1. If `error` is set or `code` is missing: redirect to `/sign-in?error=oauth_cancelled`. This applies in every case in v1, including re-auth (D24.8).
  2. `exchangeCodeForSession(code)`. On failure: redirect to `/auth/error?reason=oauth` (logged).
  3. On success: welcome claim and send (a Google sign-up's first sign-in, FR-30), then redirect to `safeRedirectPath(auth_next)` and delete `auth_next`. MFA users are diverted by the destination's guard.
- **Identity linking:** automatic linking stays on, and it links only to a verified email (D10, NFR-26).
- **Page params:**
  - S-4 parses `error` with `z.enum(["oauth_cancelled"]).optional()`.
  - S-8 parses `reason` with `z.enum(["link", "oauth", "rate_limited"]).catch("link")` (D24.27).

### `GET /account/export` (FR-15, NFR-16): `src/app/account/export/route.ts`
- **Who:** `user`. aal2 is enforced through `requireUser()`; there is no FR-56 re-auth (D13).
- **Input:** none.
- **Refusals and failures (D24.19).** Every one is a `303` redirect, and no data is ever returned:

  | Case | Redirect to |
  | --- | --- |
  | signed out | `/sign-in?next=/settings` |
  | aal1 with a factor | `/auth/mfa?next=/settings` |
  | `password-unset` | `/auth/set-password` |
  | rate limited (5/h per user) | `/settings?export=rate_limited` |
  | any error | `/settings?export=failed` (logged) |

  S-17 parses `export` with `z.enum(["rate_limited", "failed"]).optional()` and shows M-5 or M-7 inline under the card.
- **Data:** each `USER_DATA_TABLES` entry (all in `public`, D24.18) is queried **with the user's own client** (RLS applies; no service role): `select * … where <ownerColumn> = user.id`.
- **`200` headers:**
  - `Content-Type: application/json; charset=utf-8`
  - `Content-Disposition: attachment; filename="<app-slug>-data-<YYYY-MM-DD>.json"` (**Assumption:** the slug is lowercase and hyphenated, from `appConfig.name`)
  - `Cache-Control: private, no-store`
  - `X-Content-Type-Options: nosniff`
- **Body (D13):**
  ```ts
  type AccountDataExport = {
    format: "account-data-export";
    version: 1;
    exported_at: string;                   // ISO 8601
    app: string;                           // appConfig.name
    account: {
      id: string;
      email: string;
      created_at: string;
      email_confirmed_at: string | null;
      last_sign_in_at: string | null;
      providers: string[];                 // distinct user.identities[].provider, e.g. ["email", "google"]
      mfa_enabled: boolean;                // a verified factor exists
    };
    data: Record<string, Record<string, unknown>[]>;  // "<schema>.<table>" for EVERY registry table, [] if empty
  };
  // Template: data = { "public.profiles": [ { id, display_name, welcome_email_sent_at, password_set_at, created_at, updated_at } ] }
  ```
  **Never included:** tokens, factor secrets, identity provider tokens, `identity_data`, password hashes, or other users' rows.
- **UI:** a plain `<a href download>`, never a prefetching `<Link>`, because a prefetch would use up the limit.

### `/monitoring`: Sentry tunnel (FR-31, NFR-17)
- **Kind:** generated by `withSentryConfig({ tunnelRoute: "/monitoring" })`; the Template writes no handler code.
- **Who:** `public`. The browser SDK POSTs Sentry envelopes to it.
- **Behaviour:** forwards only to the configured DSN.
  - It is excluded from the proxy matcher (D5).
  - Personal data is removed on the client before sending (D15).
- **Validation / rate limit:** none. This is a **documented exception** to rules 9 and 13 (D24.16). Quota abuse is an accepted residual risk, covered by Sentry's spike protection and the 5k errors/month cap.

### Metadata routes (FR-24, FR-25, FR-26): `src/app/`
All are `public` `GET`s with no input, built from `appConfig` and the server-only `getSiteUrl()` (`src/server/site-url.ts`, D24.23).

| Route (file) | Output |
| --- | --- |
| `/manifest.webmanifest` (`manifest.ts`) | `name`, `short_name` (`appConfig.shortName`), `description`, `start_url: "/"`, `display: "standalone"`, `theme_color: brand.primary`, icons |
| `/robots.txt` (`robots.ts`) | `User-agent: *`, `Allow: /`, `Disallow: /dashboard`, `/settings`, `/auth/`, `/account/`, and `Sitemap: <site>/sitemap.xml` (Assumption) |
| `/sitemap.xml` (`sitemap.ts`) | Absolute URLs for `/`, `/privacy`, `/terms` only (Assumption: auth pages are left out) |
| `/opengraph-image` (`opengraph-image.tsx`) | PNG, 1200×630, showing the name, description and brand colours |
| `/icon`, `/apple-icon` (`icon.tsx`, `apple-icon.tsx`) | PNG icons in the brand colours. The manifest needs 192 and 512 px (Assumption) |

## 6. Database functions and triggers (migrations)

All `security definer` functions:
- use `set search_path = ''` with fully qualified names;
- run `revoke all on function … from public, anon`;
- are granted only to the roles listed below.

Catalog tests (D18) assert these grants.

### `public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean` (NFR-10)
- **Security:** `security definer`, `volatile`. EXECUTE is revoked from `public`, `anon` and `authenticated`, and granted to **`service_role` only**.
- **Args:** `p_key` is 1–200 characters. `p_max` must be ≥ 1. `p_window_seconds` must be 1–86400. Anything else raises `22023`, and the caller fails closed.
- **Behaviour:**
  1. `window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)`.
  2. Atomic upsert `insert … on conflict (key, window_start) do update set count = count + 1 returning count`.
  3. `delete … where window_start < now() - interval '24 hours'`.
- **Returns:** **`true` = allowed** (`count <= p_max`), **`false` = over the limit** (D24.12). A unit test and a DB test lock this in.
- **Table:** `private.rate_limits` has RLS on, no policies and no grants. It is in `NON_USER_DATA_TABLES`, and its keys are HMACs (D24.13).

### `public.claim_welcome_email() returns boolean` (FR-30)
- **Security:** `security definer`. EXECUTE is granted to `authenticated` only.
- **Behaviour:** `update public.profiles set welcome_email_sent_at = now() where id = auth.uid() and welcome_email_sent_at is null`. It returns `true` only if a row changed; `auth.uid()` being null returns `false`.

### `public.release_welcome_email(p_user_id uuid) returns void` (FR-30)
- **Security:** `security definer`. EXECUTE is granted to **`service_role` only** (D24.11).
- **Behaviour:** `update public.profiles set welcome_email_sent_at = null where id = p_user_id`.
- **Called only by:** the server, after a failed welcome send, with `p_user_id` from `getUser()` and never from input (rule 6).

### `public.mark_password_set() returns void` (FR-1, FR-8, FR-14)
- **Security:** `security definer`. EXECUTE is granted to `authenticated` only.
- **Behaviour** (D24.1): `update public.profiles set password_set_at = now() where id = auth.uid() and exists (select 1 from auth.users u where u.id = auth.uid() and coalesce(u.encrypted_password, '') <> '')`. It records the time only when a password hash really exists.
- **Called by:** `setInitialPassword`, `updatePasswordFromReset` and `changePassword`.

### `private.mfa_satisfied() returns boolean` (FR-58)
- **Security:** `security definer`, `stable`. It needs:
  - `grant usage on schema private to authenticated`;
  - `grant execute … to authenticated`, because policies run as the caller.

  It is revoked from `public` and `anon`, and isn't reachable over PostgREST (`private` isn't exposed).
- **Body:**
  ```sql
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
  ```
- **Used in:** `create policy … as restrictive for all to authenticated using (private.mfa_satisfied())` on every `USER_DATA_TABLES` table (D8).

### Trigger `handle_new_user` (FR-11)
- **Function:** `public.handle_new_user() returns trigger`, `security definer`. EXECUTE is revoked from `public`, `anon` and `authenticated`.
- **Trigger:** `after insert on auth.users for each row`.
- **Behaviour:** `insert into public.profiles (id, display_name) values (new.id, <name>)`.
  - `<name>` = `nullif(left(btrim(new.raw_user_meta_data->>'full_name'), 80), '')`, used only when `new.raw_app_meta_data->>'provider' = 'google'`; otherwise it is null.
  - **Assumption:** D12 says "Google's" metadata, and email sign-ups can set `full_name` themselves through the API.
  - The metadata is untrusted and always rendered as text.
  - If the insert fails, the user creation fails (exactly one row, FR-11). Identity linking inserts no second row.

### Trigger `set_updated_at` (FR-11)
- **Function:** `public.set_updated_at() returns trigger`, `security invoker`, `set search_path = ''`. It sets `new.updated_at = now()`.
- **Trigger:** `before update on public.profiles for each row`. Apps reuse it on their own tables.

## 7. Env var contract (D6 + D24.28)

- The schema in `src/lib/env/schema.ts` has three parts:
  - **`serverEnv`** (parsed once by `src/server/env.ts`, which is `server-only`);
  - **`publicEnv`** (`src/lib/env/public.ts`, referenced literally);
  - **`supabaseConfigEnv`** (checked by the README's `config push` step, **not** by the Next build).
- `next.config.ts` validates `serverEnv` and `publicEnv` at build time.
- Errors name the variable, never its value (FR-52).
- `.env.example` holds **placeholders only** (rule 8): each line is written by hand, never copied from `.env.local`.

| Name | Part | Public? | Zod rule (Assumption where marked) | `.env.example` |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | public | `z.url()`, no trailing slash. Optional only when `VERCEL_ENV=preview`: then the server-only `getSiteUrl()` falls back to `https://${VERCEL_BRANCH_URL}` (D24.23) | `NEXT_PUBLIC_SITE_URL=http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | public | `z.url()` | `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | public | starts with `sb_publishable_` (Assumption: the local CLI issues `sb_` keys; verify week 1) | `…=` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | public | non-empty | `…=` |
| `NEXT_PUBLIC_SENTRY_DSN` | public | public | `z.url()`; optional locally (Assumption: empty turns Sentry off) | `…=` |
| `SUPABASE_SECRET_KEY` | server | **secret** | starts with `sb_secret_`; used only by `src/server/supabase/admin.ts` | `…=` |
| `RATE_LIMIT_HMAC_SECRET` | server | **secret** | at least 32 characters (Assumption on length) (D24.13) | `RATE_LIMIT_HMAC_SECRET=` |
| `EMAIL_TRANSPORT` | server | server | `z.enum(["resend", "mailpit"])`; `mailpit` is refused when `VERCEL_ENV=production` | `EMAIL_TRANSPORT=<resend-or-mailpit>` |
| `RESEND_API_KEY` | server | **secret** | required when `resend`; also the SMTP password in `config.toml` | `RESEND_API_KEY=` |
| `EMAIL_FROM` | server | server | `Name <addr>` or `addr`; supplies the sender name (D24.25) | `EMAIL_FROM=<your-from-address>` |
| `MAILPIT_URL` | server | server | `z.url()`, required when `mailpit` | `MAILPIT_URL=http://127.0.0.1:54324` |
| `SENTRY_AUTH_TOKEN` | server (build) | **secret** | optional (Vercel builds only) | `…=` |
| `SENTRY_ORG`, `SENTRY_PROJECT` | server (build) | server | optional | `…=` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | supabaseConfigEnv | **secret** (ID: server) | read only by `config.toml` `env()`; **not set on Vercel** (D24.28) | `…=` |
| `TURNSTILE_SECRET_KEY` | supabaseConfigEnv | **secret** | read by `config.toml` `env()`; **not set on Vercel** (D24.28). An app that adds a public form and uses `verifyTurnstile()` must also add it to `serverEnv` and Vercel | `…=` |
| `SUPABASE_DB_URL` | scripts/CI only | **secret** | session-pooler URL for `scripts/backup.sh`; a GitHub secret in CI | `SUPABASE_DB_URL=` |
| `BACKUP_AGE_RECIPIENT` | scripts/CI only | public key | `age1…` recipient; a GitHub repo variable | `BACKUP_AGE_RECIPIENT=` |
| `E2E_TARGET` | tests only | – | `z.enum(["local", "deployed"])`, empty means `local` | `E2E_TARGET=` |
| `E2E_EMAIL` | tests only | – | email address; required when `deployed` (the Resend owner address, D7) | `E2E_EMAIL=` |

- **Not in `.env.example`:**
  - the Turnstile dummy keys (CI `env` and README, D4);
  - `VERCEL_ENV` and `VERCEL_BRANCH_URL`, which Vercel sets.
- Every row above also gets a README entry (FR-46).

## 8. Index

| Operation | Kind | Who | Turnstile | Screen | FR / NFR |
| --- | --- | --- | --- | --- | --- |
| `signUp` | action (auth.ts) | signed-out | yes | S-5 | FR-1, 2; NFR-10, 11, 12, 26 |
| `setInitialPassword` | action | password-unset | – | S-9 | FR-1, 2; NFR-26 |
| `signIn` | action | signed-out | yes | S-4 | FR-3, 9, 30, 58; NFR-10, 11, 12 |
| `requestMagicLink` | action | signed-out | yes | S-4 | FR-4; NFR-10, 11, 12 |
| `requestPasswordReset` | action | signed-out | yes | S-6 | FR-7; NFR-10, 11, 12 |
| `updatePasswordFromReset` | action | recovery | – | S-7 | FR-8 |
| `signInWithGoogle` | action | public | – | S-4, S-5, S-11 | FR-5, 56 |
| `signOut` | action | no guard | – | C-1, S-9, S-10 | FR-6 |
| `reauthenticateWithPassword` | action | user (has password) | yes | S-11 | FR-56 |
| `startMfaEnrollment` | action (mfa.ts) | recent | – | S-16 | FR-57 |
| `confirmMfaEnrollment` | action | recent | – | S-16 | FR-57 |
| `verifyMfaSignIn` | action | aal1-pending | – | S-10 | FR-58 |
| `disableMfa` | action | recent | – | S-16 | FR-59, 56 |
| `updateDisplayName` | action (account.ts) | user | – | S-14 | FR-12 |
| `changePassword` | action | recent (has password) | – | S-15 | FR-14, 56 |
| `deleteAccount` | action | recent | – | S-18 | FR-16, 56; NFR-16 |
| `GET /auth/confirm` | route | public | – | → S-7/S-8/S-9/S-10/S-12 | FR-2, 4, 8, 30 |
| `GET /auth/callback` | route | public | – | → S-4/S-8/S-12 | FR-5, 30, 56; NFR-26 |
| `GET /account/export` | route | user | – | S-17 | FR-15; NFR-16 |
| `/monitoring` | route (generated) | public | – | – | FR-31; NFR-17 |
| manifest, robots, sitemap, OG, icons | metadata routes | public | – | – | FR-24, 25, 26 |
| `rate_limit_hit` | DB function | service_role | – | – | NFR-10 |
| `claim_welcome_email` | DB function | authenticated | – | – | FR-30 |
| `release_welcome_email(p_user_id)` | DB function | service_role | – | – | FR-30 |
| `mark_password_set` | DB function | authenticated | – | – | FR-1, 8, 14 |
| `private.mfa_satisfied` | DB function (policy) | authenticated (via RLS) | – | – | FR-58; NFR-1 |
| `handle_new_user`, `set_updated_at` | DB triggers | trigger only | – | – | FR-11 |

- NFR-3 (auth check), NFR-6 (Zod) and NFR-9 (plain errors) apply to every row. The signed-out refusal test (D18) calls every action.
- **UX coverage:** every UX screen with a form maps to an operation above.
  - S-1, S-2, S-3, S-8, S-12, S-13, S-19 and S-20 are read-only pages. S-1 reads `?account`, S-8 reads `?reason`, S-13/S-17 read `?export`.
  - S-12 and C-1 read `profiles.display_name` in a server component through the user client (RLS), not through an action.

## 9. Later (not v1)
- **`changeEmail` (FR-13, deferred 2026-09-26):**
  - `recent`, both addresses confirm (`secure_email_change`), a fifth template, and `/auth/confirm` handling `type=email_change`.
  - Not specified until it's picked up. Until then, S-14 shows the email read-only with "To change your email, contact support" (D24.26).

## Resolved (RFC D24)
All 14 earlier questions were answered by the PM on 2026-09-26 and are applied above:
- `ActionResult<T>` with `data` (D24.21), including the `otpauth://` URI (D24.22).
- MFA enrollment needs a recent sign-in (D24.3).
- `requireUser(options)` with `allowPendingMfa` / `allowPendingPassword`; `signOut` has no guard (D24.2).
- `auth_next` for magic link, Google and re-auth; Google cancel always goes to `/sign-in?error=oauth_cancelled` (D24.8).
- ~500 ms minimum on all four enumeration-sensitive actions (D24.10).
- The password maximum is 72 bytes (D24.15).
- Extra rate-limit rows for enrollment, Google, confirm and callback (D24.14).
- Recovery is detected by `amr` plus the `auth_recovery` cookie fallback (D24.6); other sessions are signed out after a password change (D24.4).
- "Has a password" = `password_set_at`, and `mark_password_set` is called by three actions and checks the hash (D24.1).
- `release_welcome_email(p_user_id)` is service_role only (D24.11).
- For `rate_limit_hit`, `true` = allowed (D24.12), and the keys are HMACs (D24.13).
- `/monitoring` is a documented exception (D24.16).
- Export failures redirect back to `/settings` (D24.19).
- `getSiteUrl()` is server-only (D24.23).
- `/auth/error?reason=link|oauth|rate_limited` (D24.27).
- Env additions and the `supabaseConfigEnv` split (D24.28).

## Mismatch notes for other docs
All resolved by the PM on 2026-09-26: notes 1, 3 and 5 were already fixed in the UX spec; note 2 → `?notice=` enum (RFC D24.31); note 4 → API-1 to API-7 added to the UX spec (D24.32).
