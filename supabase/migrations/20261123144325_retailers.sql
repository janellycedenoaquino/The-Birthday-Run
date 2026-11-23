-- Migration (BUILD F-1, DESIGN §3 public.retailers): the retailer catalogue, its RLS and counts (FR-1, FR-2, D2, D3).
-- Not user data: written only by the import script as the database owner (D2).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create type public.retailer_category as enum ('food_drink', 'entertainment', 'retail', 'beauty');
create type public.timing_type       as enum ('from_birthday', 'birth_month', 'around_birthday');
create type public.reward_type       as enum ('free_item', 'discount', 'bogo', 'points', 'free_with_purchase');
create type public.states_scope      as enum ('all', 'listed', 'unknown');

create table public.retailers (
  id                     text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 64),
  name                   text not null unique check (char_length(name) > 0 and name = btrim(name)),
  category               public.retailer_category not null,
  description            text not null check (char_length(btrim(description)) > 0),
  reward_description     text not null check (char_length(btrim(reward_description)) > 0),
  timing_type            public.timing_type not null,
  days_before            smallint,
  days_after             smallint,
  reward_type            public.reward_type not null,
  requires_purchase      boolean not null,
  purchase_requirement   text,
  membership_requirement text,
  other_requirement      text,
  logo_file              text check (logo_file ~ '^[a-z0-9-]+\.(png|svg)$'),
  website_url            text check (website_url ~ '^https://[^/\s]+'),
  store_finder_url       text check (store_finder_url ~ '^https://[^/\s]+'),
  states_scope           public.states_scope not null,
  state_codes            char(2)[] not null default '{}',
  is_popular             boolean not null default false,
  last_checked_on        date not null,
  source_url             text not null check (source_url ~ '^https://[^/\s]+'),
  retired_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- FR-11's three types; FR-1's length range (A-1: 1–31 days) is the total days the reward lasts.
  -- coalesce: a CHECK that evaluates to NULL passes, so a NULL day count must count as false.
  constraint retailers_timing_columns check (coalesce(
       (timing_type = 'from_birthday'   and days_before is null and days_after between 1 and 31)
    or (timing_type = 'birth_month'     and days_before is null and days_after is null)
    or (timing_type = 'around_birthday' and days_before >= 1 and days_after >= 0
                                        and days_before + days_after + 1 <= 31), false)),
  -- FR-5's three cases; the list of valid codes lives in csv-schema.ts (format checked here).
  constraint retailers_states check (
    (states_scope = 'listed') = (cardinality(state_codes) > 0)
    and array_position(state_codes, null) is null   -- array_to_string skips NULL elements
    and array_to_string(state_codes, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$')
);
create index retailers_category_idx on public.retailers (category);
create index retailers_popular_idx  on public.retailers (id) where is_popular and retired_at is null;
create trigger retailers_set_updated_at before update on public.retailers
  for each row execute function public.set_updated_at();

alter table public.retailers enable row level security;
-- Undo Supabase default grants, service_role's too: only the import (as the owner, postgres) writes (D2, D3).
revoke all on table public.retailers from public, anon, authenticated, service_role;
grant select on table public.retailers to anon, authenticated, service_role;

-- D3: signed-out visitors see popular, non-retired retailers only.
create policy retailers_select_anon on public.retailers
  for select to anon using (is_popular and retired_at is null);
-- Signed in: every row, retired too (History shows retired names).
create policy retailers_select_authenticated on public.retailers
  for select to authenticated using (true);

-- D3: numbers only, for S-103's M-111 prompt (anon can't count non-popular rows itself).
create function public.retailer_counts()
returns table (popular integer, total integer)
language sql stable security definer set search_path = ''
as $$
  select (count(*) filter (where is_popular))::int, count(*)::int
  from public.retailers where retired_at is null;
$$;
revoke all on function public.retailer_counts() from public, anon, authenticated, service_role;
grant execute on function public.retailer_counts() to anon, authenticated;
