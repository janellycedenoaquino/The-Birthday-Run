# 0006. Env schema requires the sb_ key prefixes (week-1 check 9)

Date: 2026-09-28 · Status: accepted

## Context
BUILD F-2 kept the two Supabase key rules at "non-empty" until week-1 check 9 showed which key format the local CLI issues (0004 P7).

## Decision
The local Supabase CLI 2.118 issues `sb_publishable_…` and `sb_secret_…` keys (seen on `supabase start`, decision 0005), so `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must start with `sb_publishable_` and `SUPABASE_SECRET_KEY` with `sb_secret_`. A legacy JWT key, or the two keys swapped, fails the build naming the variable.

## Alternatives
- Keep "non-empty": a swapped key would reach the browser unnoticed until the bundle scan, or not at all for the legacy formats.

## Consequences
Legacy `anon` / `service_role` JWT keys are refused; hosted projects must use their new API keys (Supabase deprecates the legacy ones by the end of 2026). BUILD F-2 "Key formats" updated.
