-- Migration (BUILD F-2, DESIGN §3 profiles additions): birthday, time zone and onboarding state
-- on the user's own profile (FR-6, FR-9, FR-10, D4). No year column, ever (NFR-3).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

alter table public.profiles
  add column birth_month       smallint check (birth_month between 1 and 12),
  add column birth_day         smallint,
  add column time_zone         text check (char_length(time_zone) between 1 and 64),
  add column onboarded_at      timestamptz,
  add column reminders_enabled boolean not null default true,
  add constraint profiles_birthday_pair check ((birth_month is null) = (birth_day is null)),
  -- Feb 29 is a real birthday (FR-6), so February allows 29.
  add constraint profiles_birthday_real check (birth_day is null or birth_day between 1 and
    case birth_month when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end);

-- Own row only: the existing profiles_update_own policy (and the MFA policy) still apply.
grant update (birth_month, birth_day, time_zone, onboarded_at, reminders_enabled)
  on table public.profiles to authenticated;
