-- Make notification email + push actually go out.
--
-- 20260820000003 wired an insert trigger to send-notification, but it needed
-- the service role key from Vault, and that secret was never created. The
-- trigger has silently no-opped ever since: zero emails, zero push.
--
-- New contract, no secret needed: the trigger sends only the notification
-- id. send-notification reads the row back with its own service role
-- access and claims it once via delivered_at, within minutes of creation.
-- Callers cannot choose recipient, subject, or content.

alter table notifications add column if not exists delivered_at timestamptz;

-- Existing rows are history. Never deliver them now.
update notifications set delivered_at = created_at where delivered_at is null;

create or replace function public.trigger_send_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://kvwyhohsaucnjsqhvjvs.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('id', new.id)
  );
  return new;
exception when others then
  -- Delivery is best effort. Never block the in-app notification.
  return new;
end;
$$;

drop trigger if exists notifications_send_push on notifications;
create trigger notifications_send_push
  after insert on notifications
  for each row execute function public.trigger_send_notification();

-- Inserting was open to any signed-in user with any actor. Now that a row
-- becomes an email from our domain, a notification has to come from the
-- person creating it. Edge functions use the service role and are unaffected.
drop policy if exists "System can insert notifications" on notifications;
create policy "users notify as themselves" on notifications
  for insert to authenticated
  with check (actor_id = auth.uid());
