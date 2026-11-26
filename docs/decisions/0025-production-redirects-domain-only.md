# 0025. Production auth uses www.thebirthdayrun.com only; old *.vercel.app links redirect there

Date: 2026-11-26 · Status: accepted (owner, 2026-11-26, with the go-live plan)

## Context
At go-live the domain moves from the "Back soon" project to the app (LAUNCH-CHECKLIST "v1:
Domain, email, SEO"). Supabase's production `site_url` and redirect allow-list still named the
`*.vercel.app` address, and Template DESIGN (Vercel decision) puts a preview wildcard
(`https://*-<scope>.vercel.app/**`) in the allow-list.

Emails sent before the move link to the old address: auth emails build their links from
`{{ .SiteURL }}` (not the allow-list), and reminders carry unsubscribe links built from the
site URL at send time. Session and PKCE cookies are host-only, so a sign-in started on one host
and finished on another fails.

## Decision
- `site_url` is `https://www.thebirthdayrun.com`, and the allow-list is only
  `https://www.thebirthdayrun.com/**`. www is the primary host; Vercel 308-redirects the bare
  domain to it. `NEXT_PUBLIC_SITE_URL` and the `SITE_URL` repo variable are the same value.
- **The preview wildcard is dropped.** This app deploys only `main` (`vercel.json`
  `git.deploymentEnabled`), so no preview needs it, and a wildcard would let any deployment on
  the Vercel team receive auth redirects with tokens.
- **Old links keep working by redirect, not by allow-list.** The proxy 308-redirects GET/HEAD
  page requests on any `*.vercel.app` host to the site URL, keeping path and query (BUILD §0.7).
  So an old `/auth/confirm?token_hash=…` link verifies on www, and sign-ins never start on the
  old host. `/api/*` and posts are served where they land, so the cron, the Stripe webhook and
  one-click unsubscribe from already-sent reminders keep working. The roan address is the
  project's permanent Vercel domain, so it keeps serving.
- **Go-live order** (the wizard follows it): Vercel env (`NEXT_PUBLIC_SITE_URL`) → Turnstile
  hostname → move the domain → redeploy (the site URL is built in) → `supabase config push`
  (it also pushes CAPTCHA and Google) → Google branding and publish. Between the redeploy and
  the push, Supabase falls back to the old `site_url` for OAuth; the redirect above carries the
  callback to www, where its cookie is.

## Consequences
- If previews are ever turned on, add their exact host (behind Vercel Authentication), not a
  wildcard.
- Only `*.vercel.app` hosts are redirected, so setting the site URL to the bare domain can't
  loop; it would break OAuth instead (not in the allow-list), which the go-live sign-in check
  catches.
- `scripts/wizard-phase0.sh` no longer writes the wildcard if it's re-run.
