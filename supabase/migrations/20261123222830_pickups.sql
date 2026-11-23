-- Migration (BUILD F-5, DESIGN §3 public.pickups): rewards picked up (FR-17, FR-19, FR-20, D7).
-- User data: own rows only, the MFA policy, cascade from auth.users (CLAUDE.md rules 1, 2, 19).
-- Rows are created only by create_pickup (no insert grant), so FR-17's rules can't be bypassed.
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table public.pickups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  retailer_id    text not null references public.retailers (id) on delete restrict,
  picked_up_on   date not null,
  note           text check (char_length(note) <= 500),            -- FR-17
  location_label text check (char_length(location_label) <= 500),  -- FR-17
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

-- D7: one pickup per retailer per cycle, under the caller's profile lock. The cycle bounds and the
-- allowed date come from timing.ts (decision 0008: fixed cycle bounds). Definer (bypasses RLS), so
-- every check RLS would make is explicit: caller, MFA, ownership; every statement filters on v_uid.
-- F-6 adds "delete the retailer's group items" (FR-26) when its table exists.
create function public.create_pickup(p_retailer_id text, p_picked_up_on date, p_note text,
                                     p_location_label text, p_cycle_start date, p_cycle_end date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null or not (select private.mfa_satisfied()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  if p_picked_up_on is null or p_cycle_start is null or p_cycle_end is null
     or p_picked_up_on not between p_cycle_start and p_cycle_end then
    raise exception using errcode = '22023', message = 'pickup_out_of_cycle';
  end if;
  perform 1 from public.profiles where id = v_uid for update;   -- serialises this user's pickups
  if not exists (select 1 from public.enrollments e join public.retailers r on r.id = e.retailer_id
                 where e.user_id = v_uid and e.retailer_id = p_retailer_id and r.retired_at is null) then
    raise exception using errcode = 'P0001', message = 'not_enrolled';
  end if;
  if exists (select 1 from public.pickups where user_id = v_uid and retailer_id = p_retailer_id
             and picked_up_on between p_cycle_start and p_cycle_end) then
    raise exception using errcode = 'P0001', message = 'pickup_exists';
  end if;
  insert into public.pickups (user_id, retailer_id, picked_up_on, note, location_label)
  values (v_uid, p_retailer_id, p_picked_up_on, p_note, p_location_label) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_pickup(text, date, text, text, date, date) from public, anon, authenticated;
grant execute on function public.create_pickup(text, date, text, text, date, date) to authenticated;
