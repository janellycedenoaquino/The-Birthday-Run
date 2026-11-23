-- Migration (decision 0007, FR-11, FR-1): the timing CHECK for all five types, and how many days
-- before the birthday a member must have joined for the reward to arrive (signup_lead_days).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

alter table public.retailers
  drop constraint retailers_timing_columns,
  -- coalesce: a CHECK that evaluates to NULL passes, so a NULL day count must count as false.
  add constraint retailers_timing_columns check (coalesce(
       (timing_type = 'from_birthday'   and days_before is null and days_after between 1 and 31)
    or (timing_type = 'birth_month'     and days_before is null and days_after is null)
    or (timing_type = 'around_birthday' and days_before >= 1 and days_after >= 0
                                        and days_before + days_after + 1 <= 31)
    or (timing_type = 'month_start'     and days_before is null and days_after between 1 and 31)
    or (timing_type = 'to_month_end'    and days_before is null and days_after is null), false)),
  -- null = the brand states no lead time (or it isn't known yet).
  add column signup_lead_days smallint check (signup_lead_days between 1 and 90);
