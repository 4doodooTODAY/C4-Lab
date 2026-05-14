-- Projects feature migration
-- Run this in the Supabase SQL editor

-- ── projects table ─────────────────────────────────────────────────────────────
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text check (type in ('photography','videography','editing','full_production','social_media')),
  client_id      uuid references clients(id) on delete set null,
  status         text not null default 'active' check (status in ('active','on_hold','completed','archived')),
  stage          text not null default 'briefing' check (stage in ('briefing','pre_production','production','post_production','review','revisions','delivered')),
  start_date     date,
  due_date       date,
  budget         numeric,
  paid_amount    numeric not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','deposit_paid','paid')),
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

-- ── project_members table ──────────────────────────────────────────────────────
create table if not exists project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text check (role in ('lead','photographer','videographer','editor','assistant')),
  unique (project_id, profile_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table projects      enable row level security;
alter table project_members enable row level security;

-- projects: admins/creatives can select all
create policy "admins and creatives select projects"
  on projects for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin','creative')
    )
  );

-- projects: clients can select projects linked to their client record
create policy "clients select own projects"
  on projects for select
  using (
    client_id in (
      select id from clients where profile_id = auth.uid()
    )
  );

-- projects: admins can insert
create policy "admins insert projects"
  on projects for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- projects: admins can update
create policy "admins update projects"
  on projects for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- projects: admins can delete
create policy "admins delete projects"
  on projects for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- project_members: admins/creatives can select all
create policy "admins and creatives select project_members"
  on project_members for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin','creative')
    )
  );

-- project_members: admins can insert
create policy "admins insert project_members"
  on project_members for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- project_members: admins can delete
create policy "admins delete project_members"
  on project_members for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ── Realtime ──────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table projects;
