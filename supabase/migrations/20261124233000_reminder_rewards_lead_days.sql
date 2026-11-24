-- FR-41 changed (owner, 2026-11-24): the plan-ahead email goes out before the user's earliest
-- reward opens or the earliest join-by date (FR-49), so the job needs each retailer's sign-up lead
-- time. The return type changes, so the function is dropped and recreated with the same grants.
drop function public.reminder_rewards(uuid[]);
create function public.reminder_rewards(p_user_ids uuid[])
returns table (user_id uuid, retailer_id text, name text, reward_description text,
               timing_type public.timing_type, days_before smallint, days_after smallint,
               signup_lead_days smallint)
language sql stable security definer set search_path = ''
as $$
  select e.user_id, r.id, r.name, r.reward_description, r.timing_type, r.days_before, r.days_after,
         r.signup_lead_days
  from public.enrollments e join public.retailers r on r.id = e.retailer_id
  where e.user_id = any (p_user_ids) and r.retired_at is null
  order by e.user_id, r.name;
$$;
revoke all on function public.reminder_rewards(uuid[]) from public, anon, authenticated;
grant execute on function public.reminder_rewards(uuid[]) to service_role;
