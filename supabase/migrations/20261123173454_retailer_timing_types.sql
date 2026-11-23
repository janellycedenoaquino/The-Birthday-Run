-- Migration (decision 0007, FR-11): two more retailer timing types.
--   month_start:  from the 1st of the birth month for N days (days_after = N)
--   to_month_end: from the birthday to the last day of the birth month
-- Its own file: Postgres can't use a new enum value in the transaction that adds it, and the
-- next migration's CHECK uses these values.
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

alter type public.timing_type add value 'month_start';
alter type public.timing_type add value 'to_month_end';
