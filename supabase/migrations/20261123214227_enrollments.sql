-- Migration (BUILD F-3, DESIGN §3 public.enrollments): which programs a user belongs to (FR-7, FR-8).
-- User data: own rows only, the MFA policy, cascade from auth.users (CLAUDE.md rules 1, 2, 19).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table public.enrollments (
  user_id     uuid not null references auth.users (id) on delete cascade,
  retailer_id text not null references public.retailers (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (user_id, retailer_id)
);
create index enrollments_retailer_id_idx on public.enrollments (retailer_id);
alter table public.enrollments enable row level security;

revoke all on table public.enrollments from public, anon, authenticated;   -- undo Supabase default grants
grant select, delete on table public.enrollments to authenticated;
grant insert (user_id, retailer_id) on table public.enrollments to authenticated;

create policy enrollments_select_own on public.enrollments
  for select to authenticated using (user_id = (select auth.uid()));
-- BR-3 at the database: only a listed (non-retired) retailer can be joined.
create policy enrollments_insert_own on public.enrollments
  for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.retailers r where r.id = retailer_id and r.retired_at is null));
create policy enrollments_delete_own on public.enrollments
  for delete to authenticated using (user_id = (select auth.uid()));

-- D8: every user-data table carries this restrictive policy.
create policy enrollments_mfa_required on public.enrollments
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied()));
