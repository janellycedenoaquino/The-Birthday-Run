-- F-11 Smart Grouping, "Apply all" (FR-29, BUILD F-11 flow 7). Every suggested group and its
-- items are inserted in this one call, so they share one transaction: F-6's limit triggers and
-- FR-26 checks run for each row, and the first refusal rolls back every group (nothing created).
-- Invoker: RLS and the column grants apply exactly as for direct inserts; the caller can only
-- create their own groups. Item positions are set by the item trigger, in array order.
create function public.apply_group_suggestions(p_groups jsonb)
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
    for v_retailer in select value from jsonb_array_elements_text(v_group -> 'retailerIds') loop
      insert into public.reward_group_items (group_id, user_id, retailer_id, position)
      values (v_id, v_uid, v_retailer, 1);  -- the trigger replaces the position
    end loop;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;
revoke all on function public.apply_group_suggestions(jsonb) from public, anon, authenticated;
grant execute on function public.apply_group_suggestions(jsonb) to authenticated;
