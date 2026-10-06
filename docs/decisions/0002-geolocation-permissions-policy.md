# 0002. Permissions-Policy allows geolocation for this site

Date: 2026-10-06 · Status: accepted (owner approved 2026-10-06)

## Context
The Template sends `Permissions-Policy: geolocation=()`, which blocks the browser location API on every page. FR-30's "use my location" button needs it. Template rule 16 asks for a stated reason before loosening a security header.

## Decision
Send `geolocation=(self)`: this site's own pages may ask, embedded third-party frames may not. Location is requested only after the user presses the button (NFR-3), never on page load, and the browser still asks the user. Details: DESIGN D10.

## Alternatives
- Keep it blocked and offer ZIP only: works, but loses the most convenient start for phones.

## Consequences
One header value differs from the Template. The ZIP option keeps working if a user denies location.
