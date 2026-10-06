# 0008. Clear a password set before email confirmation (T2, week-1 check 6)

Date: 2026-09-28 · Status: accepted (user, 2026-09-28)

## Context
D10 closes pre-account takeover by never letting the app set a password before the inbox owner confirms. The pre-push review of F-1 (#4, #5) found that GoTrue's own `POST /auth/v1/signup` stays reachable, because email sign-ups must stay enabled for D10's `signInWithOtp` sign-up. Tested on local Supabase (GoTrue v2.197.0): a direct call with the victim's email, a chosen password and a Turnstile token creates an unconfirmed user with that password; when the victim clicks the genuine "Confirm your email", the attacker signs in as them (NFR-26 broken).

Week-1 check 6 answered at the same time: GoTrue stores a random password hash for a new `signInWithOtp` user, so "empty before a password is set" (D24.1) doesn't hold, and `mark_password_set` would record a password the owner never chose.

## Decision
F-1 migration 4: a `before update of email_confirmed_at` trigger on `auth.users` clears `encrypted_password` when an email is confirmed through a confirmation email Supabase sent (`confirmation_sent_at` set). Only the verified owner then sets a password (`/auth/set-password`, D10), and `mark_password_set` sees an empty hash until they do. Users confirmed by the admin API without an email keep their password.

## Alternatives
- Disable email sign-ups: breaks D10's `signInWithOtp` sign-up.
- Create users through the admin API in `signUp`: one more secret-key use (rule 6) and D10 rework.
- A `before_user_created` Auth hook rejecting passwords: depends on what the hook payload exposes; a trigger covers the confirmation step itself, whichever endpoint created the user.
- Clear the password on insert: admin-created confirmed users lose theirs (tested: GoTrue confirms in a separate update).

## Consequences
`tests/rls/signup.test.ts` runs the attack and D10's own flow through real Mailpit emails. BUILD F-1 (migration 4, Tests), DESIGN D10 and T2 updated. Same review: `rate_limit_hit` now rejects NULL arguments with 22023 (migration 3, never applied outside local), and `config.toml` keeps Supabase's 60 s per-user email frequency (D3) instead of the local default 1 s.
