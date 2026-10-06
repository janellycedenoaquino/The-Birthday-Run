-- Migration 3 (BUILD F-1, DESIGN §3): private.rate_limits and public.rate_limit_hit (D3, D24.12).
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create table private.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (key, window_start)
);
alter table private.rate_limits enable row level security;
revoke all on table private.rate_limits from public, anon, authenticated;
create index rate_limits_window_start_idx on private.rate_limits (window_start);

-- Returns TRUE when the request is ALLOWED (count after this hit <= p_max), FALSE when over the limit (D24.12).
create function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  if p_key is null or p_max is null or p_window_seconds is null
     or char_length(p_key) not between 1 and 200
     or p_max < 1 or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'rate_limit_hit: invalid arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  delete from private.rate_limits where window_start < now() - interval '24 hours';
  return v_count <= p_max;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
