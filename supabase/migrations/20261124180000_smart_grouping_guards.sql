-- F-11 review fixes (FR-29, FR-24, T-101).
--
-- 1. apply_group_suggestions is a premium operation: like nearby_stores and zip_location it now
--    refuses free users in the database too, so a direct RPC call can't skip the action's check.
-- 2. FR-24's free limit counts this birthday year's groups (pickup on or after the cycle start).
--    A new group dated before that start was never counted, so direct inserts with an old date
--    could pass the limit without end. New groups must now be dated in the current cycle or
--    later (updates keep working, so old groups can still be edited: FR-40).

create or replace function public.apply_group_suggestions(p_groups jsonb)
returns uuid[]
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_retailer text;
begin
  if not public.is_premium() then
    raise exception using errcode = 'P0001', message = 'not_premium';
  end if;
  -- FR-29: at most 4 suggested groups.
  if jsonb_typeof(p_groups) is distinct from 'array'
     or jsonb_array_length(p_groups) not between 1 and 4 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group -> 'retailerIds') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    insert into public.reward_groups (user_id, name, pickup_date, pickup_time)
    values (v_uid, v_group ->> 'name', (v_group ->> 'pickupDate')::date,
            (v_group ->> 'pickupTime')::time)
    returning id into v_id;
    for v_retailer in select distinct value from jsonb_array_elements_text(v_group -> 'retailerIds') loop
      insert into public.reward_group_items (group_id, user_id, retailer_id, position)
      values (v_id, v_uid, v_retailer, 1);  -- the trigger replaces the position
    end loop;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

create or replace function private.enforce_group_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_start date;
begin
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  perform 1 from public.profiles where id = new.user_id for update;
  select c.cycle_start into v_start from private.current_cycle(new.user_id) c;
  -- A user's new group can't be dated before this birthday year (it would escape FR-24's
  -- count). Service-role writes (scripts, tests standing in for last year's groups) are exempt.
  if (select auth.uid()) is not null and v_start is not null and new.pickup_date < v_start then
    raise exception using errcode = 'P0001', message = 'pickup_out_of_cycle';
  end if;
  -- FR-24 counts this birthday year's groups and later ones (pickup on or after today's cycle
  -- start); past years' groups stay for reference and don't block planning (owner, 2026-11-23).
  if not private.is_premium(new.user_id)
     and (select count(*) from public.reward_groups
          where user_id = new.user_id
            and pickup_date >= coalesce(v_start, '-infinity'::date)) >= 3 then
    raise exception using errcode = 'P0001', message = 'plan_group_limit', detail = '3';
  end if;
  return new;
end $$;
