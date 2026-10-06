# 0007. How the Supabase CLI resolves env() (week-1 check 7)

Date: 2026-09-28 · Status: accepted

## Context
`config.toml` reads secrets through `env(...)` (Turnstile, Google, and Resend for production SMTP). BUILD F-1 left two week-1 questions: which env files the CLI reads, and whether `supabase start` fails with Google enabled and empty credentials.

## Decision
Tested with Supabase CLI 2.118.0 on Podman (decision 0005):
- The CLI reads `.env` and `.env.local` in the project root **and** in `supabase/` (each tested alone). `npm run check:supabase-env` now loads the same four files, so it checks what the CLI will see.
- An unset variable doesn't fail `supabase start` and prints no warning: the CLI passes the literal text `env(NAME)` to Auth. With Turnstile that means every CAPTCHA check fails; with Google, sign-in fails at Google.
- So every environment sets all four `supabaseConfigEnv` values: locally the Cloudflare always-pass test secret and non-secret Google placeholders (README), in CI the same dummies, and for `config push` the real ones (checked first by `check:supabase-env`).
- Podman doesn't create a missing bind-mount folder, so Studio needs `supabase/snippets/` to exist; it ships with a `.gitkeep` and its contents are gitignored.

## Alternatives
- Rely on the CLI to reject missing values: it doesn't.

## Consequences
CI (#6) sets `TURNSTILE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `RESEND_API_KEY` to dummies before `supabase start`, after `check:supabase-env`. README local setup lists the local values.
