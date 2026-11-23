# 0010. Each e2e spec file signs in from its own client IP

Date: 2026-11-23 · Status: accepted (day session)

## Context
The sign-in limit is 20 per IP per 10 minutes (BUILD §0.4). Locally every request has no
`x-forwarded-for`, so the whole browser suite shared one key ("unknown"). By Phase 2 the suite
used exactly 20 sign-ins: PR 5's first version tripped it (an unrelated sign-out test failed with
"Too many attempts"), and PR 6's rewards spec brought the counter back to the limit.

## Decision
`tests/e2e/support.ts` exports `ownIp(n)`; every spec file that signs in or signs up calls
`test.use(ownIp(n))` with its own number, which sends `x-forwarded-for: 198.51.100.n` (RFC 5737
documentation range). The limiter reads the first `x-forwarded-for` value, so each file gets its
own budget. The busiest key after a full run went from 20 to 6.

## Alternatives
- Keep merging tests into fewer users: brittle, and every new spec fights for the same 20.
- A test-only switch that raises or skips the limit: the e2e run would stop exercising the real
  limiter as production runs it.
- Sign in through the API and inject cookies: skips the real sign-in form most specs rely on.

## Consequences
- In production Vercel overwrites `x-forwarded-for`, so the header sent by a test changes nothing
  there (`E2E_TARGET=deployed` runs are unaffected), and nothing in the app changed.
- A new spec file that signs in should add `test.use(ownIp(<unused number>))`.
