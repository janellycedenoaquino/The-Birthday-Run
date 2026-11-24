# 0019. The plan-ahead email goes out when the user can first act

Date: 2026-11-24 · Status: accepted

## Context
FR-41 sent the plan-ahead email (E-101) 1–7 days before the birthday. The owner pointed out that people plan about a month ahead because some rewards start early. The live catalogue (`data/retailers.csv`, 2026-11-24) confirms it:
- **Rewards that open early:** 37 rewards are birth-month or start on the 1st of the month. For a birthday on the 31st, they open 30 days before. "Around the birthday" rewards open up to 14 days before (Olive Garden, Charlotte Tilbury, Anthropologie).
- **Join-by lead times (FR-49):** members must join up to 30 days ahead (Tarte, Nordstrom Rack, Alex and Ani, AMC) or 28 days ahead (CVS).

So a week before is often too late. A fixed month before is too early for someone whose rewards all start on the birthday.

## Decision
Each user gets the plan-ahead email on their own start day:
- **Start day:** the earliest day they can act on a reward still to get (the day it opens, or its join-by date), minus 2 days for a buffer.
- **Range:** never more than 32 days before the birthday, and at the latest 7 days before. With nothing early, it's 7 days before, as before.
- **Sending:** from the start day until the day before the birthday, once per cycle. A missed run still sends the next day (D14).
- **Content:** each line shows "Join by {date}" when the brand has a lead time, then "Opens {date} · Last day: {date}".
- **Subject:** "Time to plan your Birthday Run".
- **Premium only, as before.**

`public.reminder_rewards` now also returns `signup_lead_days`. Migration `20261124233000_reminder_rewards_lead_days.sql` recreates it with the same grants.

## Alternatives
- **A fixed 30 days before for everyone:** too early for users whose rewards all start on the birthday, and they'd forget.
- **Keep 7 days:** misses month-long rewards opening on the 1st, and 30-day join-by deadlines.
- **Free users too:** the owner kept reminders premium. They don't go out every day: at most one plan-ahead and a few expiring emails per birthday.

## Consequences
- **Spreading:** plan-ahead emails spread over more days, which helps the 100-a-day Resend free limit. The run budget (40 per run, F-12) and the expiring-first order are unchanged.
- **Docs:** SPEC FR-41, E-101 and M-258 are updated, plus BUILD F-12 flow step 5.
- **Tests:** they cover the birth-month start, the 30-day join-by cap and the line dates.
