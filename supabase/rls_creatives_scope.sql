-- ============================================================
-- RLS: Only admins and the assigned editor can see a project.
-- Clients can see their own projects.
-- Run this entire file in Supabase SQL Editor.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. PROJECTS
-- ─────────────────────────────────────────────────────────────
alter table projects enable row level security;

drop policy if exists "Admins full access on projects"          on projects;
drop policy if exists "Editors see own projects"                on projects;
drop policy if exists "Team see assigned client projects"       on projects;
drop policy if exists "Creatives see assigned client projects"  on projects;
drop policy if exists "Editors see assigned client projects"    on projects;
drop policy if exists "Clients see own projects"                on projects;
drop policy if exists "projects_select_policy"                  on projects;
drop policy if exists "Allow authenticated read"                on projects;
drop policy if exists "Enable read access for all users"        on projects;

-- Admins: full CRUD
create policy "Admins full access on projects"
on projects for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- Creatives and Editors: see projects for clients they are assigned to
create policy "Team see projects for assigned clients"
on projects for select
using (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = projects.client_id
  )
);

-- Clients: only their own projects
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

drop policy if exists "Admins full access on project_revisions"          on project_revisions;
drop policy if exists "Editors see revisions for own projects"           on project_revisions;
drop policy if exists "Editors insert revisions for own projects"        on project_revisions;
drop policy if exists "Editors update revisions for own projects"        on project_revisions;
drop policy if exists "Team see revisions for assigned clients"          on project_revisions;
drop policy if exists "Team see revisions for own projects"              on project_revisions;
drop policy if exists "Team insert revisions for assigned clients"       on project_revisions;
drop policy if exists "Team update revisions for assigned clients"       on project_revisions;
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

-- Creatives & editors can see revisions for projects on their assigned clients
create policy "Team see revisions for own projects"
on project_revisions for select
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_revisions.project_id and cc.profile_id = auth.uid()
  )
);

-- Only the assigned editor can write/update revisions (they do the cuts)
create policy "Editors insert revisions for own projects"
on project_revisions for insert
with check (
  exists (
    select 1 from projects p
    where p.id = project_revisions.project_id and p.editor_id = auth.uid()
  )
);

create policy "Editors update revisions for own projects"
on project_revisions for update
using (
  exists (
    select 1 from projects p
    where p.id = project_revisions.project_id and p.editor_id = auth.uid()
  )
);

create policy "Clients see revisions for own projects"
on project_revisions for select
using (
  exists (
    select 1 from projects p
    join clients c on c.id = p.client_id
    where p.id = project_revisions.project_id and c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 3. PROJECT_SHOOTS
-- (creatives are assigned to shoots via client_creatives, not projects)
-- ─────────────────────────────────────────────────────────────
alter table project_shoots enable row level security;

drop policy if exists "Admins full access on project_shoots"       on project_shoots;
drop policy if exists "Editors see shoots for own projects"        on project_shoots;
drop policy if exists "Team see shoots for own projects"           on project_shoots;
drop policy if exists "Editors manage shoots for own projects"     on project_shoots;
drop policy if exists "Editors update shoots for own projects"     on project_shoots;
drop policy if exists "Editors delete shoots for own projects"     on project_shoots;
drop policy if exists "Creatives see shoots for assigned clients"  on project_shoots;
drop policy if exists "Team see shoots for assigned clients"       on project_shoots;
drop policy if exists "Team manage shoots for assigned clients"    on project_shoots;
drop policy if exists "Team update shoots for assigned clients"    on project_shoots;
drop policy if exists "Team delete shoots for assigned clients"    on project_shoots;
drop policy if exists "Clients see shoots for own projects"        on project_shoots;
drop policy if exists "project_shoots_client_select"              on project_shoots;
drop policy if exists "Enable read access for all users"          on project_shoots;

create policy "Admins full access on project_shoots"
on project_shoots for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- Creatives and editors can see/manage shoots for their assigned clients
create policy "Team see shoots for own projects"
on project_shoots for select
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_shoots.project_id and cc.profile_id = auth.uid()
  )
);

