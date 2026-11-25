# 0022. The account button is a round initial, not the full email

Date: 2026-11-25 · Status: accepted (owner)

## Context
Template D24.9 accepts login CSRF through `/auth/confirm` (T22): someone could get a visitor
signed into the attacker's account with a crafted link. The accepted mitigation was that the
header always shows the signed-in email, so the visitor notices whose account they are in before
typing anything. The redesign prototype (decision 0016) shows the account as a round initial
on the right, and the owner chose that look ("account is fine as a round initial").

## Decision
- The trigger is a 40 px round button with the first letter of the display name, or of the
  email when there is no name.
- Its accessible name is "Account: {email}" and its tooltip is the email.
- The open menu shows the name and the full email first, as before.

## Alternatives
- **Keep the full email in the header:** the strongest version of D24.9, but it doesn't match
  the chosen look and crowds the header on phones.
- **Initial plus email on wide screens only:** half of each; the owner picked the prototype.

## Consequences
- T22's mitigation is weaker: the email is one click or one hover away, not always in view. A
  visitor signed into a stranger's account sees a different initial (or their own initial by
  chance) and only the menu shows the email. The risk stays accepted for v1, as in D24.9.
- If login CSRF matters more later, the fix is server-side (a confirm page that names the
  account before signing in), not the header.
