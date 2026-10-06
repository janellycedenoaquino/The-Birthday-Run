# Web App Starter Template

A reusable starting point for new web apps. It has everything every app needs (accounts, security, emails, legal pages, tests, deployment) and nothing specific to any one app. Each new idea starts from this repo on GitHub ("Use this template") instead of rebuilding sign-in and security from scratch.

> **Status: v1 signed off 2026-09-30** ([decisions/0016](docs/template/decisions/0016-v1-sign-off.md)). Start with [OVERVIEW](docs/template/OVERVIEW.md).

## What's included

### Accounts and sign-in
- Sign up, sign in and sign out with **email + password**, **email magic link** and **Google**
- **Email-first sign-up:** the email is verified before a password is chosen, so nobody can pre-register someone else's email
- Forgot password, reset password, and a fresh sign-in required for sensitive changes
- Optional **two-step sign-in** (authenticator app, Supabase's free TOTP MFA)
- Protected pages (signed-in only) and automatic session refresh
- A `profiles` row created automatically for every new user
- Account settings: change name and password; turn two-step sign-in on/off; **download my data**; **delete my account** (changing email comes later; until then users contact support)

### Security
- **Row-level security on every table by default**, with a test proving one user can't read or change another user's data
- Secret keys stay on the server; the build fails if the service-role key could reach the browser
- Security headers: Content-Security-Policy, HSTS, frame protection, Referrer-Policy, Permissions-Policy
- Rate limits on sign-in, sign-up, magic links, password reset, two-step codes and public forms
- Bot protection on every sign-in/sign-up form and public forms (Cloudflare Turnstile, checked by Supabase)
- Session cookies set HttpOnly, Secure and SameSite explicitly; no browser Supabase client
- Every form and API input validated on the server with Zod
- Secret scanning (gitleaks), `npm audit` and Dependabot

### App shell
- Landing page, sign-in and sign-up pages, a signed-in dashboard placeholder, settings
- Mobile-first layout, dark mode, loading states, toast messages, accessible forms
- 404 and error pages
- Privacy policy and terms pages (placeholder text, filled in per app); support email link in the footer
- SEO basics: metadata, Open Graph image, sitemap, robots.txt
- Home-screen install on phones (web app manifest + icons)

### Emails
- Welcome, verify email, magic link and password reset templates, using the app's name, logo and colors
- Sent through Resend, including Supabase's sign-in emails (so they aren't stuck on Supabase's built-in email limit)

### Quality
- Strict TypeScript, ESLint, Prettier
- Unit tests (Vitest) and end-to-end tests (Playwright) for sign up → verify → sign in → reset password → delete account
- GitHub Actions on every push: lint, typecheck, tests, build, secret scan

### Operations
- **Error monitoring** with Sentry (free Developer plan: 5,000 errors/month, 1 user, 30-day history ([pricing](https://sentry.io/pricing/))). Alerts go to email; no personal data or secrets in error reports.
- **Backups:** Supabase's free plan has **no automatic backups** ([Supabase docs](https://supabase.com/docs/guides/platform/backups)), so the template includes a backup script (`supabase db dump`, including accounts) that runs daily in each app's GitHub Actions, **encrypted with age** to a key only you hold, kept **30 days**, plus a tested restore.
- **Rollback:** how to roll back a bad deploy on Vercel, and the rule that database migrations only move forward (a fix is a new migration).
- A generic **launch checklist** (`docs/LAUNCH_CHECKLIST.md`) that every app tailors before real users arrive.

### Workflow
- **Branches and pull requests:** work happens on branches; `main` changes only through pull requests with CI passing. GitHub Free can't enforce branch protection on a private repo, so this is a convention backed by CI and the local hooks.
- **Issues:** each roadmap part is a GitHub Issue; commits and pull requests reference it (`Closes #12`).
- **Decision log:** decisions made after planning go in `docs/decisions/`, one short file each.

## Not included (added per app only if needed)
Payments, teams/organizations, multiple languages, an admin panel, analytics beyond Vercel's free built-in.

## Stack

| Part | Tool | Cost |
| --- | --- | --- |
| Framework | Next.js (App Router, TypeScript) | Free |
| Database + sign-in | Supabase (Postgres, Auth, row-level security) | Free tier |
| UI | Tailwind CSS + shadcn/ui | Free |
| Email | Resend + React Email | Free tier (3,000/month, 100/day) |
| Hosting | Vercel | Free Hobby tier (non-commercial only; Pro needed once an app makes money) |
| Bot protection | Cloudflare Turnstile | Free |
| Validation | Zod | Free |
| Error monitoring | Sentry | Free Developer plan (5,000 errors/month, 1 user) |
| Analytics | Vercel Web Analytics | Free on Hobby |
| Tests and CI | Vitest, Playwright, GitHub Actions | Free (2,000 Actions minutes/month on private repos) |

## One file to rename everything
All app-specific settings live in **one config file**, `src/config/app.ts`: app name, description, brand colors, support email and logo. The site URL comes from the `NEXT_PUBLIC_SITE_URL` env var, so previews and production each get the right one. A new app changes that file, its logo files and its environment variables, and nothing else, to be up and running. The auth emails are built from it too: after editing it, run `npm run email:build` (it rewrites `supabase/templates/`; commit the result, CI checks they match) and `supabase config push`. Locally, restart the stack (`npm run db:stop && npm run db:start`) to send the new versions.

## Local setup on Fedora
Tested on Fedora 44.

**1. System packages** (Node 24 LTS, gitleaks for the pre-commit secret scan, age for backups):
```bash
sudo dnf install nodejs24 nodejs24-bin nodejs24-npm-bin gitleaks age
node --version   # must print v24.x
```
If it prints another version, a different Node is earlier on your `PATH` (`command -v node` shows which); remove or reorder it.

**2. Podman for the local database** (Fedora's default container runtime; Docker also works, DESIGN D23):
```bash
systemctl --user enable --now podman.socket
echo 'export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock' >> ~/.zshrc   # or ~/.bashrc
```
Open a new terminal afterwards. Tested with rootless Podman 5.8.7 (decision 0005). If `supabase start` fails its health checks, add `--ignore-health-check`; if it still fails, use Docker.

**3. The repo:**
```bash
git clone <this repo> && cd <repo>
git config core.hooksPath .githooks   # turn on the commit and push checks
npm ci                                # also installs the Supabase CLI (npx supabase --version)
```

**4. Local database:** `npm run db:start` (the first run downloads the images, about a minute), then `npx supabase status -o env` shows the local URLs and the two `sb_` keys. `npm run db:stop` stops it; `npm run db:reset` re-applies every migration to an empty database; `npm run db:types` regenerates `src/lib/types/database.types.ts` after a migration.

**5. Env vars:** `cp .env.example .env.local`, then fill it in (see "Environment variables" below). Locally:
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: from `npx supabase status -o env`
- `RATE_LIMIT_HMAC_SECRET`: `openssl rand -hex 32`
- Turnstile test keys: site `1x00000000000000000000AA`, secret `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`
- `EMAIL_TRANSPORT=mailpit`, and any `EMAIL_FROM` address
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `RESEND_API_KEY`: any non-empty placeholder (Google sign-in and Resend aren't used locally)

The Supabase CLI reads `.env.local` too, and passes an unset `env(...)` value through as literal text without a warning, so set all four `supabase config` values (decision 0007); `npm run check:supabase-env` confirms it. Restart local Supabase after changing them. The build, dev server and typecheck refuse to run with missing or invalid values and name the variables.

**6. Run it:** `npm run dev` (http://localhost:3000). Checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:rls` (database security tests; needs local Supabase running and internet, since Supabase checks the Turnstile test token with Cloudflare). All commands: CLAUDE.md "Commands".

## Environment variables
Names and rules: BUILD §0.6 and F-2. Real values go only in `.env.local` (and in Vercel or GitHub settings), **never** in `.env.example`.

| Variable | Kind | What it's for | Where to get it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL, no trailing slash; required in production | Your domain; locally `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase API URL | Supabase dashboard → Project Settings → API; locally `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable key (`sb_publishable_…`) | Supabase → Project Settings → API Keys; locally printed by `npm run db:start` |
| `SUPABASE_SECRET_KEY` | **secret** | Supabase secret key (`sb_secret_…`); bypasses RLS, server only | Same places as the publishable key |
| `RATE_LIMIT_HMAC_SECRET` | **secret** | Hashes rate-limit keys and signs password-reset markers; 32+ characters. Rotating it resets all counters and voids reset links opened in the last 15 minutes | `openssl rand -hex 32` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Turnstile widget | Cloudflare → Turnstile → your widget |
| `TURNSTILE_SECRET_KEY` | **secret** | Supabase's CAPTCHA check; read by `supabase config push`, not set on Vercel | Same Turnstile widget |
| `EMAIL_TRANSPORT` | server | `resend`, or `mailpit` locally (refused in production) | Your choice |
| `RESEND_API_KEY` | **secret** | Welcome email; also Supabase's SMTP password. Required with `resend` | Resend → API Keys |
| `EMAIL_FROM` | server | Sender: `address` or `Name <address>` | An address on your verified Resend domain |
| `MAILPIT_URL` | server | Local test inbox; required with `mailpit` | Locally `http://127.0.0.1:54324` |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Sentry; empty turns it off; required in production | Sentry → Project Settings → Client Keys |
| `SENTRY_AUTH_TOKEN` | **secret** | Source-map upload (Vercel builds only; optional) | Sentry → Settings → Auth Tokens |
| `SENTRY_ORG`, `SENTRY_PROJECT` | server | Org and project slugs (optional) | Sentry URLs |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **secret** | Google sign-in; read by `supabase config push`, not set on Vercel | Google Cloud → APIs & Services → Credentials |
| `SUPABASE_DB_URL` | **secret**, scripts only | Session-pooler DB URL for backups (a GitHub secret in the app repo) | Supabase → Connect → Session pooler |
| `BACKUP_AGE_RECIPIENT` | scripts only | `age` public key for backups (a GitHub variable) | `age-keygen` (keep the private key offline) |
| `E2E_TARGET` | tests only | Empty = local; `deployed` for the deployed e2e run | Your choice |
| `E2E_EMAIL` | tests only | Resend account owner's address, for the deployed run | Your Resend login email |

Set by Vercel, not by you: `VERCEL_ENV`, `VERCEL_BRANCH_URL`, `VERCEL_GIT_COMMIT_REF`.

**Turnstile test keys** (Cloudflare's public dummies, for local and CI only): site key `1x00000000000000000000AA` always passes, `2x00000000000000000000AB` always blocks; secret `1x0000000000000000000000000000000AA` always passes, `2x0000000000000000000000000000000AA` always fails.

`npm run check:supabase-env` checks the four values `supabase config push` needs before you push config; `npm run check:bundle` (after a build) fails if any secret reached files sent to the browser.

## Start a new app from this template
About an hour the first time (success metric 1). Steps marked **you** need your accounts; everything else is commands.
1. On GitHub, **Use this template** → create the new repo. Name it in lowercase with hyphens (`gift-registry`): the Vercel project gets the same name, so the site will be `https://<repo-name>.vercel.app`, which step 6 needs before step 8 creates it (if Vercel adds a suffix because the name is taken, correct the site URL in step 6 and push the config again). Then `git clone git@github.com:<you>/<repo-name>.git && cd <repo-name>`, `git config core.hooksPath .githooks` and `npm ci`. On a computer that doesn't have them yet, set up the global Claude Code skills first (the private `Claude-Skills` repo): the hooks block every commit and push that `/pre-commit-review` and `/pre-push-review` haven't reviewed, so commit through Claude Code (step 4 onwards).
2. **You:** create a Supabase project (Free). Then `npx supabase login` (once per computer), `npx supabase link --project-ref <ref>` and `npx supabase db push` (the migrations).
3. Copy `.env.example` to `.env.local` and fill it in for **local development**, exactly as in "Local setup on Fedora" step 5: the local Supabase URL and keys, not the new project's. Leave the lines that step doesn't mention empty (`SENTRY_*`, `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT`, `E2E_*`). Production values go to Vercel in step 8, never here.
4. Edit `src/config/app.ts` (name, short name, description, colours, support email, legal entity) and replace `public/brand/logo.svg` and `logo.png`. Then `npm run email:build` and commit the rebuilt `supabase/templates/`. The tests read the config, so they keep passing after the rename.
5. **You:** create the service accounts and keys: Resend (a verified sending domain, or `App <onboarding@resend.dev>` for a first test), a Cloudflare Turnstile widget (list `localhost`, your `*.vercel.app` host and your domain), a Google OAuth client (redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`), Sentry (free Developer plan).
6. Fill in the `[remotes.production]` block in `supabase/config.toml` (site URL `https://<repo-name>.vercel.app` from step 1, redirect URLs incl. `https://*-<vercel-scope>.vercel.app/**`, Resend SMTP, sender). `config push` reads four secrets from `.env.local` (decision 0007): for the push only, set the **real** `TURNSTILE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `RESEND_API_KEY` there, run `npm run check:supabase-env` and `npx supabase config push`, then put the local test values back. **Review the diff it shows**: pushing without the block clears production SMTP.
7. Replace the privacy policy and terms placeholders (`src/app/(public)/`).
8. **You:** import the repo in Vercel (Hobby) under the repo's name, put previews behind Vercel Authentication, and add these Production variables with **production values** before deploying: `NEXT_PUBLIC_SITE_URL` (`https://<repo-name>.vercel.app`), `NEXT_PUBLIC_SUPABASE_URL` (`https://<project-ref>.supabase.co`), the project's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, a new `RATE_LIMIT_HMAC_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM` and `NEXT_PUBLIC_SENTRY_DSN` (optionally `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`). Tick **Sensitive** on the secret ones. Not `GOOGLE_CLIENT_SECRET` or `TURNSTILE_SECRET_KEY` (Supabase holds those). **No value may contain `127.0.0.1` or `localhost`**: copied from `.env.local`, they make the live site call a database on your computer, and sign-up fails with "Something went wrong" (decision 0016). Deploy, then sign up and sign in on the live site.
9. Run the journey against the deployed app, **before real users arrive** (the test keys turn bot protection off). Turnstile refuses automated browsers, so first switch to Cloudflare's always-pass test keys: site key `1x00000000000000000000AA` in Vercel (then redeploy) and secret `1x0000000000000000000000000000000AA` in Supabase → Authentication → Attack Protection. Run `E2E_TARGET=deployed E2E_EMAIL=<your Resend account email> NEXT_PUBLIC_SITE_URL=https://<your app> npm run test:e2e`, and when asked, paste each email link (right-click → Copy link; clicking it uses it up) into `playwright/.manual-link`. Then put the real keys back in both places and redeploy; check the sign-up widget no longer says "Testing only" (`docs/LAUNCH_CHECKLIST.md`: no test keys).
10. Backups: `age-keygen -o backup-key.txt` (keep that file **offline**; its public `age1…` line goes in the repo variable `BACKUP_AGE_RECIPIENT`), add the secret `SUPABASE_DB_URL` (the session pooler URL), uncomment the `schedule` in `.github/workflows/backup.yml`, check GitHub emails you on failed workflows, then run it once and do the restore under Operations.
11. Work through [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) before real users arrive.

## Keeping secrets out of git
**`.env.example` holds placeholders only, never real values.** Real keys go in `.env.local`, which git ignores. `scripts/check-env-example.sh` fails if `.env.example` contains a real-looking key, email or URL, or any value copied from `.env.local`. It runs before every commit and in CI. After cloning, switch on the pre-commit hook once:

```bash
git config core.hooksPath .githooks
```

If a real key is ever committed, **rotate it** (create a new one in that service and delete the old one). Removing it from git history doesn't undo the leak.

## Security review before every commit and push
Every commit and every push gets checked. A problem is cheapest to fix in the one change that adds it, so most issues get caught at commit time and the push review stays short.

| When | Claude Code skill | Git hook (runs by itself) |
| --- | --- | --- |
| Before `git commit` | **`/pre-commit-review`** reviews exactly what's staged: secrets, missing row-level security, missing auth checks, unvalidated input, wrong files staged, edited migrations, debug leftovers, typecheck, lint and tests | **`.githooks/pre-commit`** blocks env files, real values in `.env.example`, key/certificate files, files over 5 MB, merge conflict markers and secrets (gitleaks, if installed), plus any staged snapshot that hasn't passed the review |
| Before `git push` | **`/pre-push-review`** reviews the commits being pushed. Commits already reviewed at commit time get a lighter pass that looks for problems across commits | **`.githooks/pre-push`** runs the env and secret checks and blocks any commit that hasn't passed the review |

Both reviews use the same list, `.claude/security-checklist.md`. The two skills are global (in the `Claude-Skills` repo); this repo holds only the checklists they review against, so each app can tune its own. Changing what's staged after `/pre-commit-review` means running it again.

Switch the hooks on once per clone with `git config core.hooksPath .githooks`. `--no-verify` skips a hook and is for emergencies only.

## Adding a feature
Every new table gets **row-level security and a test** in the same change, and every new form or API route gets **Zod validation**. User-data tables also go into the user-data registry (`src/server/data/registry.ts`), which drives the export, account deletion and a coverage test that fails if a table is missing. `CLAUDE.md` has the full checklist for Claude Code sessions.

## Operations
**Rollback** (FR-36): in Vercel, Instant Rollback to the previous production deployment (Hobby keeps one), fix forward with a new commit, then promote it. Never roll back the database: fix a bad migration with a new one, and recover lost data from a backup.

**Restore a backup** (FR-35, NFR-18):
1. Create a new Supabase project.
2. Download the backup artifact from the workflow run and decrypt it with the offline key: `age -d -i backup-key.txt backup-<date>.tar.gz.age | tar xz`.
3. Drop the Supabase-managed grants a new project already has (backups made with an older `scripts/backup.sh` include them): `sed -i '/^GRANT .* ON PARAMETER .* TO "supabase_/d' roles.sql`. Then load it: `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "$NEW_DB_URL"`.
4. Compare row counts on both projects (add a line per user-data table):
   ```sql
   select 'auth.users', count(*) from auth.users
   union all select 'auth.identities', count(*) from auth.identities
   union all select 'auth.mfa_factors', count(*) from auth.mfa_factors
   union all select 'public.profiles', count(*) from public.profiles;
   ```
5. Sign in as a test user on the restored project, then record the date below.

**Last tested restore:** partial, 2026-09-29: row counts matched on a fresh project; step 5 (sign-in on the restored project) not done, accepted for v1 (decisions/0016).

**Lost authenticator app** (D24.29): remove the MFA factor in the Supabase dashboard (Auth → Users) only when the request comes from, or is confirmed by, the account's own email address.

## Planning docs
The Template's own planning lives in `docs/template/`. Start with the overview; each roadmap phase lists the few sections it needs.

| Doc | What's in it |
| --- | --- |
| [Overview](docs/template/OVERVIEW.md) | **read first:** the map, with what to read per phase |
| [Spec](docs/template/SPEC.md) | goals and constraints, requirements (FR-/NFR-), screens and every user-facing text |
| [Design](docs/template/DESIGN.md) | decisions D1–D24, architecture, data model, threats, privacy, operations |
| [Build](docs/template/BUILD.md) | conventions, one section per feature (F-1–F-13), CI and deployment |
| [Roadmap](ROADMAP.md) | phases, hours, dates, cut list, what to read |
| [Research](docs/template/RESEARCH.md) | skipped (internal infrastructure) |
| [Sign-off checklist](docs/template/LAUNCH-CHECKLIST.md) | the Template's v1 sign-off |
| [Decisions](docs/template/decisions/) | decisions made after planning |
| [Launch checklist (generic)](docs/LAUNCH_CHECKLIST.md) | what each app checks before real users |

## Apps built from this template
| App | Repo | Started |
| --- | --- | --- |
| Gift registry (cash goals via Venmo/Cash App/Zelle) | *(to be added)* | 2026-10-01 |