create policy "Editors manage shoots for own projects"
on project_shoots for insert with check (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_shoots.project_id and cc.profile_id = auth.uid()
  )
);

create policy "Editors update shoots for own projects"
on project_shoots for update
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_shoots.project_id and cc.profile_id = auth.uid()
  )
);

create policy "Editors delete shoots for own projects"
on project_shoots for delete
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_shoots.project_id and cc.profile_id = auth.uid()
  )
);

-- Creatives can see shoots for clients they are assigned to (redundant with above but explicit)
create policy "Creatives see shoots for assigned clients"
on project_shoots for select
using (
  exists (
    select 1 from projects p
    join client_creatives cc on cc.client_id = p.client_id
    where p.id = project_shoots.project_id and cc.profile_id = auth.uid()
  )
);

-- Clients can see shoots on their own projects
create policy "Clients see shoots for own projects"
on project_shoots for select
using (
  exists (
    select 1 from projects p
    join clients c on c.id = p.client_id
    where p.id = project_shoots.project_id and c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- 4. SHOOTS (legacy table — still used for creative shoot cards)
-- ─────────────────────────────────────────────────────────────
alter table shoots enable row level security;

drop policy if exists "Admins full access on shoots"             on shoots;
drop policy if exists "Creatives see shoots for assigned clients" on shoots;
drop policy if exists "Team see shoots for assigned clients"     on shoots;
drop policy if exists "Team manage shoots for assigned clients"  on shoots;
drop policy if exists "Team update shoots for assigned clients"  on shoots;
drop policy if exists "Clients see own shoots"                   on shoots;
drop policy if exists "Enable read access for all users"         on shoots;

create policy "Admins full access on shoots"
on shoots for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

-- Creatives see shoots for clients they are assigned to
create policy "Creatives see shoots for assigned clients"
on shoots for select
using (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = shoots.client_id
  )
);

create policy "Creatives manage shoots for assigned clients"
on shoots for insert with check (
  exists (
    select 1 from client_creatives
    where client_creatives.profile_id = auth.uid()
    and   client_creatives.client_id  = shoots.client_id
  )
);

create policy "Creatives update shoots for assigned clients"
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
-- 5. REVISION_COMMENTS
-- ─────────────────────────────────────────────────────────────
alter table revision_comments enable row level security;

drop policy if exists "Admins full access on revision_comments"   on revision_comments;
drop policy if exists "Editors see comments for own projects"     on revision_comments;
drop policy if exists "Editors manage comments for own projects"  on revision_comments;
drop policy if exists "Editors update comments for own projects"  on revision_comments;
drop policy if exists "Team see comments for assigned clients"    on revision_comments;
drop policy if exists "Team manage comments for assigned clients" on revision_comments;
drop policy if exists "Team update comments for assigned clients" on revision_comments;
drop policy if exists "Clients see comments for own projects"     on revision_comments;
drop policy if exists "Clients manage own comments"              on revision_comments;
drop policy if exists "Enable read access for all users"         on revision_comments;

create policy "Admins full access on revision_comments"
on revision_comments for all
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  )
);

create policy "Editors see comments for own projects"
on revision_comments for select
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id and p.editor_id = auth.uid()
  )
);

create policy "Editors manage comments for own projects"
on revision_comments for insert with check (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id and p.editor_id = auth.uid()
  )
);

create policy "Editors update comments for own projects"
on revision_comments for update
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id and p.editor_id = auth.uid()
  )
);

create policy "Clients see comments for own projects"
on revision_comments for select
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join clients c on c.id = p.client_id
    where pr.id = revision_comments.revision_id and c.profile_id = auth.uid()
  )
);

create policy "Clients manage own comments"
on revision_comments for insert with check (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    join clients c on c.id = p.client_id
    where pr.id = revision_comments.revision_id and c.profile_id = auth.uid()
  )
);


-- ─────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────
