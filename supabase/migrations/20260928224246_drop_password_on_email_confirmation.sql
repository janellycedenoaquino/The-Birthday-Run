-- Migration 4 (BUILD F-1, D10, T2, decision 0008): closes pre-account takeover through GoTrue's
-- own /auth/v1/signup endpoint, which stays reachable because email sign-ups must stay enabled
-- for D10's signInWithOtp sign-up. A direct caller can create an unconfirmed user for someone
-- else's email with a password they chose; when the owner clicks the genuine confirmation email,
-- that password would survive. This drops it at that moment, so only the verified inbox owner
-- ever sets the password (/auth/set-password, D10). Users confirmed without a confirmation email
-- (admin API with email_confirm) keep theirs.
-- Forward-only: never edit once applied anywhere (NFR-19); fix with a new migration.

create function private.drop_password_on_email_confirmation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and old.confirmation_sent_at is not null then
    new.encrypted_password := '';
  end if;
  return new;
end $$;
revoke all on function private.drop_password_on_email_confirmation() from public, anon, authenticated;

create trigger drop_password_on_email_confirmation
  before update of email_confirmed_at on auth.users
  for each row execute function private.drop_password_on_email_confirmation();
