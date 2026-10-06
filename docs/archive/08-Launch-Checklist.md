# Template: Sign-off Checklist (v1)

Target: Mon 2026-11-16 (see `ROADMAP.md`) · The Template itself is never deployed, so this is its **v1 sign-off list**, done on a throwaway test app. The generic list every app copies and tailors is [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md).

Record each result (date, numbers, links to screenshots or reports) in a `docs/decisions/` entry, "v1 sign-off".

## The four success metrics (PRD)
- [ ] **New app in under 1 hour:** stopwatch run from "Use this template" to a working sign-in on `*.vercel.app`, following only the README, with the keys already made. Start and end times and any README deviations recorded.
- [ ] **Full e2e passes in CI:** the e2e job is green on every push to `main` in the last week before sign-off, and the deployed run (3 pasted links, RFC D7) passes once. Playwright report saved.
- [ ] **RLS tests on every table:** the registry coverage test and the RLS suite pass in CI (NFR-1, NFR-2).
- [ ] **Security scan clean:** `npm audit --audit-level=high` 0, gitleaks 0, securityheaders.com grade A or better on the throwaway app (screenshot saved).

## Security and privacy
- [ ] `/pre-push-review` passed on the release commit; CI green
- [ ] Signed-out refusal test covers every exported server action and route handler (NFR-3)
- [ ] The bundle scan finds no secret values; a deliberate bad client import fails the build once (NFR-4)
- [ ] No CSP violations in the browser console on the whole e2e journey. The style rule in use (split or fallback) is recorded (RFC D5)
- [ ] Session cookies are HttpOnly, Secure and SameSite=Lax on the deployed app; no tokens in `localStorage`/`sessionStorage` (NFR-14)
- [ ] A Sentry test event from a request carrying an email, token, cookie and body contains none of them (NFR-17)
- [ ] Manual NFR-26 test on the throwaway app: an unconfirmed email sign-up plus a Google sign-in on the same email leave no usable attacker password
- [ ] Enumeration checks pass: identical responses for existing and unknown emails on sign-up, sign-in, magic link and reset (NFR-12)
- [ ] Privacy and terms placeholders list the service providers and the 30-day backup retention, and are clearly marked as placeholders (FR-17, RFC D24)
- [ ] Week-1 checks recorded in `docs/decisions/`: Podman, Mailpit send API, sign-up email template, auth tables that keep IPs/user agents after deletion, Vercel Analytics sets no cookies

## Operations
- [ ] A thrown test error reaches Sentry and the alert email arrives (FR-31)
- [ ] Vercel Web Analytics shows page views from the throwaway app (FR-32)
- [ ] An encrypted backup was restored into a fresh Supabase project: row counts match and a test user can sign in. Date recorded in the README (FR-35)
- [ ] Vercel rollback done once on the throwaway app, and it works against the forward-migrated database (FR-36)
- [ ] `supabase config push` run with the `[remotes.production]` block filled in, and SMTP still set afterwards (RFC D7)
- [ ] Vercel Ignored Build Step skips `dependabot/*` previews (RFC D24)
- [ ] `GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY` are **not** set on Vercel (RFC D24)

## Docs
- [ ] README: Fedora setup works from scratch (FR-44), the "start a new app" checklist was the only guide for metric 1 (FR-45), every env var explained (FR-46)
- [ ] CLAUDE.md: project structure and commands filled in (FR-47); rules updated to match the RFC (cookies, Turnstile scope, stack)
- [ ] `docs/LAUNCH_CHECKLIST.md` has the RFC items for apps: MFA lost-authenticator rule, `config push` remote block, Supabase pause check, Resend sending domain, Vercel Pro once commercial (FR-48)
- [ ] `docs/decisions/` has entries for every change from the RFC made during the build (FR-49)

## Cleanup
- [ ] Throwaway app deleted: the GitHub repo, the Vercel project, the Supabase project, its Turnstile hostname, its Google OAuth client and its Sentry project
- [ ] README "Apps built from this template": gift registry row updated with its real start date
