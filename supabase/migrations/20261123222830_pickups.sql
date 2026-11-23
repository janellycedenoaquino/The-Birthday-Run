-- Migration (BUILD F-5, DESIGN §3 public.pickups): rewards picked up (FR-17, FR-19, FR-20, D7).
-- User data: own rows only, the MFA policy, cascade from auth.users (CLAUDE.md rules 1, 2, 19).
-- Rows are created only by create_pickup (no insert grant), which takes no dates from the caller
-- beyond the pickup date itself, so the one-per-cycle and no-future rules can't be bypassed.
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table public.pickups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  retailer_id    text not null references public.retailers (id) on delete restrict,
  picked_up_on   date not null,
  -- FR-17: plain text up to 500 characters; never blank (the function stores blank as null).
  note           text check (char_length(note) <= 500 and btrim(note) <> ''),
  location_label text check (char_length(location_label) <= 500 and btrim(location_label) <> ''),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pickups_user_retailer_date_idx on public.pickups (user_id, retailer_id, picked_up_on);
create index pickups_retailer_id_idx on public.pickups (retailer_id);
create trigger pickups_set_updated_at before update on public.pickups
  for each row execute function public.set_updated_at();
alter table public.pickups enable row level security;

revoke all on table public.pickups from public, anon, authenticated;   -- undo Supabase default grants
grant select, delete on table public.pickups to authenticated;
grant update (note, location_label) on table public.pickups to authenticated;

create policy pickups_select_own on public.pickups
  for select to authenticated using (user_id = (select auth.uid()));
create policy pickups_update_own on public.pickups
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pickups_delete_own on public.pickups
  for delete to authenticated using (user_id = (select auth.uid()));

-- D8: every user-data table carries this restrictive policy.
create policy pickups_mfa_required on public.pickups
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied()));

-- The birthday in a given year: Feb 29 is Feb 28 in years without one (FR-10, as timing.ts).
create function private.birthday_in(p_year int, p_month int, p_day int)
returns date
language sql immutable set search_path = ''
as $$
  select make_date(p_year, p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int));
$$;
revoke all on function private.birthday_in(int, int, int) from public, anon, authenticated;

-- D7: one pickup per retailer per cycle, under the caller's profile lock. Definer (bypasses RLS),
-- so every check RLS would make is explicit, and nothing about dates is taken from the caller:
-- the cycle comes from the caller's own birthday (decision 0008: 31 days before the birthday to
-- the day before the next cycle starts, whatever is enrolled), "today" from their own time zone.
-- The date must be today or earlier and in today's cycle. The server action adds the finer
-- rules (the reward is open, and the date isn't before it opened) with timing.ts.
-- F-6 adds "delete the retailer's group items" (FR-26) when its table exists.
create function public.create_pickup(p_retailer_id text, p_picked_up_on date, p_note text,
                                     p_location_label text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_month int; v_day int; v_zone text;
  v_today date; v_year int; v_start date; v_end date;
  v_id uuid;
begin
  if v_uid is null or not (select private.mfa_satisfied()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  -- The lock serialises this user's pickups and reads their own birthday and zone.
  select birth_month, birth_day, time_zone into v_month, v_day, v_zone
    from public.profiles where id = v_uid for update;
  if v_month is null or v_zone is null then
    raise exception using errcode = 'P0001', message = 'not_onboarded';
  end if;
  v_today := (now() at time zone v_zone)::date;
  -- Today's cycle: the latest one that has started (next year's starts in late Nov/Dec for an
  -- early-January birthday).
  v_year := extract(year from v_today)::int + 1;
  while private.birthday_in(v_year, v_month, v_day) - 31 > v_today loop
    v_year := v_year - 1;
  end loop;
  v_start := private.birthday_in(v_year, v_month, v_day) - 31;
  v_end := private.birthday_in(v_year + 1, v_month, v_day) - 32;
  if p_picked_up_on is null or p_picked_up_on > v_today or p_picked_up_on < v_start then
    raise exception using errcode = '22023', message = 'pickup_out_of_cycle';
  end if;
  if not exists (select 1 from public.enrollments e join public.retailers r on r.id = e.retailer_id
                 where e.user_id = v_uid and e.retailer_id = p_retailer_id and r.retired_at is null) then
    raise exception using errcode = 'P0001', message = 'not_enrolled';
  end if;
  if exists (select 1 from public.pickups where user_id = v_uid and retailer_id = p_retailer_id
             and picked_up_on between v_start and v_end) then
    raise exception using errcode = 'P0001', message = 'pickup_exists';
  end if;
  insert into public.pickups (user_id, retailer_id, picked_up_on, note, location_label)
  values (v_uid, p_retailer_id, p_picked_up_on,
          nullif(btrim(p_note), ''), nullif(btrim(p_location_label), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_pickup(text, date, text, text) from public, anon, authenticated;
grant execute on function public.create_pickup(text, date, text, text) to authenticated;
