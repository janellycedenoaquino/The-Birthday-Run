# 0017. Sign-off checks done in the repo: bad import, week-1 checks 10–13, vercel.json

Date: 2026-09-29 · Status: accepted

## Context
LAUNCH-CHECKLIST items that need no deployed app, done after the throwaway-app run (decision 0016).

## Decision
- **NFR-4, deliberate bad import:** a `"use client"` component importing `@/server/env`, rendered on `/privacy`, failed `next build` (exit 1): *"You're importing a module that depends on "server-only"…"* at the component, for both the browser and SSR bundles. The change was thrown away, never staged. (An import that nothing renders is dropped by the bundler and builds fine; the proof needs it rendered.)
- **Week-1 check 10:** Cloudflare's siteverify answers the dummy token with `success: true` for secret `1x0000000000000000000000000000000AA`, `false` / `invalid-input-response` for `2x0000000000000000000000000000000AA` (always fails), and `false` / `timeout-or-duplicate` for `3x…AA`. `captcha_failed` → M-6 is unit-tested in each auth action; a GoTrue run with the `2x` secret is not automated (it needs a second local stack config).
- **Week-1 check 11:** covered by the FR-10 test (`tests/unit/proxy-session.test.ts`): an expired `sb-…-auth-token` cookie is replaced, and the page sees the fresh one.
- **Week-1 check 12** (local stack): after `admin.deleteUser`, `auth.sessions` (IP, user agent), `refresh_tokens`, `identities` and MFA rows are gone; `auth.audit_log_entries` keeps `user_signedup`, `login` and `user_deleted` rows with the email and user id (`ip_address` empty locally; hosted Supabase may fill it). The privacy placeholder now says so (SPEC S-2, DESIGN §4). Vercel's docs: Web Analytics uses no third-party cookies and identifies visitors by a request hash discarded after 24 hours.
- **Week-1 check 13, and D24.17:** `vercel.json` was planned (BUILD) but missing; added with the planned `ignoreCommand`. Locally the command exits 0 (skip) for `dependabot/npm_and_yarn/…` and 1 (build) for `main`, a feature branch and an empty ref; Vercel's docs confirm exit 0 = skip. **Still to see once** on a real Dependabot PR against a Vercel project (next sign-off run).

## Consequences
- Check 13's live half and the deployed-app items stay on the next sign-off run.
- The audit rows (email, user id, possibly IP) outlive account deletion, and v1 has no clean-up. The privacy placeholder says so. An app that must erase them (e.g. for GDPR requests) decides how: deleting its own rows from `auth.audit_log_entries` on account deletion, or relying on Supabase's log retention.
