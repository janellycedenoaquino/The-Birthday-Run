# 0014. Reset sessions are marked by a signed cookie (week-1 check 5)

Date: 2026-09-29 · Status: accepted

## Context
The `recovery` level (BUILD §0.2, D24.6) must know a session came from a password-reset link, so S-7 lets its holder set a new password without the old one. BUILD planned to read that from the JWT's `amr` and keep the `auth_recovery` cookie as a fallback only if week-1 check 5 showed `amr` lacked it. #16's review had already ruled out a bare `"1"` cookie: anyone holding a session could set it and skip the old-password check.

## Decision
- **Check 5 result** (local GoTrue, `tests/rls/recovery-amr.test.ts`): after `verifyOtp({ type: 'recovery' })` the session's `amr` is `[{ method: "otp" }]`, exactly like a magic link. The JWT can't tell a reset session apart.
- So `/auth/confirm` sets `auth_recovery` for `type=recovery`, **signed**: `<issued ms>.<HMAC-SHA256>` over `auth_recovery:<user id>:<session id>:<issued ms>`, keyed with `RATE_LIMIT_HMAC_SECRET` (domain-separated from the limiter's keys, so no new env var). HttpOnly, Secure, Lax, `Path=/`, 15 minutes (D24.6).
- The session id binds the marker to the reset link's own session (#15 review): a later sign-in on the same browser can't use it, and sign-out clears it.
- `isRecoverySession` accepts an `amr` `recovery` entry (if a GoTrue upgrade adds one) **or** a marker that verifies for this user and session within the window (constant-time compare). A bare, foreign, tampered, future-dated or expired marker never counts. `updatePasswordFromReset` clears it.

## Alternatives
- Trust `amr` alone: never true on this GoTrue version, so reset would never work.
- An unsigned marker (the original fallback): forgeable by any session holder.
- A server-side table of reset sessions: more moving parts for the same guarantee.

## Consequences
Rotating `RATE_LIMIT_HMAC_SECRET` also voids open reset markers (15 minutes at most). BUILD §0.7, F-2 and F-8 describe the marker; if the check-5 test starts failing after a GoTrue upgrade (an `amr` `recovery` entry appears), the marker could be dropped.
