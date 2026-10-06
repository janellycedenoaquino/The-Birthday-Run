# Template: Roadmap

Last updated: 2026-09-28 (re-estimated from Phase 1's actual times) · Capacity: ~20 hrs/week from Mon 2026-09-28 · Deadline: none fixed. Target: **Fri 2026-10-09** (was Mon 2026-11-23). The gift registry starts after v1 sign-off (SPEC §1, decisions/0003).

## Summary
Six phases, each ending with something that runs and is tested: foundations → security core and shell → accounts → settings and MFA → e2e, backups and docs → throwaway-app sign-off. The original part-by-part estimate was **103–168 hours**; parts #1–#5 took about 6% of theirs, so the remaining work is re-estimated at **~12–20 hours** (see "Re-estimate" below).

| Case | Hours left (from Sep 28) | Finish (at 20 hrs/week) |
| --- | --- | --- |
| Optimistic, no buffer | ~12 | about Oct 3 |
| Likely (midpoint + 15% buffer) | ~18 | **about Oct 6** |
| Worst (upper + 15% buffer) | ~23 | **about Oct 9** (the target, with 2–3 days' slack for usage limits) |

Nothing is cut in advance. The weekly check below says when the plan is late, and then **you choose** between the cut list and moving the date.

**How to read a phase:** start every session with `docs/template/OVERVIEW.md`, then load only the phase's "Read" list below. Section names: SPEC/DESIGN/BUILD are in `docs/template/`.

| Phase | Features | FRs / NFRs | Hours (re-estimate; was) | Finish by (upper + 15%; was) | Read | Issues |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Foundations | F-1, F-2 (env part), CI | FR-11, 37, 40–43, 52, 53 · NFR-1, 2, 4, 5, 20, 25 | ~1 left (#6, #7) (was 22–37) | Tue Sep 29 (was Tue Oct 13) | BUILD §0.1, §0.6, §0.8, F-1, F-2 (env and bundle scan), CI · DESIGN D1, D6, D12, D18, D20, D23, §3 | #1–#7 |
| 2. Security core + shell | F-2, F-3, F-4 | FR-17, 20–27, 31, 32 · NFR-6–11, 13, 17, 23, 24 | ~4 (was 23–38) | Thu Oct 1 (was Wed Oct 28) | BUILD §0, F-2, F-3, F-4 · DESIGN D2–D5, D15, D16, D21, §4.1 · SPEC §3.1, §3.2, S-1–S-3, S-12, S-19, S-20, §3.4, §3.6, §3.7 | #8–#12 |
| 3. Accounts | F-5, F-6, F-7, F-8, F-9 | FR-1–10, 18, 28–30, 56 · NFR-3, 12, 14, 26 | ~5 (was 22–35) | Sat Oct 3 (was Wed Nov 11) | BUILD §0.2–§0.5, §0.7, F-5–F-9 · DESIGN D7, D9–D11, D22, D24 · SPEC S-4–S-11, §3.4 (M-, API-, E- messages) | #13–#17 |
| 4. Settings + MFA | F-10, F-11 | FR-12, 14–16, 19, 57–59 · NFR-16 | ~2.5 (was 15–25) | Sun Oct 4 (was Sat Nov 21) | BUILD §0.2, §0.4, §0.5, F-10, F-11 · DESIGN D8, D12, D13, §3 · SPEC S-10, S-13–S-18, §3.4 | #18–#21 |
| 5. E2E, backups, docs | F-12, CI | FR-33–35, 38, 39, 44–51, 55 · NFR-15, 18, 19, 22 | ~5 (was 16–25) | Wed Oct 7 (was Tue Dec 1) | BUILD F-12, CI · DESIGN D14, D18, §5 · LAUNCH-CHECKLIST | #22–#24 |
| 6. Sign-off | CI (deploy) | FR-36, 54 · metrics 1–4 · NFR-21 | ~3.5 (was 5–8) | Fri Oct 9 (was Fri Dec 4) | LAUNCH-CHECKLIST · BUILD CI · DESIGN D19 · SPEC §2.1 | #25 |

FR-13 (change email, F-13, #26) is **later**, if time allows after v1.

**Progress board:** [Template v1](https://github.com/users/janellycedenoaquino/projects/9) (one issue per part below; milestones = phases, due on the "finish by" dates). Log actual hours on each card.

## Phases
Part hours in brackets are the **original** estimates; the current ones are in "Re-estimate" below.

### Phase 1: Foundations (22–37 hrs)
- **Parts:**
  - Machine setup from DESIGN D1 and D23: Node LTS, Podman socket, gitleaks, age; Supabase CLI via npm (2–4) #1
  - Next.js scaffold with strict TS, ESLint rules (BUILD §0.1), Prettier, shadcn, the folder structure in BUILD §0.1 (3–5) #2
  - Env schema and parser, `.env.example` (placeholders only), bundle secret scan (BUILD F-2) (3–5) #3
  - `supabase/config.toml`, the migrations and type generation (BUILD F-1) (5–8) #4
  - RLS test harness, catalog tests, the user-data registry and its coverage test (BUILD F-1) (5–8) #5
  - CI jobs, Dependabot, confirm the hooks still block (BUILD CI) (4–7) #6
- **Week-1 checks (#7):** the ones due in phase 1 (list: BUILD CI, "Week-1 checks"). Record results in `docs/template/decisions/`.
- **Done when:** lint, typecheck, unit and RLS suites pass locally and in CI on a push; an RLS test proves user B and a signed-out visitor can't read user A's `profiles` row; a deliberate client import of the server env module fails the build.
- **Most likely to run over:** Podman + Supabase CLI (SPEC §1 risk), then the CI integration job (the first run of local Supabase on GitHub runners).

### Phase 2: Security core + shell (23–38 hrs)
- **Parts:**
  - Proxy, CSP builder (split style rule + fallback switch), static headers, header tests (BUILD F-2) (5–9) #8
  - Config file, brand CSS variables, layout, header/footer, dark mode, contrast test (BUILD F-3) (4–6) #9
  - Landing, privacy/terms placeholders, 404/error pages, metadata, sitemap, robots, OG image, manifest and icons (BUILD F-3) (5–8) #10
  - Rate limiter, Turnstile widget and Supabase CAPTCHA config (BUILD F-2) (4–7) #11
  - Safe redirects, error module, Sentry with scrubber tests, Vercel Web Analytics (BUILD F-2, F-4) (5–8) #12
- **Done when:** every route returns the CSP and security headers in tests; the browser console shows no CSP violations on the shell pages; a thrown test error reaches Sentry with no email, cookie or token in it; axe reports 0 serious issues on the shell pages.
- **Most likely to run over:** the nonce CSP with Turnstile, Sentry, the theme script and toasts (SPEC §1 risk). If the split style rule breaks a library, apply the fallback in DESIGN D5 and log it; don't spend days on it.

### Phase 3: Accounts (22–35 hrs)
- **Parts:**
  - Email-first sign-up → confirm → set password (BUILD F-6) (5–8) #13
  - Password sign-in, magic link, Google and sign-out, with identical responses (BUILD F-7) (5–8) #14
  - Password reset and recovery-session detection (BUILD F-8) (3–5) #15
  - Guard options, recent-sign-in check, re-authentication page, signed-out refusal test (BUILD F-2, F-9) (3–5) #16
  - Email templates, the build step into Supabase templates, welcome email claim/release (BUILD F-5) (6–9) #17
- **Done when:** locally, with Mailpit: sign up → verify → set password → welcome email → sign out → sign in with password and with a magic link → reset works; enumeration tests show identical responses; every action refuses a signed-out call; cookies have the BUILD §0.7 flags and nothing is in browser storage.
- **Most likely to run over:** the email pipeline (export into Supabase templates, `config push`) and the Google OAuth round-trip, which can only be tested by hand.

### Phase 4: Settings + MFA (15–25 hrs)
- **Parts:**
  - Settings page: display name, change password (and sign out other sessions), read-only email (BUILD F-11) (3–5) #18
  - MFA enrollment, sign-in code step, turning it off, restrictive RLS tests with the TOTP helper (BUILD F-10) (7–11) #19
  - Data export and its coverage test (BUILD F-11) (3–5) #20
  - Delete account and its test (BUILD F-11) (2–4) #21
- **Done when:** an aal1 session of an MFA user can't read their own `profiles` row (RLS test); the export contains every registry table and nothing of user B; after deletion the user can't sign in and their rows are gone.
- **Most likely to run over:** MFA enforcement across guards, RLS and the reset flow.

### Phase 5: E2E, backups, docs (16–25 hrs)
- **Parts:**
  - Playwright journey plus header, CSP-console, cookie, axe and enumeration checks; the `manual` mailbox adapter for deployed runs (BUILD CI) (8–12) #22
  - Backup script and workflow, a restore into a scratch project, recorded (BUILD F-12) (4–7) #23
  - README: Fedora setup (Podman), "start a new app" checklist, every env var; CLAUDE.md structure and commands; new items in `docs/LAUNCH_CHECKLIST.md` (4–6) #24
- **Done when:** the full e2e passes in CI on `main`; one encrypted backup has been restored into a fresh Supabase project with matching row counts and a working sign-in; the FR-44 run-through succeeds from the README alone.
- **Most likely to run over:** flaky e2e around email timing and Turnstile test keys.

### Phase 6: Sign-off (5–8 hrs)
- **Parts (#25):** create a throwaway app from the Template (keys pre-made) and time it; deploy it; link it and push migrations and auth config; the deployed e2e run; one Vercel rollback; the header scan; the manual Google-linking test (NFR-26); record everything; delete the app and its services. The full list is LAUNCH-CHECKLIST.
- **Done when:** all four success metrics (SPEC §2.1) are met and recorded.

## Re-estimate (2026-09-28)
Measured from the request to the pushed commit, so reviews, second-opinion rounds and their fixes are included.

| Part | Original | Actual |
| --- | --- | --- |
| #1 Machine setup | 2–4 h | ~14 min (6 of them your setup script) |
| #2 Scaffold | 3–5 h | ~17 min |
| #3 Env schema + bundle scan | 3–5 h | ~16 min |
| #4 Supabase config + migrations | 5–8 h | ~19 min (half of the T2 fix, decision 0008) |
| #5 RLS tests + registry | 5–8 h | ~20 min (the other half) |
| **Total** | **18–30 h** | **~86 min (~6%)** |

The ratio isn't applied to everything: steps only you can do (accounts, keys, DNS, trying flows by hand, the screen-reader pass, the fresh-Fedora and timed sign-off runs) don't shrink, and later phases have more UI and end-to-end work. So each part is split into Claude's build time (~5–8% of the original, 10 min minimum) and your hands-on time:

| Part | Original | Claude | You | Board estimate |
| --- | --- | --- | --- | --- |
| #6 CI | 4–7 h | 20–35 min | watch the first run | 0.8 h |
| #7 Week-1 checks left in phase 1 | – | 10–20 min | – | 0.3 h |
| #8 Proxy + CSP | 5–9 h | 25–40 min (Grace, overnight) | morning review | 0.7 h |
| #9 Config, layout, dark mode | 4–6 h | 20–30 min | ~15 min design look | 0.8 h |
| #10 Public pages, SEO, icons | 5–8 h | 25–35 min | ~15 min look | 0.8 h |
| #11 Rate limiter + Turnstile | 4–7 h | 20–35 min | – | 0.6 h |
| #12 Errors + Sentry | 5–8 h | 25–35 min (Grace, overnight) | ~10 min Sentry account | 0.8 h |
| #13 Sign-up flow | 5–8 h | 25–40 min | ~10 min try it | 0.8 h |
| #14 Sign-in, magic link, Google | 5–8 h | 25–40 min | ~30 min Google OAuth client | 1.2 h |
| #15 Password reset | 3–5 h | 15–25 min | – | 0.4 h |
| #16 Guards + re-auth | 3–5 h | 15–25 min | – | 0.4 h |
| #17 Email templates + welcome | 6–9 h | 30–45 min | ~40 min Resend + DNS | 1.4 h |
| #18 Settings | 3–5 h | 15–25 min | – | 0.4 h |
| #19 MFA | 7–11 h | 35–50 min | ~10 min with your phone | 1.0 h |
| #20 Data export | 3–5 h | 15–25 min | – | 0.4 h |
| #21 Delete account | 2–4 h | 10–20 min | – | 0.3 h |
| #22 Playwright e2e | 8–12 h | 40–60 min | – | 1.0 h |
| #23 Backups + restore | 4–7 h | 20–35 min | ~45 min hosted project, age key, test restore | 1.3 h |
| #24 README + docs | 4–6 h | 20–30 min | ~1.5 h fresh-Fedora run | 2.0 h |
| #25 Sign-off | 5–8 h | 25–40 min | ~2.5 h throwaway app, deploy, Orca, timed run | 3.2 h |
| **Left for v1** | **85–138 h** | **~7–12 h** | **~5–8 h** | |

Phase dates assume ~2.9 hrs/day from Sep 29, upper estimates plus 15%, with 2–3 days' slack for usage limits. Re-check after each phase: this is based on five parts from the most tightly specified phase.

## Totals
- **v1:** re-estimated at ~12–20 hrs left (originally 103–168 hrs). Target Fri Oct 9; likely about Oct 6.
- **After v1 (planned):** FR-13 change email (originally 4–7 hrs; re-estimated ~30 min), if time allows. MFA recovery codes and extra providers are out of v1 (SPEC §2.4).

## Cut list (for you to decide on; nothing applied)
You chose to finish all of v1 (decisions/0003), so moving the date is the default when the plan is late. These are the candidates if you ever prefer to cut, least harmful first:

1. **Backups workflow and restore test** (FR-33–35, 4–7 hrs): needed before an app has real users, not before coding starts, so it could be finished alongside the first app.
2. **Installable web app** (FR-25, manifest and icons; 2–3 hrs)
3. **SEO extras**: OG image and sitemap (part of FR-24; 1–3 hrs)
4. **Welcome email** (FR-30; 2–3 hrs)
5. **Google sign-in** (FR-5; 4–6 hrs, plus the manual NFR-26 test)
6. **MFA** (FR-57–59; 7–11 hrs). Last on the list, because it's one of the Template's security features.

Never on the list (security core): RLS and its tests, the auth checks, CSP/headers, rate limits, Turnstile, export/delete (CLAUDE.md rule 19), Sentry scrubbing.

## Weekly check
Every **Sunday evening**, log the real hours per part and compare them with this table.
- **Flag point:** a phase is more than a week past its "finish by" date, or the hours already spent on the current phase exceed its upper estimate. Claude then says so plainly at the start of the next session: "We're past the flag point: X hrs left in this phase, Y hrs a week available. Move the date or cut from the list?" **You decide**; nothing is cut or moved without you.
- First real signal: **Sun Oct 4** (Phases 2–4 due). If a phase takes more than twice its re-estimate, re-estimate the rest from the new actuals.

## Decide at v1 sign-off
Look at: phases done, the four success metrics (met / not met), and hours spent vs the estimate.
- **All metrics met:** v1 is done. Set the gift registry's start and its launch date (SPEC §1 open question), and create it from the Template.
- **Security core done, some cut-list items left:** your call whether to start the gift registry and finish them in parallel. Fixes flow back from the app.
- **Security core not done:** keep going; no app starts on a Template with gaps in auth or RLS.
