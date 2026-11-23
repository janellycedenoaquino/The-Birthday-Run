# 0008. Cycles start 31 days before the birthday, whatever is enrolled

Date: 2026-11-23 · Status: accepted (owner, day session)

## Context
SPEC Terms defined a cycle as running "from one window's start to the next", and a window's start depends on the rewards the user is enrolled in now. The fresh-eyes review of PR 3 showed the consequence: with a Jan 1 birthday and a 30-day-early reward, a pickup on Dec 5 belongs to the next year's cycle; after unenrolling that reward, the same pickup moves back a year. It would then vanish from that year's History (FR-19), and the one-pickup-per-cycle rule (FR-17) would let the same reward be claimed again. Changing the birthday (FR-9) or a retailer's timing in the CSV would shift pickups the same way.

## Decision
A cycle runs from 31 days before its birthday (B−31, the most any reward can open early: FR-1 caps a reward at 31 days in total) to the day before the next year's B−31. The bounds use only the birthday, never enrollments. The window (where rewards are open) still depends on enrollments, and always lies inside its cycle. `dayNumber` now counts from the planning cycle's birthday, so it's negative before the birthday, as SPEC Terms says.

## Alternatives
- Store the cycle year on each pickup when it's made (F-5): stable too, but needs a column, and the module would still disagree with the stored year.
- Keep the old definition: pickups move between years when enrollments change.

## Consequences
- Every valid pickup gets the same History year as before, because pickups can only be dated inside the window, and the window is inside the cycle.
- A birthday change (FR-9) still regroups pickups, as SPEC says; only enrollment changes no longer do.
- SPEC Terms and BUILD F-2's rules are updated.
