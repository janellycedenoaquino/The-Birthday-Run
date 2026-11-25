# 0022. The account button is a round initial, not the full email

Date: 2026-11-25 · Status: proposed (the owner picked the look; the security trade-off below
needs her explicit OK before merge)

## Context
Template D24.9 accepts login CSRF through `/auth/confirm` (T22): someone could get a visitor
signed into the attacker's account with a crafted link, so the visitor types their own data into
it. D24.9 accepted that risk *because* the header always shows the signed-in email (Template
SPEC C-1, BUILD F-3), so the visitor notices whose account they are in before typing anything.
The redesign prototype (decision 0016) shows the account as a round initial on the right, and
the owner chose that look ("account is fine as a round initial").

## Decision
- The trigger is a 40 px round button with the first character of the **email**, never the
  display name: the name is free text the attacker controls, so it could copy the victim's own
  initial or pose as the victim's email.
- Its accessible name is "{initial}, account {email}" (it starts with the visible letter, WCAG
  2.5.3) and its tooltip is the email.
- The open menu shows the full email first and strongest, with any display name under it.
- On narrow screens the menu links scroll sideways, so the account button is always on screen.

## Alternatives
- **Keep the full email in the header:** the strongest version of D24.9, but it doesn't match
  the chosen look and crowds the header on phones.
- **Initial plus email on wide screens only:** half of each; the owner picked the prototype.

## Consequences
- **This is a new risk acceptance, not D24.9's.** T22's mitigation is weaker: the email is no
  longer always in view. On a phone the tooltip never shows, so a sighted phone user sees the
  email only when they open the menu. An attacker whose email starts with the victim's letter
  shows the same circle.
- Template SPEC C-1 and BUILD F-3 still say "always showing the signed-in email"; this decision
  overrides them for this app.
- If login CSRF matters more later, the fix is server-side (a confirm page that names the
  account before signing in), not the header.
