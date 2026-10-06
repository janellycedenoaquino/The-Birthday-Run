# 0013. Email pipeline week-1 checks: react-email export, Mailpit send, OTP templates

Date: 2026-09-29 · Status: accepted

## Context
BUILD F-5 left three week-1 checks (BUILD CI "Week-1 checks" 2, 3 and 8) to #17: how react-email 6.11's CLI exports templates, whether the local Mailpit accepts the app's welcome email over its API, and which template and `type` GoTrue uses for `signInWithOtp` (which decides D24.7's pending `email` type on `/auth/confirm`).

## Decision
- **Check 8 (react-email 6.11):** `email export --dir src/emails --outDir .email-out` works and skips `components/`, but renders each template **without** its `PreviewProps`. So the auth templates take no props and write GoTrue's placeholders (`{{ .SiteURL }}`, `{{ .TokenHash }}`) directly; they survive rendering unescaped, and `&` in the link becomes `&amp;` (browsers decode it). The package is one unified `react-email` (components and `render` together; `@react-email/components` isn't used). Its binary is `email`, not `react-email`. `npm run email:build` output is byte-for-byte stable across runs, so CI's in-sync check is reliable.
- **Check 2 (Mailpit):** `POST /api/v1/send` is enabled in the Supabase CLI's Mailpit. `From` is an object `{ Name?, Email }`, `To` is `[{ Email }]`, plus `Subject`, `HTML`, `Text`. No SMTP fallback needed.
- **Check 3 (templates for OTP):** measured against local GoTrue with our templates (`tests/rls/auth-emails.test.ts`): a **new** user through `signInWithOtp({ shouldCreateUser: true })` gets the `confirmation` template (E-1) and its `type=signup` link verifies; an **existing** user gets `magic_link` (E-2, `type=magiclink`); a reset gets `recovery` (E-3). Every baked-in `type` verifies with `verifyOtp`. So `email` is **not** needed on `/auth/confirm`: the allow-list is `signup | magiclink | recovery` (D24.7's pending item, resolved narrower).

## Alternatives
- Pass `PreviewProps` through a custom render script instead of the CLI: needs a TypeScript runner (a new package) for no gain.
- Keep `email` in the allow-list "just in case": a wider input for a type none of our links carry.

## Consequences
BUILD F-5 (templates, `email:build`, transport) and F-6 (`/auth/confirm` query enum) are updated. The auth-email test runs in the `rls` suite (CI's integration job) after `supabase start` loads the committed templates; after changing a template locally, restart the stack (`npm run db:stop && npm run db:start`).
