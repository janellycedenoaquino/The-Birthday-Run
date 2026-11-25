-- D16 heartbeat: the reminder cron (F-12) records when it last finished, and
-- /api/reports/pending returns that time, so forward-reports.yml can fail when the cron has
-- stopped (Vercel Hobby has no retries and no missed-run alert). One row per job; no user data
-- and no policies: only the server (service_role) reads or writes it.

create table public.job_heartbeats (
  job         text primary key check (job in ('reminders')),
  last_run_at timestamptz not null
);
alter table public.job_heartbeats enable row level security;      -- no policies: deny all
revoke all on table public.job_heartbeats from public, anon, authenticated, service_role;
grant select, insert, update on table public.job_heartbeats to service_role;
