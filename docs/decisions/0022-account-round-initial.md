# 0022. The account button is a round initial, not the full email

Date: 2026-11-25 · Status: accepted (owner, 2026-11-25, after the trade-off was explained), with
a follow-up: a confirm step on sign-in links before launch

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

## Why the owner accepted it
The app holds no addresses or payment details and mails nothing: it shows what a person can pick
up, and they go to the store themselves. What an attacker could learn from someone tricked into
their account is the birthday, the programs and, most of all, the planned stops: where and when
that person will be. That is a real safety risk (someone could wait for them there), so the owner
chose to fix it where it starts rather than rely on the header:

- **Now:** the round initial, as built here.
- **Before launch (own PR):** opening a sign-in or confirm link shows "You're signing in as
  m•••@example.com. Is this you?" before the session is created. That protects every page and
  screen size, whatever the header shows.

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
- The follow-up confirm step is on the launch checklist; T22 is mitigated by it, not by the
  header, once it ships.
