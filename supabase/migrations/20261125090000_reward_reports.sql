-- F-13 reward reports (FR-48, NFR-11, D16). One report per user, retailer and cycle, with a fixed
-- reason and no free text. Users insert and read their own rows (export); nobody updates or
-- deletes them through the API. The forward-reports Action reads counts only, through two
-- definer functions that only service_role can run (production has auto-grant off: every grant
-- is explicit).

create type public.report_reason as enum ('expired', 'different_reward', 'wrong_timing', 'store_closed');

create table public.reward_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  retailer_id  text not null references public.retailers (id) on delete restrict,
  reason       public.report_reason not null,
  cycle_start  date not null,
  created_at   timestamptz not null default now(),
  batch_id     uuid,
  forwarded_at timestamptz,
  unique (user_id, retailer_id, cycle_start)                 -- FR-48
);
create index reward_reports_pending_idx on public.reward_reports (retailer_id) where forwarded_at is null;

alter table public.reward_reports enable row level security;
revoke all on table public.reward_reports from public, anon, authenticated, service_role;
grant select on table public.reward_reports to authenticated;
grant insert (user_id, retailer_id, reason, cycle_start) on table public.reward_reports to authenticated;
create policy reward_reports_select_own on public.reward_reports
  for select to authenticated using (user_id = (select auth.uid()));
-- BR-3: a retired or unknown retailer can't be reported (as enrollments).
create policy reward_reports_insert_own on public.reward_reports
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.retailers r where r.id = retailer_id and r.retired_at is null));
create policy reward_reports_mfa_required on public.reward_reports
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));

-- FR-48's "one per cycle" holds only if cycle_start is the real one: a user's insert gets today's
-- cycle from their own profile (decision 0008, private.current_cycle), whatever they sent, so a
-- direct API call can't pick another date to report again. Not onboarded → refused (BR-1). The
-- first check refuses a row for someone else before reading any profile (as enforce_group_limit).
-- Service-role and SQL writes (tests standing in for last year's reports) keep their value.
create function private.set_report_cycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_start date;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.user_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  select c.cycle_start into v_start from private.current_cycle(new.user_id) c;
  if v_start is null then
    raise exception using errcode = 'P0001', message = 'not_onboarded';
  end if;
  new.cycle_start := v_start;
  return new;
end $$;
revoke all on function private.set_report_cycle() from public, anon, authenticated;
create trigger reward_reports_set_cycle before insert on public.reward_reports
  for each row execute function private.set_report_cycle();

-- D16: claim every unforwarded report into a new batch and return counts only (atomic). A newer
-- claim re-stamps unacked rows, so an old batch's ack changes nothing and they're offered again.
create function public.claim_report_batch(p_batch uuid)
returns table (retailer_id text, reason public.report_reason, report_count int)
language sql volatile security definer set search_path = ''
as $$
  with claimed as (
    update public.reward_reports set batch_id = p_batch
    where forwarded_at is null
    returning retailer_id, reason
  )
  select c.retailer_id, c.reason, count(*)::int from claimed c group by 1, 2 order by 1, 2;
$$;
create function public.ack_report_batch(p_batch uuid)
returns int
language sql volatile security definer set search_path = ''
as $$
  with acked as (
    update public.reward_reports set forwarded_at = now()
    where batch_id = p_batch and forwarded_at is null returning 1
  ) select count(*)::int from acked;
$$;
revoke all on function public.claim_report_batch(uuid), public.ack_report_batch(uuid) from public, anon, authenticated;
grant execute on function public.claim_report_batch(uuid), public.ack_report_batch(uuid) to service_role;
