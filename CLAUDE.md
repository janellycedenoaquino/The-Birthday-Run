# CLAUDE.md

Instructions for Claude Code sessions in this repo.

## What this project is

**The Birthday Run** (thebirthdayrun.com): a web app that lists the free birthday rewards from the loyalty programs you belong to, counts down how long each lasts, and plans the run to pick them up. Built for the owner and their sisters first, open to anyone. v1 is free for everyone; v2 premium (granted by the owner's script, or paid through Stripe, which stays switched off) adds the map, Smart Grouping, more plan room and reminder emails. No deadline: complete and secure over fast (SPEC §1).

Created from the Template; its rules below all apply. App-specific rules:
- **Security first.** When security and convenience conflict, choose security and explain the trade-off to the owner.
- **$0 to run.** No Google Maps APIs or keys, no paid map/geocoding/routing services (NFR-4). Directions are Google Maps *links* only.
- **Payments stay off** (`PAYMENTS_ENABLED`) until the owner decides; Stripe is test mode only (FR-38).
- **Premium is enforced on the server**; free users get no premium data or actions (NFR-2, metric 2).
- **All date logic goes through `src/lib/birthday/timing.ts`** (NFR-5).
- **Retailer data changes only through `data/retailers.csv` PRs** (D2); nothing user-written ever goes to GitHub (D16).
- **No `Co-authored-by` trailer on commits in this repo** (Vercel Hobby blocks co-authored commits).
- The legacy app (`~/Projects/The-Birthday-Run-Legacy`, archived) is reference only; never build from it or edit it.

## Environment
- **Fedora 44 Linux.** Use Linux commands and tools (`dnf`, `flatpak`, `systemd`). Never give Windows, PowerShell or Homebrew instructions.
- The local Supabase stack runs in containers (Docker or Podman, whichever is set up on this machine).
- **Free tiers only.** Say so before adding anything that costs money or needs a paid plan.
- The user has a CS degree. Explain decisions briefly, without over-explaining basics.

## Stack
- **Next.js** (App Router, TypeScript strict mode)
- **Supabase**: Postgres, Auth, row-level security, migrations in `supabase/migrations`, generated TypeScript types
- **Tailwind CSS + shadcn/ui**
- **Resend + React Email** (also used as Supabase's SMTP)
- **Zod** for all input validation
- **Cloudflare Turnstile** for bot protection
- **Sentry** for error monitoring (free Developer plan)
- **Vercel Web Analytics** (free), no other analytics
- **Vercel** for hosting
- **Vitest** (unit), **Playwright** (end-to-end), **GitHub Actions** (CI)

Check current stable versions and docs before using an API. Don't rely on memory for library APIs; they change. Target versions are in `docs/template/DESIGN.md` D1 (e.g. Next.js 16, where `middleware.ts` is now **`src/proxy.ts`**). **Next.js 16.3+ writes its own version-matched `AGENTS.md`/`CLAUDE.md` rules and bundles its docs in `node_modules/next/dist/docs/`** (from `next dev`): read those for Next.js APIs before anything from memory. Here the block lives in `AGENTS.md` (imported below; `next dev` keeps it current, so don't edit it by hand). Use 16.3 or newer; if D1 pins an older 16.x, raise it with a note in `docs/template/decisions/`.

@AGENTS.md

## Project structure
The full tree is in `docs/template/BUILD.md` §0.1 (decision D20). The parts you'll touch most:
- `src/config/app.ts`: the one config file (name, colours, support email). Logos in `public/brand/`.
- `src/app/`: pages and route handlers. `(public)` and root pages are open; `(app)/` is signed-in (its layout calls `requireUser()`, and every page calls its own guard too); `(auth)/` and `auth/` are the sign-in flows; `account/export`, `auth/confirm`, `auth/callback`, `monitoring` are route handlers.
- `src/server/**`: server-only (every file starts with `import "server-only"`, enforced by ESLint). `auth/guards.ts` (`requireUser`, `requireRecentSignIn`), `run-action.ts`, `actions/{auth,account,mfa}.ts`, `supabase/{server,admin}.ts`, `security/{csp,rate-limit,turnstile}.ts`, `email/`, `data/{registry,export}.ts`, `errors.ts`, `env.ts`.
- `src/lib/**`: isomorphic, no secrets: `env/`, `validation/` (Zod, §0.5), `messages.ts` (every user-facing text, from SPEC §3.4), `security/safe-redirect.ts`, `observability/`.
- `src/components/`: `ui/` (shadcn, generated), `layout/`, `auth/`, `settings/`. `src/emails/`: React Email templates, built into `supabase/templates/`.
- `tests/unit` (Vitest, placeholder env in `vitest.config.mts`), `tests/rls` (local Supabase), `tests/e2e` (Playwright; `support.ts` is the mailbox adapter).
- `supabase/migrations` (forward-only), `supabase/config.toml`, `scripts/` (env, bundle, email and backup scripts).

## Commands
Node 24 (`.nvmrc`). Install with `npm ci`; the full list is BUILD §0.1 "npm scripts".
- `npm run dev` (http://localhost:3000) · `npm run build` · `npm start`
- `npm run lint` · `npm run typecheck` (generates Next's route types, then `tsc --noEmit`) · `npm run format` / `format:check`
- `npm test` (Vitest `unit`) · `npm run test:rls` (Vitest `rls`, needs local Supabase) · `npm run test:e2e` (Playwright, after `build`; needs local Supabase; `E2E_TARGET=deployed` runs the journey against the deployed site)
- `npm run email:build` (after editing `src/emails/` or the config: rebuilds `supabase/templates/`; commit them; restart local Supabase to send the new ones) · `scripts/backup.sh` (encrypted backup, F-12)
- Local Supabase: `npm run db:start` / `db:stop` / `db:reset` (Podman: `DOCKER_HOST` set, DESIGN D23) · types after a migration: `npm run db:types`
- `npm run check:env` (`.env.example` placeholders only) · `npm run check:bundle` (after `build`: no secrets in browser files) · `npm run check:supabase-env` (before `supabase config push`)

Before committing, run lint, typecheck, format:check, test and build.

## Security rules

These apply to every change, in the template and in every app made from it.

### Data access
1. **Every table has row-level security enabled, with deny-by-default policies.** The migration that creates a table also enables RLS and adds its policies, in the same change.
2. **Every table with user data gets an RLS test** showing that user A can't read, change or delete user B's rows, and that signed-out users can't read them either.
3. **Check who the user is on the server, in every server action, route handler and protected page.** Use Supabase's verified check (`auth.getUser()` or `auth.getClaims()`), never `getSession()` alone, which isn't verified on the server. The proxy (`src/proxy.ts`, formerly middleware) helps with redirects and session refresh but is **not** the security check. In this repo the check is `requireUser()` / `requireRecentSignIn()` in `src/server/auth/guards.ts`.
4. **Server actions and route handlers are public endpoints.** Anyone can call them directly, so each one checks auth and validates input itself.

### Secrets
5. **The Supabase service-role key and every other secret are server-only.** Keep them in modules marked `import "server-only"`. Only values that are safe for anyone to see get the `NEXT_PUBLIC_` prefix.
6. Use the service-role client only when there's no other way (e.g. deleting an auth user), and never with user-controlled IDs without checking ownership first.
7. `.env.local` and all `.env*` files except `.env.example` stay out of git. **Every new environment variable is added to `.env.example`** with a comment on what it is and whether it's public.
8. **`.env.example` never contains real values. Not keys, not URLs of real projects, not emails, not IDs.** Only the variable name and a placeholder: empty (`RESEND_API_KEY=`), `<your-...>` (`NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>`), or a local default (`http://localhost:3000`, `http://127.0.0.1:54321`). This has gone wrong before: real values were copied from `.env.local` into `.env.example`. So **never create or update `.env.example` by copying `.env.local`**. Write each line by hand from the variable name. `scripts/check-env-example.sh` enforces this in the pre-commit hook and in CI, and must stay passing. If a real value is ever committed, tell the user right away: the key has to be rotated (replaced) in its service, because removing it from git doesn't un-leak it.

### Input and output
9. **Validate every input on the server with Zod:** forms, route params, search params, webhooks. Client-side validation is only for user experience.
10. **Never render user content as HTML** (`dangerouslySetInnerHTML`) unless it's sanitized first.
11. **Check redirect targets** (`next`, `redirectTo`, `returnUrl`) and allow only same-site paths, to prevent open redirects.
12. **Don't show raw errors to users.** No stack traces, SQL errors or internal IDs. Log the details on the server and show a plain message.

### Abuse protection
13. **Rate limit** sign-in, sign-up, password reset, magic links and any public form.
14. **Turnstile** on every auth form (sign-up, sign-in, magic link, password reset) and every public form. Auth forms are checked by Supabase's built-in CAPTCHA; other public forms use `verifyTurnstile()` on the server.
15. Sign-in errors never reveal whether an email has an account ("If that email exists, we sent a link").

### Headers, cookies and browser
16. Keep the **security headers** (CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy) in place. Don't loosen the CSP without a stated reason; prefer nonces over `unsafe-inline`.
17. **Session cookies are `HttpOnly`, `Secure` and `SameSite=Lax`, set explicitly** in the server Supabase client. `@supabase/ssr`'s defaults are *not* HttpOnly, so never rely on them. There's no browser Supabase client; adding one is a security decision (`docs/decisions/`). Don't store tokens in `localStorage`.

### Files (if an app adds uploads)
18. Use Supabase Storage with RLS policies on the bucket, and check file type and size limits on the server.

### Personal data
19. **Collect only what's needed.** Any new table holding user data must be covered by **"download my data"** and **"delete my account"**. Update both, and their tests, in the same change.

### Monitoring, backups and rollback
20. **Errors are reported to Sentry, scrubbed of personal data and secrets** (no emails, tokens, request bodies or cookies in events).
21. **Backups are the app's job on the free plan.** Supabase Free has no automatic backups, so keep the backup script working and the restore steps tested. Any new storage (buckets, other databases) gets added to the backup.
22. **Migrations only move forward.** Never edit a migration that has run anywhere; fix things with a new migration. Rolling back app code (Vercel) must never need a database rollback.

### Dependencies
23. **Add packages sparingly.** Prefer well-maintained ones, and say why a new one is needed. Keep `npm audit`, Dependabot and gitleaks passing.

## Adding a feature (checklist)
Every change that adds a table, a form or an endpoint includes:
- [ ] A migration with RLS enabled and policies, including the restrictive MFA policy (`private.mfa_satisfied()`) on user-data tables
- [ ] User-data tables live in `public`, have an `ON DELETE CASCADE` path to `auth.users`, and are added to `USER_DATA_TABLES` in `src/server/data/registry.ts` (other tables go in `NON_USER_DATA_TABLES`)
- [ ] RLS tests (other user, signed out)
- [ ] A Zod schema, used on the server
- [ ] A server-side auth check
- [ ] A rate limit, if it's public or sends email
- [ ] Coverage in data export and account deletion, if it stores user data
- [ ] New env vars in `.env.example`, **placeholders only** (`scripts/check-env-example.sh` passes)
- [ ] Unit tests, plus an e2e test for any new user flow
- [ ] Lint, typecheck, tests and build passing locally before committing

## Planning docs (read before building a phase)
- **`docs/OVERVIEW.md`: read first, every session.** Then read only the sections that `ROADMAP.md` lists for the current phase, not whole documents.
- `docs/SPEC.md` (goals, requirements FR-/NFR-, screens S-1xx, **all user-facing text** M-1xx) · `docs/DESIGN.md` (decisions D1–D17, architecture, data model, security T-1xx, operations) · `docs/BUILD.md` (conventions + F-1–F-14, CI) · `ROADMAP.md` · `docs/LAUNCH-CHECKLIST.md` · `docs/decisions/`
- The Template's own planning (foundations: auth, guards, emails, backups) is in `docs/template/`; app docs cite it as "Template D21", "Template F-11". `docs/LAUNCH_CHECKLIST.md` is the Template's generic list; this app's is `docs/LAUNCH-CHECKLIST.md`.
- **Every fact lives in one place.** When something changes, edit its home only; everything else refers to it by ID (FR-, NFR-, D-, S-, M-, T-, F-) or section. Never copy or paraphrase a fact into another place, including another section of the same file. After changing docs, rebuild the affected lines of `docs/OVERVIEW.md`.
- Approved decisions (DESIGN §1, the data model in DESIGN §3, SPEC §1) aren't reopened without asking. `docs/archive/` holds the Template's old docs for reference only; never build from it.

## How to work
- **Build one roadmap phase at a time** and say which FR/NFR IDs a change covers. If the code has to differ from the design docs, update the doc in the same change and say why.
- **Deadline check:** at the start of a session after the weekly check, if `ROADMAP.md`'s flag point is passed, say so plainly ("X hrs left in this phase, Y hrs a week available: move the date or cut from the list?"). The user decides; never cut scope or move the date on your own.
- **Show a short plan before big changes** and wait for the user's OK.
- **Work in small steps.** Commit after each working step with a clear message.
- **Branches and pull requests:** work on a branch (`feature/<short-name>` or `phase-N-<name>`), never commit directly to `main` once the first version exists. (GitHub Free can't enforce branch protection on a private repo, so this is a convention backed by CI and the local hooks.) Merge through a pull request after CI passes. Reference the GitHub issue the work belongs to (`Closes #12`).
- **Pull request flow (the user reviews on GitHub, not in local files):** once a step works, Claude runs `pre-commit-review` and commits, runs `pre-push-review` and pushes the branch, then opens a PR with `gh pr create` without asking first. Pushing a reviewed feature branch and opening a PR need no separate OK; pushing to `main` does. The PR description says what changed and why, the FR/NFR IDs and issue it covers, how it was tested, and anything the user should look at closely (migrations, auth, RLS, security settings first). **Claude never merges.** The user reviews the PR on GitHub, asks for changes in PR comments (Claude addresses them on the same branch), and merges it themselves once CI is green. GitHub doesn't let you approve a PR opened from your own account, so merging is the approval.
- **Decision log:** if a change goes against an approved decision (SPEC §1, DESIGN §1 or §3) or makes a choice that would surprise someone later, add a file to `docs/decisions/` in the same change.
- **Ask before** creating or changing GitHub repos, making anything public, deploying, changing Supabase auth settings, or loosening any security setting. The user creates accounts and API keys themselves; tell them exactly what's needed and where.
- **Before any `git commit`, run the `pre-commit-review` skill** (global, from the Claude-Skills repo). It reviews exactly what's staged and records that snapshot as reviewed. The pre-commit hook blocks anything unreviewed, and changing what's staged afterwards means reviewing again. Both reviews use `.claude/security-checklist.md` (add new kinds of risk there) and `.claude/quality-checklist.md` (spec match, code smells, test quality).
- **Before any `git push`, run the `pre-push-review` skill** (global, from the Claude-Skills repo). It reviews the commits being pushed against the security rules above and records them as reviewed. The pre-push hook (`.githooks/pre-push`) blocks unreviewed commits. Never bypass either hook with `--no-verify` unless the user explicitly says to.
- **Don't mark something done until it's tested.** When reporting, say what was tested and how. If something failed or was skipped, say so.
- **Keep `README.md` accurate.** Update it whenever setup steps, env vars or the "start a new app" checklist change.
- Keep a running note of the real hours spent in a session, so the user can log them.

## Apps made from this template
An app made from this template gets a copy of this file. In that app:
- **All the security rules above still apply.** Don't remove them.
- Replace the "What this repo is" section with a description of the app, and add app-specific notes below it.
- If a security fix or a generic improvement comes up while building an app, suggest adding it back to the template repo, so every future app gets it.
