# 0021. Stripe webhook: record the event after the sync; ask Stripe before checkout

Date: 2026-11-25 · Status: accepted (F-8 fresh-eyes review)

## Context
BUILD F-8 has the webhook claim the event ID first (step 4) and delete the claim if the sync
throws (step 6). A function killed or timed out between the two (the Stripe client can spend up
to 3 × 10 s) leaves the claim behind, so every retry answers "duplicate" and the sync never runs:
a paying user could stay free. Two syncs at once (Checkout sends 3–4 events together) could also
store an older read last. And checkout refused a second purchase only from the stored row, which
lags the webhook: a user who just paid could open a second Checkout and be charged twice.

## Decision
- **Record after sync.** The handler checks whether the event ID is already recorded (then
  "duplicate"), syncs, and only then records the ID. The ID only skips work already done. Two
  deliveries at once may both sync, which is harmless: the sync reads Stripe and is idempotent.
- **Newest read wins.** `synced_at` is the time after Stripe was read, and the update applies
  only where the stored `synced_at` is older, so an earlier read never overwrites a later one.
- **Checkout asks Stripe.** `createCheckoutSession` runs `syncCustomer` before the BR-16 check
  and refuses while any subscription hasn't ended (`canceled`, `incomplete_expired`), not only
  `active` / `past_due`.
- **Customer deleted last.** `cancelForDeletion` only cancels; the Stripe Customer is deleted
  after `auth.admin.deleteUser` succeeds (best effort, logged), so a failed account deletion
  doesn't leave the user pointing at a deleted Customer.

## Consequences
A webhook delivery can run the sync twice (one extra Stripe read). A checkout click makes one
Stripe read before the session. A Customer whose deletion fails after the account is gone is an
orphan in Stripe with no subscription (Stripe keeps payment records anyway, D8).
