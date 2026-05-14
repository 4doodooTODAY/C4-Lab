-- ─── Messages System ─────────────────────────────────────────────────────────
-- Run in: Supabase → SQL Editor → New query → paste all → Run

-- 1. Conversations (group chats or 1-on-1 DMs)
create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  is_group   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Who's in each conversation
create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id      uuid not null references profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- 3. Messages
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references profiles(id) on delete set null,
  content         text not null,
  created_at      timestamptz not null default now()
);

-- 4. Enable RLS
alter table conversations        enable row level security;
alter table conversation_members enable row level security;
alter table messages             enable row level security;

-- 5. Conversations policies
create policy "members see own convos"
  on conversations for select
  using (exists (
    select 1 from conversation_members cm
    where cm.conversation_id = conversations.id and cm.profile_id = auth.uid()
  ));
create policy "authenticated can create convos"
  on conversations for insert with check (auth.uid() is not null);

-- 6. Conversation members policies
create policy "see co-members"
  on conversation_members for select
  using (exists (
    select 1 from conversation_members cm2
    where cm2.conversation_id = conversation_members.conversation_id
      and cm2.profile_id = auth.uid()
  ));
create policy "authenticated can add members"
  on conversation_members for insert with check (auth.uid() is not null);

-- 7. Messages policies
create policy "members read messages"
  on messages for select
  using (exists (
    select 1 from conversation_members cm
    where cm.conversation_id = messages.conversation_id and cm.profile_id = auth.uid()
  ));
create policy "members send messages"
  on messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.profile_id = auth.uid()
    )
  );

-- 8. RPC: create or return existing DM between two users
create or replace function create_or_get_dm(other_profile_id uuid)
returns uuid language plpgsql security definer as $$
declare conv_id uuid;
begin
  select c.id into conv_id
  from conversations c
  join conversation_members cm1 on cm1.conversation_id = c.id and cm1.profile_id = auth.uid()
  join conversation_members cm2 on cm2.conversation_id = c.id and cm2.profile_id = other_profile_id
  where c.is_group = false limit 1;

  if conv_id is not null then return conv_id; end if;

  insert into conversations (is_group) values (false) returning id into conv_id;
  insert into conversation_members (conversation_id, profile_id) values (conv_id, auth.uid());
  insert into conversation_members (conversation_id, profile_id) values (conv_id, other_profile_id);
  return conv_id;
end; $$;

-- 9. Seed the Team group chat with all existing users
do $$ declare team_id uuid;
begin
  if not exists (select 1 from conversations where name = 'Team' and is_group = true) then
    insert into conversations (name, is_group) values ('Team', true) returning id into team_id;
    insert into conversation_members (conversation_id, profile_id)
      select team_id, id from profiles on conflict do nothing;
  end if;
end; $$;

-- 10. Trigger: auto-add new users to Team chat
create or replace function fn_add_to_team_chat()
returns trigger language plpgsql security definer as $$
declare team_id uuid;
begin
  select id into team_id from conversations where name = 'Team' and is_group = true limit 1;
  if team_id is not null then
    insert into conversation_members (conversation_id, profile_id)
    values (team_id, new.id) on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists tr_add_to_team_chat on profiles;
create trigger tr_add_to_team_chat
  after insert on profiles for each row execute procedure fn_add_to_team_chat();

-- 11. Enable Realtime so messages push instantly
alter publication supabase_realtime add table messages;
