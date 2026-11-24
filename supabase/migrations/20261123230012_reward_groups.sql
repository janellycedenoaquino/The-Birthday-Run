-- Migration (BUILD F-6, DESIGN §3 reward_groups, reward_group_items): plan groups and their
-- ordered rewards (FR-22–FR-27, FR-40, D6, D13). User data: own rows only, the MFA policy,
-- cascade from auth.users (CLAUDE.md rules 1, 2, 19).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

-- D5's entitlement check, until F-7 (Phase 4) adds premium grants and subscriptions and replaces
-- this with the real one (owner's call, 2026-11-23): nobody is premium yet, so the free limits
-- (FR-24, FR-25) apply to everyone.
create function private.is_premium(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select false $$;
revoke all on function private.is_premium(uuid) from public, anon, authenticated;

create table public.reward_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]\u200b-\u200f\u2028\u2029\u2060\ufeff]'
                                   and name = btrim(name, E' \t\u00a0')),   -- A-19; no invisible characters
  pickup_date date not null,
  pickup_time time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create unique index reward_groups_user_name_key on public.reward_groups (user_id, lower(name));  -- FR-23 → BR-6

create table public.reward_group_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null,
  user_id     uuid not null,
  retailer_id text not null,
  position    integer not null,
  created_at  timestamptz not null default now(),
  foreign key (group_id, user_id) references public.reward_groups (id, user_id) on delete cascade,
  foreign key (user_id, retailer_id) references public.enrollments (user_id, retailer_id) on delete cascade,
  unique (group_id, retailer_id)                                                                -- FR-26 → BR-7
);
create index reward_group_items_user_retailer_idx on public.reward_group_items (user_id, retailer_id);

alter table public.reward_groups enable row level security;
alter table public.reward_group_items enable row level security;
revoke all on table public.reward_groups, public.reward_group_items from public, anon, authenticated;
grant select, delete on table public.reward_groups, public.reward_group_items to authenticated;
grant insert (user_id, name, pickup_date, pickup_time), update (name, pickup_date, pickup_time)
  on table public.reward_groups to authenticated;
grant insert (group_id, user_id, retailer_id, position), update (position)
  on table public.reward_group_items to authenticated;

create policy reward_groups_select_own on public.reward_groups
  for select to authenticated using (user_id = (select auth.uid()));
create policy reward_groups_insert_own on public.reward_groups
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy reward_groups_update_own on public.reward_groups
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reward_groups_delete_own on public.reward_groups
  for delete to authenticated using (user_id = (select auth.uid()));
create policy reward_groups_mfa_required on public.reward_groups
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));

create policy reward_group_items_select_own on public.reward_group_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy reward_group_items_insert_own on public.reward_group_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy reward_group_items_update_own on public.reward_group_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reward_group_items_delete_own on public.reward_group_items
  for delete to authenticated using (user_id = (select auth.uid()));
create policy reward_group_items_mfa_required on public.reward_group_items
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));

create trigger reward_groups_set_updated_at before update on public.reward_groups
  for each row execute function public.set_updated_at();

-- Today's cycle for a user, from their own birthday and zone (decision 0008, as create_pickup):
-- 31 days before the birthday to the day before the next cycle starts. Null when not onboarded.
create function private.current_cycle(p_user_id uuid, out cycle_start date, out cycle_end date)
language plpgsql stable security definer set search_path = '' as $$
declare v_month int; v_day int; v_zone text; v_today date; v_year int;
begin
  select birth_month, birth_day, time_zone into v_month, v_day, v_zone
    from public.profiles where id = p_user_id;
  if v_month is null or v_zone is null then return; end if;
  v_today := (now() at time zone v_zone)::date;
  v_year := extract(year from v_today)::int + 1;
  while private.birthday_in(v_year, v_month, v_day) - 31 > v_today loop
    v_year := v_year - 1;
  end loop;
  cycle_start := private.birthday_in(v_year, v_month, v_day) - 31;
  cycle_end := private.birthday_in(v_year + 1, v_month, v_day) - 32;
end $$;
revoke all on function private.current_cycle(uuid) from public, anon, authenticated;

