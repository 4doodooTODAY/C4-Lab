-- Wires desktop push + email delivery, which currently doesn't fire at all:
-- `notify()` only inserts into `notifications`. The send-notification edge
-- function that actually sends the web push / Resend email exists and is
-- deployed, but nothing has ever called it — no trigger, no webhook. This
-- adds that trigger.
--
-- The edge function requires the real service-role key as a bearer token
-- (deliberately, per its own comment — an unauthenticated version of this
-- was a phishing vector). That key can't live in a migration file that gets
-- committed to git, so it's read from Supabase Vault at call time instead.
--
-- ONE-TIME MANUAL STEP before this trigger will work (not done by this
-- migration, and not something to automate — it's a secret):
--   select vault.create_secret('<the service_role key>', 'service_role_key');
-- Run that once in the SQL editor (or via `supabase secrets`), then this
-- migration can be applied. Until then the trigger below no-ops safely
-- (net.http_post simply won't fire a useful request without the header, and
-- the edge function will reject it with 403 rather than silently succeeding).

create extension if not exists pg_net;

create or replace function public.trigger_send_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_service_key text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    -- Vault secret not set up yet. Don't block the notification insert —
    -- the in-app bell still works via realtime either way.
    return new;
  end if;

  perform net.http_post(
    url     := 'https://kvwyhohsaucnjsqhvjvs.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists notifications_send_push on notifications;
create trigger notifications_send_push
  after insert on notifications
  for each row execute function public.trigger_send_notification();

-- ── Native (iOS/Android) push readiness ─────────────────────────────────────
-- push_subscriptions was built web-push-only: endpoint/p256dh/auth_key are
-- all NOT NULL, which a native device token can't satisfy. Add a token
-- column for native subscriptions and relax the web-only columns so a row
-- can be one or the other, not always both.
alter table push_subscriptions
  add column if not exists device_token text;

-- Upserts key off this (like the existing web path keys off `endpoint`), so
-- re-registering the same device updates its row instead of duplicating it.
alter table push_subscriptions
  drop constraint if exists push_subscriptions_device_token_key;
alter table push_subscriptions
  add constraint push_subscriptions_device_token_key unique (device_token);

alter table push_subscriptions
  alter column endpoint drop not null,
  alter column p256dh   drop not null,
  alter column auth_key drop not null;

alter table push_subscriptions
  drop constraint if exists push_subscriptions_platform_shape;
alter table push_subscriptions
  add constraint push_subscriptions_platform_shape check (
    (platform = 'web' and endpoint is not null and p256dh is not null and auth_key is not null)
    or
    (platform <> 'web' and device_token is not null)
  );
