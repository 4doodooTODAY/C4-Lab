-- ─── Messages v2 Migration ────────────────────────────────────────────────────
-- Run in: Supabase → SQL Editor → New query → paste all → Run

-- 1. Add image support to messages
alter table messages add column if not exists image_url text;

-- 2. Add last-message preview to conversations (powers sidebar previews)
alter table conversations
  add column if not exists last_message_at      timestamptz,
  add column if not exists last_message_preview text;

-- 3. Trigger: keep last_message fields up-to-date on every new message
create or replace function update_conv_last_msg()
returns trigger language plpgsql security definer as $$
begin
  update conversations set
    last_message_at      = new.created_at,
    last_message_preview = case
      when new.image_url is not null then '📷 Photo'
      else left(new.content, 100)
    end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_conv_last_msg on messages;
create trigger trg_conv_last_msg
  after insert on messages
  for each row execute function update_conv_last_msg();

-- 4. Backfill: populate last_message fields from existing messages
update conversations c set
  last_message_at      = m.created_at,
  last_message_preview = case
    when m.image_url is not null then '📷 Photo'
    else left(m.content, 100)
  end
from (
  select distinct on (conversation_id)
    conversation_id, created_at, content, image_url
  from messages
  order by conversation_id, created_at desc
) m
where c.id = m.conversation_id;

-- 5. Storage bucket for message images
insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do nothing;

-- Storage RLS
create policy "Authenticated users can upload message images"
  on storage.objects for insert
  with check (bucket_id = 'message-images' and auth.role() = 'authenticated');

create policy "Anyone can view message images"
  on storage.objects for select
  using (bucket_id = 'message-images');

create policy "Users can delete their own message images"
  on storage.objects for delete
  using (bucket_id = 'message-images' and auth.uid()::text = (storage.foldername(name))[1]);
