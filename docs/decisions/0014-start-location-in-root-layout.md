# 0014. The start location lives in the root layout; FR-5 filters in the browser

Date: 2026-11-24 · Status: accepted (FR-5 build)

## Context
DESIGN D10 put the start location (FR-30) in a React context in the signed-in `(app)` layout.
FR-5's state filter needs the same start on Discover (S-103), which is in `(public)`, outside
that layout, so a start set on My Rewards wasn't available there.

## Decision
- `StartLocationProvider` moves to the root layout, inside `<main>`. It is still memory only
  and gone on reload; nothing about storage, logging or URLs changes (NFR-3).
- It is keyed on signed in / signed out, so signing in or out in this tab unmounts it and the
  start is forgotten without a reload. A session that ends in another tab is noticed at the next
  full navigation or reload. The key carries no personal data.
- **FR-5 runs in the browser, not as a URL parameter.** BUILD F-3 planned `?state=XX`, but a
  state in the URL lands in Vercel's request logs and browser history, which NFR-3 rules out
  ("kept only in the user's browser"). The state is kept in the same context, the page renders
  every card for premium users with each retailer's `states_scope`/`state_codes` (public
  catalogue data), and client components hide cards and adjust M-178. The server only sees the
  start inside `lookupZip`'s body, as for the map.

## Alternatives
- `?state=XX` as BUILD F-3 planned: simpler, works without JS, but logs the user's state.
- A second provider only on Discover: a start set on My Rewards wouldn't carry over.
- Moving Discover under `(app)`: it is also the signed-out catalogue (FR-2).
