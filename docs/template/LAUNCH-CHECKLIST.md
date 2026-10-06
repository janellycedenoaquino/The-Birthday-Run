# Template: Sign-off Checklist (v1)

Target: the Phase 6 date in `ROADMAP.md`. The Template itself is never deployed (SPEC §1), so this is its **v1 sign-off list**, worked through on a throwaway test app. The generic list every app copies and tailors is [`docs/LAUNCH_CHECKLIST.md`](../LAUNCH_CHECKLIST.md).

Record each result (date, numbers, links to screenshots or reports) in a `decisions/` entry named "v1 sign-off".

## The four success metrics (SPEC §2.1)
- [x] **Metric 1, new app in under an hour:** the stopwatch run, measured as SPEC §2.1 says. Start and end times and any README deviations recorded. *(2026-09-29: 54 min; live sign-up needed a URL fix the next day, decisions/0016)*
- [x] **Metric 2, full e2e:** green in CI as SPEC §2.1 says, and the deployed run (DESIGN D7) passes once. Playwright report saved. *(2026-09-29: deployed run accepted by the Builder after a manual check, no automated pass; decisions/0016)*
- [x] **Metric 3, RLS tests on every table:** the registry coverage test and the RLS suite pass in CI (NFR-1, NFR-2).
- [x] **Metric 4, security scan clean:** the three scans in SPEC §2.1 meet their targets on the throwaway app (screenshot saved).

## Security and privacy
- [x] `/pre-push-review` passed on the release commit; CI green *(2026-09-29; re-check on the final commit)*
- [x] The signed-out refusal test covers every exported server action and route handler (NFR-3)
- [x] The bundle scan finds no secret values, and a deliberate bad client import failed the build once (NFR-4) *(decisions/0017)*
- [x] No CSP violations in the browser console on the whole e2e journey; the style rule in use (split or fallback) is recorded (DESIGN D5) *(2026-09-30 by hand on the deployed app; CI's e2e checks the journey; decisions/0011, 0016)*
- [x] Session cookies have the flags in BUILD §0.7 on the deployed app, with no tokens in browser storage (NFR-14) *(2026-09-30, decisions/0016)*
- [x] A Sentry test event from a request carrying an email, token, cookie and body contains none of them (NFR-17) *(2026-09-30)*
- [x] The manual NFR-26 test on the throwaway app (DESIGN D10) leaves no usable attacker password
- [x] Enumeration checks pass on sign-up, sign-in, magic link and reset (NFR-12) *(2026-09-30)*
- [x] The privacy and terms placeholders list what DESIGN D24.20 requires and are clearly marked as placeholders (FR-17)
- [x] Week-1 check results recorded in `decisions/` (BUILD, "Week-1 checks") *(1–12: decisions/0017; 13: decisions/0016, 2026-09-30)*

## Operations
- [x] A thrown test error reaches Sentry and the alert email arrives (FR-31) *(2026-09-30)*
- [x] Vercel Web Analytics shows page views from the throwaway app (FR-32) *(2026-09-30)*
- [ ] An encrypted backup was restored into a fresh Supabase project with the checks in BUILD F-12; the date is recorded in the README (FR-35) *(2026-09-29: restored, counts match; sign-in on the restored project not tried, accepted with a note 2026-09-30, decisions/0016)*
- [x] Vercel rollback done once on the throwaway app, working against the forward-migrated database (FR-36)
- [x] `supabase config push` run with the production remote block filled in, and SMTP still set afterwards (DESIGN D7)
- [x] Dependabot preview builds are skipped (DESIGN D24.17) *(2026-09-30)*
- [x] The secrets that only `supabase config push` reads are **not** set on Vercel (DESIGN D24.28, BUILD §0.6)

## Docs
- [ ] README: Fedora setup works from scratch (FR-44), the "start a new app" checklist was the only guide for metric 1 (FR-45), and every env var is explained (FR-46) *(FR-46 done; FR-45 not met on 2026-09-29, gaps fixed; FR-44 deferred: decisions/0016)*
- [x] CLAUDE.md: project structure and commands filled in (FR-47)
- [x] `docs/LAUNCH_CHECKLIST.md` has the items apps need from DESIGN §1: the lost-authenticator rule (D24.29), the `config push` remote block (D7), the Supabase pause check (D19), the Resend sending domain (D7) and Vercel Pro once commercial (D19) (FR-48)
- [x] `decisions/` has an entry for every change from DESIGN §1 made during the build (FR-49)

## Cleanup
- [x] Throwaway app deleted: the GitHub repo, Vercel project, Supabase project, its Turnstile hostname, Google OAuth client and Sentry project *(2026-09-29: also the restore project and the Resend key. `template-signoff-2` from the 2026-09-30 run: pending)*
- [x] README "Apps built from this template": the gift registry row updated with its real start date *(2026-10-01)*
