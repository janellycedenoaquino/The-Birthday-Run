-- Migration 2 (BUILD F-1, DESIGN §3): public.profiles, its RLS, triggers and functions (FR-11, FR-30, D10, D24.1).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text check (char_length(display_name) between 1 and 80),
  welcome_email_sent_at timestamptz,
  password_set_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated;   -- undo Supabase default grants
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- D8: every user-data table carries this restrictive policy.
create policy profiles_mfa_required on public.profiles
  as restrictive for all to authenticated
  using ((select private.mfa_satisfied()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- FR-11: exactly one row per new auth user. The name is taken only from Google metadata
-- (email sign-ups could set full_name themselves through the API).
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'google'
         then nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 80), '')
    end
  );
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- FR-30: atomic at-most-once claim for the caller; also requires a confirmed email.
create function public.claim_welcome_email()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles p
     set welcome_email_sent_at = now()
   where p.id = (select auth.uid())
     and p.welcome_email_sent_at is null
     and exists (select 1 from auth.users u
                  where u.id = p.id and u.email_confirmed_at is not null);
  return found;
end $$;
revoke all on function public.claim_welcome_email() from public, anon;
grant execute on function public.claim_welcome_email() to authenticated;

-- FR-30 retry (D24.11): service_role only. The server passes the id from getUser(), never from input.
create function public.release_welcome_email(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set welcome_email_sent_at = null where id = p_user_id;
end $$;
revoke all on function public.release_welcome_email(uuid) from public, anon, authenticated;
grant execute on function public.release_welcome_email(uuid) to service_role;

-- D10 / D24.1: records a password only if auth.users really holds a password hash; keeps the first time.
create function public.mark_password_set()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles p
     set password_set_at = coalesce(p.password_set_at, now())
   where p.id = (select auth.uid())
     and exists (select 1 from auth.users u
                  where u.id = p.id and coalesce(u.encrypted_password, '') <> '');
  return found;
end $$;
revoke all on function public.mark_password_set() from public, anon;
grant execute on function public.mark_password_set() to authenticated;
