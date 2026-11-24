-- F-12 reminder emails (FR-41, FR-42, D14, D15). reminder_log holds one claim per reminder sent:
-- the unique keys make a doubled cron run send once. Users can read their own rows (export);
-- only the job (service_role) inserts and deletes. The job reads candidates, their rewards and
-- their pickups through definer functions that only service_role can run, so it needs no table
-- grants on enrollments or pickups (production has auto-grant off: every grant is explicit).

create type public.reminder_kind as enum ('plan_ahead', 'expiring');

create table public.reminder_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        public.reminder_kind not null,
  cycle_start date not null,
  sent_on     date not null,                       -- the user's local date
  created_at  timestamptz not null default now(),
  unique (user_id, kind, sent_on)
);
create unique index reminder_log_plan_ahead_once on public.reminder_log (user_id, kind, cycle_start)
  where kind = 'plan_ahead';
create index reminder_log_user_kind_sent_idx on public.reminder_log (user_id, kind, sent_on desc);

alter table public.reminder_log enable row level security;
revoke all on table public.reminder_log from public, anon, authenticated, service_role;
grant select on table public.reminder_log to authenticated;                  -- export only
grant select, insert, delete on table public.reminder_log to service_role;   -- claims (D15)
create policy reminder_log_select_own on public.reminder_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy reminder_log_mfa_required on public.reminder_log
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));

-- The job's user list: premium users with reminders on, a birthday, a zone and a confirmed email.
create function public.reminder_candidates()
returns table (user_id uuid, email text, display_name text, birth_month smallint,
               birth_day smallint, time_zone text)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.email::text, p.display_name, p.birth_month, p.birth_day, p.time_zone
  from public.profiles p join auth.users u on u.id = p.id
  where p.reminders_enabled and p.birth_month is not null and p.birth_day is not null
    and p.time_zone is not null and u.email is not null and u.email_confirmed_at is not null
    and private.is_premium(p.id)
  order by p.id;
$$;

-- Their enrolled, listed rewards (timing columns for the timing module, NFR-5).
create function public.reminder_rewards(p_user_ids uuid[])
returns table (user_id uuid, retailer_id text, name text, reward_description text,
               timing_type public.timing_type, days_before smallint, days_after smallint)
language sql stable security definer set search_path = ''
as $$
  select e.user_id, r.id, r.name, r.reward_description, r.timing_type, r.days_before, r.days_after
  from public.enrollments e join public.retailers r on r.id = e.retailer_id
  where e.user_id = any (p_user_ids) and r.retired_at is null
  order by e.user_id, r.name;
$$;

-- Their pickups since a date (the earliest cycle start the job needs).
create function public.reminder_pickups(p_user_ids uuid[], p_since date)
returns table (user_id uuid, retailer_id text, picked_up_on date)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.retailer_id, p.picked_up_on
  from public.pickups p
  where p.user_id = any (p_user_ids) and p.picked_up_on >= p_since;
$$;

revoke all on function public.reminder_candidates(), public.reminder_rewards(uuid[]),
  public.reminder_pickups(uuid[], date) from public, anon, authenticated;
grant execute on function public.reminder_candidates(), public.reminder_rewards(uuid[]),
  public.reminder_pickups(uuid[], date) to service_role;
