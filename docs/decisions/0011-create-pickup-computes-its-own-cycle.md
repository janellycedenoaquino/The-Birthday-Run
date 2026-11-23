# 0011. create_pickup works out the cycle itself, from the caller's own profile

Date: 2026-11-23 · Status: accepted (day session; security first, CLAUDE.md)

## Context
BUILD F-5 had `create_pickup(…, p_cycle_start, p_cycle_end)`: the server action computed the
cycle with timing.ts and passed it in (D4: "SQL never re-implements timing"; D7: "the server
passes the module's bounds"). But the function is callable by any signed-in user straight through
PostgREST with their own token. The fresh-eyes review of PR 7 showed that, inside a rolled-back
transaction, a user could pick their own bounds and save a pickup dated years ahead, or two
pickups of one reward in the same real cycle. FR-17's rules held only in the action.

## Decision
`create_pickup(p_retailer_id, p_picked_up_on, p_note, p_location_label)` takes no dates beyond the
pickup date. It reads the caller's birth month, day and time zone (under the same profile lock),
works out "today" in that zone and today's cycle (decision 0008: 31 days before the birthday to
the day before the next cycle starts; `private.birthday_in` gives Feb 29 → Feb 28), and refuses a
date in the future or before that cycle, and a second pickup in it. Blank note or place is stored
as null, and the table refuses blank text. The action keeps the finer rules with timing.ts (the
reward is open, and the date isn't before it opened).

## Alternatives
- Call the function only from the server with the service-role key: no direct path, but the
  secret key would run with a user ID as input (rule 6), and the database stops being the backstop.
- Re-implement all five timing types in SQL: the full rule set in two languages, against NFR-5.
  Only the fixed cycle bounds (one formula, thanks to 0008) are duplicated.

## Consequences
- D4's "SQL never re-implements timing" now has one exception: cycle bounds and "today" in
  `create_pickup`. Both implementations must agree; `tests/rls/public.pickups.test.ts` and the
  unit tests cover the same cases (future, before the cycle, once per cycle).
- A pickup dated before a reward's own opening day is refused by the action, not the database.
