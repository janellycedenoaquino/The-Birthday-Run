-- Migration (BUILD F-7, DESIGN §3 premium_grants, subscriptions): the two sources of premium and
-- the one answer, is_premium (FR-35, FR-36, D5). User data: users read their own rows and never
-- write them (NFR-2): grants come from the owner's script, subscriptions from Stripe (F-8).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table public.premium_grants (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  synced_at              timestamptz not null default now()
);
create trigger premium_grants_set_updated_at before update on public.premium_grants
  for each row execute function public.set_updated_at();

alter table public.premium_grants enable row level security;
alter table public.subscriptions  enable row level security;
revoke all on table public.premium_grants, public.subscriptions from public, anon, authenticated, service_role;
grant select on table public.premium_grants, public.subscriptions to authenticated;   -- read, never write (NFR-2)
grant select, insert, update, delete on table public.subscriptions to service_role;  -- webhook + checkout set-up (F-8)

create policy premium_grants_select_own on public.premium_grants
  for select to authenticated using (user_id = (select auth.uid()));
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy premium_grants_mfa_required on public.premium_grants
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));
create policy subscriptions_mfa_required on public.subscriptions
  as restrictive for all to authenticated using ((select private.mfa_satisfied()));

-- D5: the one answer (FR-35), replacing Phase 3's stand-in that always said no (decision 0012).
-- `active` with no period end counts as free (fails closed); past_due keeps premium while Stripe
-- retries (FR-37).
create or replace function private.is_premium(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.premium_grants g
                 where g.user_id = p_user_id and g.revoked_at is null)
      or exists (select 1 from public.subscriptions s where s.user_id = p_user_id
                 and ((s.status = 'active' and s.current_period_end > now()) or s.status = 'past_due'));
$$;
revoke all on function private.is_premium(uuid) from public, anon, authenticated;
grant execute on function private.is_premium(uuid) to service_role;   -- the reminder job's query (F-12)

create function public.is_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_premium((select auth.uid())), false);
$$;
revoke all on function public.is_premium() from public, anon, authenticated;
grant execute on function public.is_premium() to authenticated;
