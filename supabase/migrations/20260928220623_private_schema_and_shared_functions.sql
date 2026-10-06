-- Migration 1 (BUILD F-1): private schema, private.mfa_satisfied() (D8), public.set_updated_at().
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- USAGE only so RLS policies can call private.mfa_satisfied(); `private` is not an exposed PostgREST schema.
grant usage on schema private to authenticated;

-- D8: aal2 in the verified JWT, or no verified factor.
create function private.mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
           select 1 from auth.mfa_factors f
           where f.user_id = (select auth.uid()) and f.status = 'verified'
         );
$$;
revoke all on function private.mfa_satisfied() from public, anon, authenticated;
grant execute on function private.mfa_satisfied() to authenticated;

-- Generic updated_at trigger (D12/D17), reusable by app tables.
create function public.set_updated_at()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.set_updated_at() from public, anon, authenticated;
