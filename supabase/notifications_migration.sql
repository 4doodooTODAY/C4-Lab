-- ─── Notifications System Migration ──────────────────────────────────────────

-- 1. Notifications table
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  type       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "Users view own notifications"
  on notifications for select using (profile_id = auth.uid());

create policy "Users update own notifications"
  on notifications for update using (profile_id = auth.uid());

create policy "System can insert notifications"
  on notifications for insert with check (true);

-- 2. Push subscriptions table
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "Users manage own push subscriptions"
  on push_subscriptions for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 3. Enable realtime on notifications
alter publication supabase_realtime add table notifications;

-- 4. Trigger: new message → notify all other conversation members
create or replace function fn_notify_new_message()
returns trigger language plpgsql security definer as $$
declare
  sender_name  text;
  conv_is_group boolean;
  conv_name    text;
  notif_title  text;
  notif_body   text;
begin
  select full_name into sender_name from profiles where id = new.sender_id;
  select is_group, name into conv_is_group, conv_name
    from conversations where id = new.conversation_id;

  notif_title := case
    when conv_is_group then coalesce(conv_name, 'Team')
    else sender_name
  end;

  notif_body := case
    when new.image_url is not null then sender_name || ' sent a photo'
    else left(new.content, 100)
  end;

  insert into notifications (profile_id, actor_id, type, title, body, link)
  select cm.profile_id, new.sender_id, 'message', notif_title, notif_body, '/messages'
  from conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.profile_id != new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on messages;
create trigger trg_notify_new_message
  after insert on messages for each row execute function fn_notify_new_message();

-- 5. Trigger: new media → notify admins + creatives
create or replace function fn_notify_new_media()
returns trigger language plpgsql security definer as $$
declare
  uploader_name text;
begin
  select full_name into uploader_name from profiles where id = new.uploaded_by;

  insert into notifications (profile_id, actor_id, type, title, body, link)
  select p.id, new.uploaded_by, 'video_review',
    'New video ready for review',
    coalesce(new.title, 'Untitled') || ' — uploaded by ' || coalesce(uploader_name, 'Someone'),
    '/videos'
  from profiles p
  where p.role in ('admin', 'creative')
    and p.id != new.uploaded_by;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_media on media;
create trigger trg_notify_new_media
  after insert on media for each row execute function fn_notify_new_media();

-- 6. Trigger: new content request → notify admins
create or replace function fn_notify_content_request()
returns trigger language plpgsql security definer as $$
declare
  requester_name text;
begin
  select full_name into requester_name from profiles where id = new.profile_id;

  insert into notifications (profile_id, actor_id, type, title, body, link)
  select p.id, new.profile_id, 'content_request',
    'New content request',
    coalesce(new.title, 'Untitled') || ' from ' || coalesce(requester_name, 'a client'),
    '/admin/inbox'
  from profiles p
  where p.role = 'admin';

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'content_requests'
  ) then
    drop trigger if exists trg_notify_content_request on content_requests;
    execute 'create trigger trg_notify_content_request
      after insert on content_requests for each row
      execute function fn_notify_content_request()';
  end if;
end $$;
