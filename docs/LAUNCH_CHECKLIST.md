# Launch Checklist (generic)

Every app made from this template copies this into its own `docs/08-Launch-Checklist.md` (the `/project-manager` skill does it) and tailors it: remove what doesn't apply, add the app's own items.

## Product
- [ ] Every must-have FR works end to end on the production URL
- [ ] The e2e journey passes against the production URL (`E2E_TARGET=deployed`, README step 9)
- [ ] Google sign-in tried by hand: new account, existing account, cancel
- [ ] Tested on a real phone (iPhone and Android if possible) and one desktop browser
- [ ] Empty, error and loading states look right (UX spec)
- [ ] <app-specific items>

## Security and privacy
- [ ] `/pre-push-review` passed on the release; CI green
- [ ] RLS tests pass against the production database settings
- [ ] Threat model items marked "before launch" are done (System Design)
- [ ] Privacy policy and terms filled in (not placeholder text), linked in the footer
- [ ] Privacy policy lists the service providers (Supabase, Vercel incl. Web Analytics, Resend, Cloudflare Turnstile, Sentry, Google sign-in) and says deleted data can stay in backups up to 30 days
- [ ] Decided what happens to Supabase's auth audit log after an account is deleted (it keeps the email and possibly the IP; the Template's decisions/0017), and the privacy policy says so
- [ ] Lost-authenticator rule written in the support notes: remove an MFA factor only when the request comes from, or is confirmed by, the account's own email address
- [ ] `GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY` are not set on Vercel; previews are behind Vercel Authentication; `dependabot/*` preview builds are skipped
- [ ] <app-specific: disclaimers, age limits, consent>

## Operations
- [ ] Error monitoring receives a test error and alerts reach the user's email
- [ ] Daily encrypted backup workflow switched on (`BACKUP_AGE_RECIPIENT`, `SUPABASE_DB_URL` set); first backup restored into a fresh project and the date recorded (free Supabase has no automatic backups)
- [ ] Rollback tried once on a preview deploy
- [ ] Env vars set in production; no test keys (no Turnstile dummy keys, `EMAIL_TRANSPORT=resend`)
- [ ] `supabase config push` run with the `[remotes.production]` block filled in; SMTP still set afterwards (pushing without it clears production SMTP)
- [ ] Supabase Free pauses a project after 1 week without activity: check the project isn't paused, and decide whether the app needs a paid plan
- [ ] Vercel Hobby is non-commercial: move to Pro before the app makes money

## Domain, email, SEO
- [ ] Custom domain connected with HTTPS
- [ ] Sending domain verified in Resend and `EMAIL_FROM` uses it (not `onboarding@resend.dev`); sign-up and reset emails arrive (check spam folders)
- [ ] Turnstile widget and Google OAuth client list the production domain; Supabase redirect URLs include it
- [ ] Page title, description and share image look right when the link is pasted into a chat

## Support and feedback
- [ ] Support email set in the config and working
- [ ] A way for users to report problems or give feedback
- [ ] Success metrics can be counted (PRD "how we measure it")

## After launch (first week)
- [ ] Check errors daily
- [ ] Count the success metrics on the date in the PRD
