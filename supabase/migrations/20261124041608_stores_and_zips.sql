-- Migration (BUILD F-9, DESIGN §3 retailer_stores, zip_centroids; D9, D10, D11): US store
-- locations per brand (All The Places + Overture) and ZIP centroids (Census). Neither table is
-- readable by app roles: only the two premium-only definer functions below answer questions
-- about them (D11, DESIGN T-101). Not user data (NON_USER_DATA_TABLES).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create type public.store_source as enum ('atp', 'overture');

create table public.retailer_stores (
  id           bigint generated always as identity primary key,
  retailer_id  text not null references public.retailers (id) on delete cascade,
  source       public.store_source not null,
  source_ref   text not null,
  name         text not null,
  address      text,
  city         text,
  postal_code  text,
  state        char(2),
  location     extensions.geography(Point, 4326) not null,
  imported_at  timestamptz not null default now(),
  unique (source, source_ref)
);
create index retailer_stores_location_gix on public.retailer_stores using gist (location);
create index retailer_stores_retailer_source_idx on public.retailer_stores (retailer_id, source);
alter table public.retailer_stores enable row level security;   -- no policies: functions only
revoke all on table public.retailer_stores from public, anon, authenticated, service_role;
revoke all on sequence public.retailer_stores_id_seq from public, anon, authenticated, service_role;

create table public.zip_centroids (
  zip      char(5) primary key check (zip ~ '^\d{5}$'),
  location extensions.geography(Point, 4326) not null,
  state    char(2) not null
);
create index zip_centroids_location_gix on public.zip_centroids using gist (location);
alter table public.zip_centroids enable row level security;     -- no policies: functions only
revoke all on table public.zip_centroids from public, anon, authenticated, service_role;

-- D11: premium-only store search. FR-31 radius (20 mi), A-15 candidates per brand.
create function public.nearby_stores(p_lat float8, p_lng float8, p_retailer_ids text[], p_per_brand int default 5)
returns table (retailer_id text, store_id bigint, name text, address text, city text,
               state char(2), postal_code text, lat float8, lng float8, distance_m float8)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_start extensions.geography;
begin
  if not private.is_premium((select auth.uid())) then
    raise exception 'not_premium' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or coalesce(cardinality(p_retailer_ids), 0) not between 1 and 250
     or p_per_brand is null or p_per_brand not between 1 and 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_start := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  return query
  select s.retailer_id, s.id, s.name, s.address, s.city, s.state, s.postal_code,
         extensions.st_y(s.location::extensions.geometry), extensions.st_x(s.location::extensions.geometry),
         extensions.st_distance(s.location, v_start)
  from (select distinct unnest(p_retailer_ids)) as r(id)
  cross join lateral (
    select st.* from public.retailer_stores st
    join public.retailers rt on rt.id = st.retailer_id and rt.retired_at is null
    where st.retailer_id = r.id
      and extensions.st_dwithin(st.location, v_start, 32186.88)          -- FR-31: 20 miles
      and not (st.source = 'overture' and exists (                       -- same store from both sources
            select 1 from public.retailer_stores a
            where a.retailer_id = st.retailer_id and a.source = 'atp'
              and extensions.st_dwithin(a.location, st.location, 75)))
    order by st.location operator(extensions.<->) v_start
    limit p_per_brand
  ) s
  order by s.retailer_id, s.location operator(extensions.<->) v_start;
end $$;
revoke all on function public.nearby_stores(float8, float8, text[], int) from public, anon;
grant execute on function public.nearby_stores(float8, float8, text[], int) to authenticated;

-- D10: ZIP → point and state; coordinates → nearest ZIP's state (A-13). Premium only. Neither
-- returns the caller's coordinates back nor stores anything.
create function public.zip_location(p_zip text)
returns table (lat float8, lng float8, state char(2))
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_premium((select auth.uid())) then
    raise exception 'not_premium' using errcode = 'P0001';
  end if;
  return query select extensions.st_y(z.location::extensions.geometry), extensions.st_x(z.location::extensions.geometry), z.state
    from public.zip_centroids z where z.zip = p_zip;
end $$;

create function public.zip_location(p_lat float8, p_lng float8)
returns table (lat float8, lng float8, state char(2))
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_premium((select auth.uid())) then
    raise exception 'not_premium' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query select null::float8, null::float8, z.state from public.zip_centroids z
    order by z.location operator(extensions.<->)
             extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    limit 1;
end $$;
revoke all on function public.zip_location(text), public.zip_location(float8, float8) from public, anon;
grant execute on function public.zip_location(text), public.zip_location(float8, float8) to authenticated;
