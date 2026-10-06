# 0004. Conflicts between the old design docs, resolved

Date: 2026-09-28 · Status: accepted

## Context
During the restructure (0002), the old detailed design (06) and API spec (07) turned out to disagree in nine places. Both had been approved on 2026-09-26, so one version had to be chosen for each. A few other lines were simply stale against D24 and follow D24 (for example `?notice=account_deleted` per D24.31).

## Decision
The user approved these on 2026-09-28. The BUILD and SPEC sections that implement them cite them as `0004 P1`…`0004 P9`.

- **P1. `mark_password_set()`** returns `boolean` (true when it recorded), keeps the first time (`coalesce`), and records only when a password hash exists (D24.1). From 06; 07 had `void` and `now()`.
- **P2. `claim_welcome_email()`** also requires a confirmed email (06). Defence in depth; no behavior change.
- **P3. `handle_new_user`** takes the display name only from a `google` identity's `full_name` (06, D12).
- **P4. `updatePasswordFromReset` without a recovery marker** shows the "reset link needed" message (M-13), not API-1.
- **P5. Password too long:** C-5's wording (M-33), because the limit is in bytes, so a character count would be wrong.
- **P6. `NEXT_PUBLIC_SITE_URL`** is required when `VERCEL_ENV=production` and optional elsewhere.
- **P7. Supabase key format:** a non-empty check until week-1 check 9 confirms the local key format, then the `sb_` prefixes.
- **P8. Env schema parts:** `TURNSTILE_SECRET_KEY` only in `supabaseConfigEnv`; `RESEND_API_KEY` in both parts; `GOOGLE_CLIENT_ID` is secret, read only by `config push`.
- **P9. `auth_recovery` cookie** is set only if week-1 check 5 shows `amr` lacks `recovery` (D24.6).

## Alternatives
The other doc's version in each case (listed above).

## Consequences
BUILD F-1, F-2, F-6, F-8 and CI, and SPEC §3.4, follow these. `docs/archive/06-Detailed-Design.md` and `07-API-Spec.md` still show both versions; `docs/template/` wins.