-- D6: counted under the owner's profile lock; updates and deletes never check (FR-40). BEFORE
-- triggers run before RLS's WITH CHECK, so each first refuses a row for someone else: otherwise a
-- user could lock another user's profile and learn from the error whether they're at the limit.
create function private.enforce_group_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  perform 1 from public.profiles where id = new.user_id for update;
  -- FR-24 counts this birthday year's groups and later ones (pickup on or after today's cycle
  -- start); past years' groups stay for reference and don't block planning (owner, 2026-11-23).
  if not private.is_premium(new.user_id)
     and (select count(*) from public.reward_groups
          where user_id = new.user_id
            and pickup_date >= coalesce((select c.cycle_start from private.current_cycle(new.user_id) c),
                                        '-infinity'::date)) >= 3 then
    raise exception using errcode = 'P0001', message = 'plan_group_limit', detail = '3';
  end if;
  return new;
end $$;
create function private.enforce_item_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_start date; v_end date;
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  perform 1 from public.profiles where id = new.user_id for update;
  -- The group must be the caller's own before anything about it is counted or said.
  if not exists (select 1 from public.reward_groups where id = new.group_id and user_id = new.user_id) then
    raise exception using errcode = 'P0001', message = 'group_not_found';
  end if;
  -- FR-26 at the database too, for direct writes: a listed retailer, not picked up this cycle.
  if not exists (select 1 from public.retailers where id = new.retailer_id and retired_at is null) then
    raise exception using errcode = 'P0001', message = 'retailer_retired';
  end if;
  select c.cycle_start, c.cycle_end into v_start, v_end from private.current_cycle(new.user_id) c;
  if v_start is not null and exists (
       select 1 from public.pickups where user_id = new.user_id and retailer_id = new.retailer_id
       and picked_up_on between v_start and v_end) then
    raise exception using errcode = 'P0001', message = 'pickup_exists';
  end if;
  v_limit := case when private.is_premium(new.user_id) then 10 else 5 end;                  -- FR-25
  if (select count(*) from public.reward_group_items where group_id = new.group_id) >= v_limit then
    raise exception using errcode = 'P0001', message = 'plan_item_limit', detail = v_limit::text;
  end if;
  -- Positions are given here, under the lock, so two adds at once can't share one; reorder
  -- rewrites them afterwards.
  new.position := coalesce((select max(position) from public.reward_group_items
                            where group_id = new.group_id), 0) + 1;
  return new;
end $$;
revoke all on function private.enforce_group_limit(), private.enforce_item_limit() from public, anon, authenticated;
create trigger reward_groups_limit before insert on public.reward_groups
  for each row execute function private.enforce_group_limit();
create trigger reward_group_items_limit before insert on public.reward_group_items
  for each row execute function private.enforce_item_limit();

-- FR-27: one statement rewrites the order. The caller sends the order they saw (p_expected); if
-- the saved order differs (another tab moved, added or removed something), it's refused (BR-17).
-- Invoker: RLS applies, so another user's group is simply not found.
create function public.reorder_group_items(p_group_id uuid, p_expected uuid[], p_item_ids uuid[])
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.reward_groups where id = p_group_id) then
    raise exception using errcode = 'P0001', message = 'group_not_found';
  end if;
  perform 1 from public.reward_groups where id = p_group_id for update;
  if (select coalesce(array_agg(id order by position, id), '{}') from public.reward_group_items
      where group_id = p_group_id) is distinct from coalesce(p_expected, '{}')
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_expected) as x)
        is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_item_ids) as x) then
    raise exception using errcode = 'P0001', message = 'stale_group_order';
  end if;
  update public.reward_group_items i set position = t.ord
    from unnest(p_item_ids) with ordinality as t(id, ord)
   where i.id = t.id and i.group_id = p_group_id;
end $$;
revoke all on function public.reorder_group_items(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_group_items(uuid, uuid[], uuid[]) to authenticated;

-- F-5 waited for this table: a pickup removes the reward from every group (FR-26).
create or replace function public.create_pickup(p_retailer_id text, p_picked_up_on date, p_note text,
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
  delete from public.reward_group_items where user_id = v_uid and retailer_id = p_retailer_id;  -- FR-26
  return v_id;
end $$;
