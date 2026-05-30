-- ============================================================
-- Calendar Visibility Fix
-- Run this in Supabase SQL Editor.
-- Fixes who can see shoots and project due dates on the calendar.
-- ============================================================


-- ── SHOOTS ───────────────────────────────────────────────────
alter table shoots enable row level security;

-- Drop every known shoots policy name (safe if they don't exist)
drop policy if exists "Admins full access on shoots"                 on shoots;
drop policy if exists "Creatives see shoots for assigned clients"    on shoots;
drop policy if exists "Creatives manage shoots for assigned clients" on shoots;
drop policy if exists "Creatives update shoots for assigned clients" on shoots;
drop policy if exists "Team see shoots for assigned clients"         on shoots;
drop policy if exists "Team manage shoots for assigned clients"      on shoots;
drop policy if exists "Team update shoots for assigned clients"      on shoots;
drop policy if exists "Clients see own shoots"                       on shoots;
drop policy if exists "Enable read access for all users"             on shoots;
drop policy if exists "shoots_select"                                on shoots;
drop policy if exists "Admins see all shoots"                        on shoots;
drop policy if exists "Creatives see assigned shoots"                on shoots;
drop policy if exists "Clients see their shoots"                     on shoots;
drop policy if exists "Photographer sees own shoots"                 on shoots;
drop policy if exists "Photographer updates own shoots"              on shoots;

-- Admins: full access to all shoots
create policy "Admins full access on shoots"
  on shoots for all
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Assigned photographer/creative: see and update their own shoots
create policy "Photographer sees own shoots"
  on shoots for select
  using (photographer_id = auth.uid());

create policy "Photographer updates own shoots"
  on shoots for update
  using (photographer_id = auth.uid());

-- Client: see shoots for their client record
create policy "Clients see own shoots"
  on shoots for select
  using (
    exists (
      select 1 from clients
      where clients.id = shoots.client_id
        and clients.profile_id = auth.uid()
    )
  );


-- ── PROJECTS (ensure creatives can read for calendar due dates) ───────────
-- The existing RLS from projects_migration.sql allows admins+creatives
-- to select all projects. This policy may already exist — we drop+recreate
-- to be certain it's correctly in place.

alter table projects enable row level security;

drop policy if exists "admins and creatives select projects" on projects;
drop policy if exists "Admins full access on projects"       on projects;

-- Admins: full access
create policy "Admins full access on projects"
  on projects for all
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Creatives & editors: can read projects for their assigned clients
-- (client_creatives links creatives to clients)
drop policy if exists "Team see projects for assigned clients"  on projects;
drop policy if exists "Team see assigned client projects"       on projects;

create policy "Team see projects for assigned clients"
  on projects for select
  using (
    -- directly assigned on the project
    editor_id = auth.uid()
    or creative_id = auth.uid()
    -- or assigned to this client via client_creatives
    or exists (
      select 1 from client_creatives
      where client_creatives.profile_id = auth.uid()
        and client_creatives.client_id  = projects.client_id
    )
  );

-- Clients: see their own projects
drop policy if exists "clients select own projects"  on projects;
drop policy if exists "Clients see own projects"     on projects;

create policy "Clients see own projects"
  on projects for select
  using (
    exists (
      select 1 from clients
      where clients.id = projects.client_id
        and clients.profile_id = auth.uid()
    )
  );

-- Keep write policies for admins (insert/update/delete)
drop policy if exists "admins insert projects" on projects;
drop policy if exists "admins update projects" on projects;
drop policy if exists "admins delete projects" on projects;

create policy "admins insert projects"
  on projects for insert
  with check (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "admins update projects"
  on projects for update
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "admins delete projects"
  on projects for delete
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
