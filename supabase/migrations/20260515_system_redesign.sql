-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  C4 Lab — System Redesign Migration                              ║
-- ║  Run this in the Supabase SQL editor                             ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── 1. client_creatives — permanent creative → client assignments ──────────────
create table if not exists client_creatives (
  id         uuid default gen_random_uuid() primary key,
  client_id  uuid not null references clients(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text not null default 'creative',   -- photographer | videographer | editor | creative
  created_at timestamptz default now(),
  unique(client_id, profile_id)
);

alter table client_creatives enable row level security;

drop policy if exists "admins manage client_creatives" on client_creatives;
create policy "admins manage client_creatives" on client_creatives
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists(select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "creatives can view own assignments" on client_creatives;
create policy "creatives can view own assignments" on client_creatives
  for select to authenticated
  using (profile_id = auth.uid());

-- ─── 2. shoots — standalone shoot events per client ────────────────────────────
create table if not exists shoots (
  id                uuid default gen_random_uuid() primary key,
  client_id         uuid not null references clients(id) on delete cascade,
  title             text not null,
  description       text,
  shoot_date        date,
  shoot_time        time,
  location          text,
  status            text default 'scheduled',  -- scheduled | completed | cancelled
  calendar_event_id uuid,                      -- optional link to calendar_events
  created_by        uuid references profiles(id),
  created_at        timestamptz default now()
);

alter table shoots enable row level security;

drop policy if exists "admins manage shoots" on shoots;
create policy "admins manage shoots" on shoots
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists(select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "creatives can view assigned client shoots" on shoots;
create policy "creatives can view assigned client shoots" on shoots
  for select to authenticated
  using (
    exists(
      select 1 from client_creatives cc
      where cc.client_id = shoots.client_id
        and cc.profile_id = auth.uid()
    )
    or exists(select 1 from profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "clients can view own shoots" on shoots;
create policy "clients can view own shoots" on shoots
  for select to authenticated
  using (
    exists(
      select 1 from client_access ca
      where ca.client_id = shoots.client_id
        and ca.profile_id = auth.uid()
    )
  );

-- ─── 3. content_drafts — concept drafts admin creates per client ────────────────
create table if not exists content_drafts (
  id                uuid default gen_random_uuid() primary key,
  client_id         uuid not null references clients(id) on delete cascade,
  shoot_id          uuid references shoots(id),
  type              text,                        -- post | reel | story | carousel | other
  title             text,
  concept           text,
  target_date       date,
  inspiration_links text[],
  status            text default 'pending_client',  -- pending_client | approved | declined | scrapped
  created_by        uuid references profiles(id),
  created_at        timestamptz default now()
);

alter table content_drafts enable row level security;

drop policy if exists "admins manage content_drafts" on content_drafts;
create policy "admins manage content_drafts" on content_drafts
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists(select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "clients can view own drafts" on content_drafts;
create policy "clients can view own drafts" on content_drafts
  for select to authenticated
  using (
    exists(
      select 1 from client_access ca
      where ca.client_id = content_drafts.client_id
        and ca.profile_id = auth.uid()
    )
  );

drop policy if exists "clients can respond to drafts" on content_drafts;
create policy "clients can respond to drafts" on content_drafts
  for update to authenticated
  using (
    exists(
      select 1 from client_access ca
      where ca.client_id = content_drafts.client_id
        and ca.profile_id = auth.uid()
    )
  )
  with check (true);

-- ─── 4. Evolve existing tables ──────────────────────────────────────────────────

-- shoot_uploads: link to a specific shoot
alter table shoot_uploads add column if not exists shoot_id uuid references shoots(id);

-- projects: link to draft / concept info
alter table projects add column if not exists draft_id    uuid references content_drafts(id);
alter table projects add column if not exists concept     text;
alter table projects add column if not exists target_date date;

-- content_requests: add inspiration links and optional target date
alter table content_requests add column if not exists inspiration_links text[];
alter table content_requests add column if not exists target_date       date;

-- ─── 5. Additional columns ──────────────────────────────────────────────────────

-- projects: link to a shoot
alter table projects add column if not exists shoot_id uuid references shoots(id);

-- calendar_events: link to shoots and drafts
alter table calendar_events add column if not exists shoot_id uuid references shoots(id);
alter table calendar_events add column if not exists draft_id uuid references content_drafts(id);
