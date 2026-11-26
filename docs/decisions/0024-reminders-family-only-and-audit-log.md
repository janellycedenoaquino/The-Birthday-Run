# 0024. Reminders reach family accounts only until a postal address is added; the auth audit log stays

Date: 2026-11-26 · Status: accepted (owner, 2026-11-26, after the options were explained)

## Context
Two launch items were waiting on the owner (LAUNCH-CHECKLIST "v1: Security and privacy" and
"v2 sign-off"):
- **CAN-SPAM (DESIGN §4.4):** every reminder (FR-41) needs a valid physical postal address. That
  can be a street address, a USPS PO box or a registered private mailbox. A home address puts the
  owner's address in every email; a box costs money, against the $0 budget (SPEC §1).
- **Auth audit log (Template decisions/0017):** after account deletion, `auth.audit_log_entries`
  keeps the user's sign-up, sign-in and deletion rows, with their email and possibly IP address.
  The app either deletes those rows on deletion or keeps them and says so.

## Decision
- **No postal address for now; reminders reach family accounts only.** Reminders go only to
  Premium users (FR-41). With payments off (FR-38), Premium comes only from the owner's grant
  script (FR-36), and the owner grants it only to herself and her two sisters. A postal address
  must be in the reminder footer **before** the owner grants Premium to anyone else, and before
  payments go on (LAUNCH-CHECKLIST "Before turning payments on" already lists it).
- **The audit log stays.** No clean-up on account deletion. The privacy policy (Template S-2,
  "How long we keep it") already tells users the security log outlives deletion.

## Consequences
- No code change, and $0. The family-only limit is a rule the owner follows when running the
  grant script, not something the code enforces.
- Granting Premium outside the family, or turning payments on, now needs the address first.
- The audit rows help trace abuse of an account. If the app ever has to erase them (e.g. a
  GDPR request), that needs a new decision: Supabase manages the `auth` schema.
