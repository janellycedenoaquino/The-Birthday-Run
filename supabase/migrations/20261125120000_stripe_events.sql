-- F-8 Stripe payments (FR-37, NFR-8, D8). stripe_events records each handled webhook event ID,
-- so a repeated delivery syncs once (the claim), and is pruned after 30 days (A-20). No user
-- data and no policies: only the webhook (service_role) reads or writes it. Production has
-- auto-grant off, so service_role's grants are explicit.

create table public.stripe_events (
  id          text primary key,                 -- Stripe event ID
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;      -- no policies: deny all
revoke all on table public.stripe_events from public, anon, authenticated, service_role;
grant select, insert, delete on table public.stripe_events to service_role;
create index stripe_events_received_at_idx on public.stripe_events (received_at);
