# 0014. The start location lives in the root layout

Date: 2026-11-24 · Status: accepted (FR-5 build)

## Context
DESIGN D10 put the start location (FR-30) in a React context in the signed-in `(app)` layout.
FR-5's state filter needs the same start on Discover (S-103), which is in `(public)`, outside
that layout, so a start set on My Rewards wasn't available there.

## Decision
- `StartLocationProvider` moves to the root layout, inside `<main>`. It is still memory only
  and gone on reload; nothing about storage, logging or URLs changes (NFR-3).
- It is keyed on signed in / signed out, so signing out (or in) unmounts it and the start is
  forgotten at once, even without a reload. The key carries no personal data.
- The state filter is a GET parameter, `?state=XX` (BUILD F-3 planned it so). A two-letter
  state is coarser than the start and is only read for premium users; the start itself never
  goes in a URL.

## Alternatives
- A second provider only on Discover: a start set on My Rewards wouldn't carry over.
- Moving Discover under `(app)`: it is also the signed-out catalogue (FR-2).
