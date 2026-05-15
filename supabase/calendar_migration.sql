-- Drop old calendar table if it exists (old schema)
drop table if exists calendar_event_members cascade;
drop table if exists calendar_events cascade;

-- ── Calendar Events ──────────────────────────────────────────────────────────
create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  event_type  text not null default 'in_person'
              check (event_type in ('in_person', 'virtual', 'travel', 'real_estate', 'personal')),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean default true,
  location    text,        -- for in_person / travel
  meeting_url text,        -- for virtual
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── Event Members (who the event involves) ────────────────────────────────────
create table calendar_event_members (
  event_id   uuid not null references calendar_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table calendar_events enable row level security;
alter table calendar_event_members enable row level security;

-- Non-personal events: visible to all authenticated users
-- Personal events: only admin, creator, or assigned member can see
create policy "calendar_events_select" on calendar_events
  for select to authenticated
  using (
    event_type <> 'personal'
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or created_by = auth.uid()
    or exists (
      select 1 from calendar_event_members
      where event_id = calendar_events.id and profile_id = auth.uid()
    )
  );

create policy "calendar_events_insert" on calendar_events
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "calendar_events_update" on calendar_events
  for update to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or created_by = auth.uid()
  );

create policy "calendar_events_delete" on calendar_events
  for delete to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or created_by = auth.uid()
  );

create policy "calendar_event_members_select" on calendar_event_members
  for select to authenticated using (true);

create policy "calendar_event_members_all" on calendar_event_members
  for all to authenticated using (true) with check (true);
