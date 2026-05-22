-- ============================================================
-- RLS: Scope all project data to assigned clients
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- HELPER: is the current user an admin?
-- ─────────────────────────────────────────────────────────────
-- We use a small inline subquery everywhere so there is no
-- dependency on a custom function that might not exist yet.


-- ─────────────────────────────────────────────────────────────
-- 1. PROJECTS
-- ─────────────────────────────────────────────────────────────
alter table projects enable row level security;

-- drop any old policies that might conflict
drop policy if exists "Admins full access on projects"          on projects;
drop policy if exists "Creatives see assigned client projects"  on projects;
drop policy if exists "Editors see assigned client projects"    on projects;
drop policy if exists "Clients see own projects"                on projects;
drop policy if exists "Team see assigned client projects"       on projects;
drop policy if exists "projects_select_policy"                  on projects;
drop policy if exists "Allow authenticated read"                on projects;
drop policy if exists "Enable read access for all users"        on projects;

-- Admins: full CRUD
create policy "Admins full access on projects"
on projects for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

-- Creatives & Editors: only see projects whose client they are assigned to
create policy "Team see assigned client projects"
on projects for select
using (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = projects.client_id
  )
);

-- Clients: only see their own projects
create policy "Clients see own projects"
on projects for select
using (
  exists (
    select 1 from clients
    where clients.id         = projects.client_id
    and   clients.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 2. PROJECT_REVISIONS
-- ─────────────────────────────────────────────────────────────
alter table project_revisions enable row level security;

drop policy if exists "Admins full access on project_revisions"         on project_revisions;
drop policy if exists "Team see revisions for assigned clients"          on project_revisions;
drop policy if exists "Clients see revisions for own projects"           on project_revisions;
drop policy if exists "Enable read access for all users"                 on project_revisions;

create policy "Admins full access on project_revisions"
on project_revisions for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Team see revisions for assigned clients"
on project_revisions for select
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id            = project_revisions.project_id
    and   cc.profile_id   = auth.uid()
  )
);

-- Allow team to insert/update revisions on their assigned projects
create policy "Team insert revisions for assigned clients"
on project_revisions for insert
with check (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_revisions.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team update revisions for assigned clients"
on project_revisions for update
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_revisions.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Clients see revisions for own projects"
on project_revisions for select
using (
  exists (
    select 1 from projects p
    join clients c on c.id = p.client_id
    where p.id        = project_revisions.project_id
    and   c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 3. PROJECT_SHOOTS
-- ─────────────────────────────────────────────────────────────
alter table project_shoots enable row level security;

drop policy if exists "Admins full access on project_shoots"       on project_shoots;
drop policy if exists "Team see shoots for assigned clients"        on project_shoots;
drop policy if exists "Team manage shoots for assigned clients"     on project_shoots;
drop policy if exists "Clients see shoots for own projects"         on project_shoots;
drop policy if exists "project_shoots_client_select"               on project_shoots;
drop policy if exists "Enable read access for all users"           on project_shoots;

create policy "Admins full access on project_shoots"
on project_shoots for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Team see shoots for assigned clients"
on project_shoots for select
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_shoots.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team manage shoots for assigned clients"
on project_shoots for insert with check (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_shoots.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team update shoots for assigned clients"
on project_shoots for update
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_shoots.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team delete shoots for assigned clients"
on project_shoots for delete
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id          = project_shoots.project_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Clients see shoots for own projects"
on project_shoots for select
using (
  exists (
    select 1 from projects p
    join clients c on c.id = p.client_id
    where p.id         = project_shoots.project_id
    and   c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 4. SHOOTS (legacy table)
-- ─────────────────────────────────────────────────────────────
alter table shoots enable row level security;

drop policy if exists "Admins full access on shoots"       on shoots;
drop policy if exists "Team see shoots for assigned clients" on shoots;
drop policy if exists "Clients see own shoots"              on shoots;
drop policy if exists "Enable read access for all users"    on shoots;

create policy "Admins full access on shoots"
on shoots for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Team see shoots for assigned clients"
on shoots for select
using (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = shoots.client_id
  )
);

create policy "Team manage shoots for assigned clients"
on shoots for insert with check (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = shoots.client_id
  )
);

create policy "Team update shoots for assigned clients"
on shoots for update
using (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = shoots.client_id
  )
);

create policy "Clients see own shoots"
on shoots for select
using (
  exists (
    select 1 from clients
    where clients.id         = shoots.client_id
    and   clients.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 5. REVISION_COMMENTS (video review timeline comments)
-- ─────────────────────────────────────────────────────────────
alter table revision_comments enable row level security;

drop policy if exists "Admins full access on revision_comments"   on revision_comments;
drop policy if exists "Team see comments for assigned clients"     on revision_comments;
drop policy if exists "Team manage comments for assigned clients"  on revision_comments;
drop policy if exists "Clients see comments for own projects"      on revision_comments;
drop policy if exists "Enable read access for all users"          on revision_comments;

create policy "Admins full access on revision_comments"
on revision_comments for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Team see comments for assigned clients"
on revision_comments for select
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join client_creatives cc on cc.client_id = p.client_id
    where pr.id         = revision_comments.revision_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team manage comments for assigned clients"
on revision_comments for insert with check (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join client_creatives cc on cc.client_id = p.client_id
    where pr.id         = revision_comments.revision_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Team update comments for assigned clients"
on revision_comments for update
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join client_creatives cc on cc.client_id = p.client_id
    where pr.id         = revision_comments.revision_id
    and   cc.profile_id = auth.uid()
  )
);

create policy "Clients see comments for own projects"
on revision_comments for select
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join clients c on c.id = p.client_id
    where pr.id        = revision_comments.revision_id
    and   c.profile_id = auth.uid()
  )
);

create policy "Clients manage own comments"
on revision_comments for insert with check (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join clients c on c.id = p.client_id
    where pr.id        = revision_comments.revision_id
    and   c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────
-- After running this, verify in Supabase:
--   Authentication → Policies → each table above should show
--   "RLS enabled" and the policies listed.
-- ─────────────────────────────────────────────────────────────
