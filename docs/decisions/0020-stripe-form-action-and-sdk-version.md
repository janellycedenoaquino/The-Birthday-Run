# 0020. Stripe: form-action hosts and the SDK version

Date: 2026-11-25 · Status: accepted (F-8 build)

## Context
BUILD F-8 names `stripe` 23.0.0 with API version `2026-09-30.endive`. By the build, 23.2.0 was
the latest release (2026-11-19), pinning `2026-11-18.endive`. BUILD §0.7 also says the CSP
changes only for the map host. But the checkout and portal buttons are forms whose server action
redirects to Stripe, and Chrome applies `form-action` to a redirect after a form POST (the same
reason Google's host is already listed). Without Stripe's hosts the redirect is blocked before
hydration.

## Decision
- Use `stripe` 23.2.0 (owner's OK, 2026-11-24) with its own API version, so the types match the
  answers. `items.data[0].current_period_end` is still item-level in this version.
- Add `https://checkout.stripe.com` and `https://billing.stripe.com` to `form-action` only. No
  other directive changes: Stripe's pages are full navigations, so no script, frame or connect
  host is needed. Both buttons render only while `PAYMENTS_ENABLED=true`.

## Consequences
The CSP allows two more form targets, both Stripe-owned and HTTPS. `tests/unit/csp.test.ts`
pins the exact list. Moving to another major `stripe` release means a new API version, checked
against the sync fields first.
