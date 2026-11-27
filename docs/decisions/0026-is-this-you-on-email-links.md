# 0026. Email links ask "Is this you?" before signing in

Date: 2026-11-26 · Status: accepted (owner, 2026-11-26: approved the design and picked the
screen; chose to skip a separate "Continue" step)

## Context
Decision 0022 replaced the always-visible email in the header with a round initial, which
weakened Template T22's mitigation of login CSRF through `/auth/confirm`: a crafted link could
sign a visitor into someone else's account, and the visitor might add their birthday, programs
and planned stops to it. 0022's follow-up was a confirm step on sign-in links before launch
(LAUNCH-CHECKLIST line "Sign-in links ask 'Is this you?' first").

A link carries only a one-time token, so the account's email is known only after the token is
verified, and verifying uses the token up.

## Decision
- `GET /auth/confirm` verifies the link with a Supabase client that never reads or writes the
  browser's cookies. The new session goes into **`auth_pending`**, not the sign-in cookies, and
  the visitor goes to **S-113 "Is this you?"** (`/auth/is-this-you`), which shows the account's
  email masked (first character and domain, M-317).
- `auth_pending`: the session's tokens, the link type, the email and the issue time, signed with
  HMAC-SHA256 (keyed with `RATE_LIMIT_HMAC_SECRET`, domain-separated as `auth_pending:`), valid 15
  minutes (the reset marker's window, D24.6: the link is already used up, and new links are
  limited to 3 an hour). `HttpOnly; Secure; SameSite=Lax; Path=/auth`. Signed so nobody can change
  the email shown or turn a sign-in link into a reset (the reset marker, decisions/0014, follows
  the type). A value too big for a cookie (over 3800 characters) is never set: the session is
  ended, Sentry is told, and the visitor sees S-8.
- **The answer is tied to what the page showed.** The cookie's signature is the held sign-in's
  ID; S-113's form sends it back, and the POST refuses any other. Without this, a second link
  opened in another tab would replace the held sign-in, and "Yes" on the first tab would accept
  an account the visitor never saw (found by the pre-push review).
- S-113's two buttons POST to `/auth/confirm` (`choice=yes|no`, Zod). The cookie is read once and
  deleted on every path, with `auth_next`. **Yes:** `setSession` puts the held session in the
  sign-in cookies, then the welcome email, reset marker and redirect run as before. **No:** the
  held session is signed out on the server (`/logout?scope=local` with its own token), and the
  visitor sees M-321/M-322. Missing, altered, expired or replaced → S-8.
- **Held sessions are ended whenever they're dropped:** on "No", when a new link replaces one,
  when one is answered after its window or with the wrong ID, when `setSession` fails, and on
  sign-out (which also deletes the cookie, for shared computers). Ending one revokes its refresh
  token (`/logout?scope=local` with its own token, no secret key).
- Rate limit: the POST has its own key, `authConfirmAnswer`, 30 / 10 min per IP (BUILD §0.4).
- Another site can't answer for the visitor: a cross-site POST doesn't carry a `SameSite=Lax`
  cookie, so it finds no held session. The POST also refuses any `Sec-Fetch-Site` other than
  `same-origin` before touching cookies, so another site can't clear the held sign-in either.

## Alternatives
- **A "Continue" page before verifying** (GET shows a button, POST verifies): mail scanners and
  previews could no longer use links up. One more tap; the owner chose fewer taps. Links still
  get used up by anything that opens them, as before.
- **Put the email in the link:** an attacker could write the victim's email into their own link,
  so the page would show the wrong account. Rejected.
- **Read the token's owner from `auth.one_time_tokens` with the secret key:** needs the
  service-role client on a public route and depends on GoTrue's internal tables. Rejected.

## Consequences
- Every email link takes one tap more ("Yes, that's me").
- GoTrue creates the session (and confirms a new account's email) at verify time, before the
  answer. "No" ends that session; for a sign-up link the account stays confirmed, which only
  affects the link's own owner.
- A link opened and never answered (tab closed) leaves its session alive on the server until
  GoTrue expires it; nothing runs to end it. Its tokens were only ever in that browser's
  HttpOnly cookie, which expires after 15 minutes.
- Ending a session revokes its refresh token only. Its access token is a JWT that stays valid
  until it expires (about an hour), but it never left the HttpOnly cookie.
- Someone already signed in who taps "No" sees "You're not signed in", though their own session
  is untouched (accepted: rare, and the text is about the link).
- Two answers sent at once (a double tap) both read the cookie before either deletes it; the
  worst case is a session signed in and revoked at the same time, which fails on its next
  refresh.
- The held tokens sit in the visitor's browser for up to 15 minutes, in an HttpOnly cookie scoped
  to `/auth`: no wider exposure than the sign-in cookies.
- Template T22 is mitigated here by S-113 (DESIGN T-118), not by the header (decision 0022).
