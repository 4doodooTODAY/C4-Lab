-- Guarantee that admins and editors can INSERT project_revisions.
--
-- The INSERT policy has never existed in the migrations folder — it only lived
-- in rls_creatives_scope.sql and projects_v2_migration.sql, which are standalone
-- files that may or may not have been applied in production. Without it, any
-- admin or editor trying to upload a first cut gets an RLS error.
--
-- The editor check covers both the single-editor column (projects.editor_id) and
-- the multi-editor junction table (project_editors), matching how the app
-- identifies editors throughout ProjectWorkflow.jsx.

-- ── 1. Admin: full access (SELECT + INSERT + UPDATE + DELETE) ─────────────────
-- Drop both the old name (from projects_v2_migration) and the rls_creatives_scope
-- name, then recreate cleanly.
drop policy if exists "Admins can do everything on project_revisions" on project_revisions;

drop policy if exists "Admins full access on project_revisions"       on project_revisions;

create policy "Admins full access on project_revisions"
on project_revisions
for all
to authenticated
using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ── 2. Editors: INSERT for their assigned projects ────────────────────────────
-- Matches the isEditor check in ProjectWorkflow.jsx:
--   profile.role = 'editor'  OR  project_editors junction  OR  projects.editor_id
drop policy if exists "Editors can insert revisions"            on project_revisions;

drop policy if exists "Editors insert revisions for own projects" on project_revisions;

create policy "Editors insert revisions for own projects"
on project_revisions
for insert
to authenticated
with check (
  -- direct editor role anywhere
  (select role from profiles where id = auth.uid()) = 'editor'
  or
  -- assigned via the projects.editor_id column
  exists (
    select 1 from projects p
    where p.id = project_revisions.project_id
      and p.editor_id = auth.uid()
  )
  or
  -- assigned via the project_editors junction table
  exists (
    select 1 from project_editors pe
    where pe.project_id = project_revisions.project_id
      and pe.profile_id = auth.uid()
  )
);

-- ── 3. Editors: UPDATE for their assigned projects ────────────────────────────
-- Kept in sync with the INSERT policy above.
drop policy if exists "Editors update revisions for own projects" on project_revisions;

create policy "Editors update revisions for own projects"
on project_revisions
for update
to authenticated
using (
  (select role from profiles where id = auth.uid()) = 'editor'
  or
  exists (
    select 1 from projects p
    where p.id = project_revisions.project_id
      and p.editor_id = auth.uid()
  )
  or
  exists (
    select 1 from project_editors pe
    where pe.project_id = project_revisions.project_id
      and pe.profile_id = auth.uid()
  )
)
with check (
  (select role from profiles where id = auth.uid()) = 'editor'
  or
  exists (
    select 1 from projects p
    where p.id = project_revisions.project_id
      and p.editor_id = auth.uid()
  )
  or
  exists (
    select 1 from project_editors pe
    where pe.project_id = project_revisions.project_id
      and pe.profile_id = auth.uid()
  )
);
