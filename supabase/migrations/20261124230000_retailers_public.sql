-- Decision 0017 (FR-2 changed): signed-out visitors see every non-retired retailer, so the whole
-- checked catalogue can be found by search engines. Joining, plans and reminders stay signed in.
-- The rows are public anyway: data/retailers.csv is in the public repo.
drop policy retailers_select_anon on public.retailers;
create policy retailers_select_anon on public.retailers
  for select to anon using (retired_at is null);
