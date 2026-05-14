-- ─── Pinning + Join Visibility Migration ────────────────────────────────────
-- Run in: Supabase → SQL Editor → New query → paste all → Run

-- 1. Track when each member joined so new members can't see old messages
alter table conversation_members
  add column if not exists joined_at timestamptz not null default now();

-- Set existing members' joined_at to the conversation creation date
-- so they keep seeing all historical messages
update conversation_members cm
set joined_at = c.created_at
from conversations c
where cm.conversation_id = c.id;

-- 2. Let admins rename conversations
create policy "Admins can rename conversations"
  on conversations for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- 3. Pinned messages
create table if not exists pinned_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id      uuid not null references messages(id)      on delete cascade,
  pinned_by       uuid references profiles(id) on delete set null,
  pinned_at       timestamptz not null default now(),
  unique(message_id)
);

alter table pinned_messages enable row level security;

create policy "Members can view pins"
  on pinned_messages for select
  using (exists (
    select 1 from conversation_members
    where conversation_id = pinned_messages.conversation_id and profile_id = auth.uid()
  ));
create policy "Admins can pin"
  on pinned_messages for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "Admins can unpin"
  on pinned_messages for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- 4. Pin requests (non-admins request, admins approve/decline)
create table if not exists pin_requests (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id      uuid not null references messages(id)      on delete cascade,
  requested_by    uuid references profiles(id) on delete set null,
  status          text not null default 'pending', -- pending | approved | declined
  created_at      timestamptz not null default now(),
  unique(message_id) -- one active request per message
);

alter table pin_requests enable row level security;

create policy "Members can view pin requests in their convos"
  on pin_requests for select
  using (exists (
    select 1 from conversation_members
    where conversation_id = pin_requests.conversation_id and profile_id = auth.uid()
  ));
create policy "Members can create pin requests"
  on pin_requests for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from conversation_members
      where conversation_id = pin_requests.conversation_id and profile_id = auth.uid()
    )
  );
create policy "Admins can update pin request status"
  on pin_requests for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- 5. Enable realtime on new tables
alter publication supabase_realtime add table pinned_messages;
alter publication supabase_realtime add table pin_requests;
