-- ============================================================
-- 1. Pitch approval columns
-- MyProjects.jsx (client PitchPanel) writes these on approve / request-changes,
-- but they were never added to the projects table — so the client's
-- "Approve & Start" update silently errored and the stage never advanced.
-- ============================================================
alter table projects
  add column if not exists pitch_approved_by uuid references profiles(id) on delete set null,
  add column if not exists pitch_approved_at timestamptz,
  add column if not exists pitch_notes       text;

-- ============================================================
-- 2. Revision visibility safety net
-- Admins (full access) and creatives (manage-all) already see revisions.
-- This adds directly-assigned team members (creative_id / editor_id on the
-- project) so videographers/editors can always view revisions for their own
-- projects, even if they aren't listed in client_creatives.
-- ============================================================
drop policy if exists "Assigned team can view project revisions" on project_revisions;
create policy "Assigned team can view project revisions"
  on project_revisions
  for select
  to authenticated
  using (
    exists (
      select 1 from projects p
      where p.id = project_revisions.project_id
        and (p.creative_id = auth.uid() or p.editor_id = auth.uid())
    )
  );
