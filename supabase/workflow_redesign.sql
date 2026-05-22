-- ── C4 Lab Workflow Redesign Migration ───────────────────────────────────────
-- Replaces the "concept → project" two-step system with a unified project
-- model where a project starts in a 'pitch' stage and flows through the
-- full production → photographer review → client review cycle.

-- ── 1. projects.stage: add 'pitch' ────────────────────────────────────────────
alter table projects drop constraint if exists projects_stage_check;
alter table projects add constraint projects_stage_check
  check (stage in (
    'pitch',           -- created, awaiting admin/client approval
    'briefing',        -- legacy compat
    'pre_production',  -- approved; shoot being arranged
    'production',      -- shoot day / photographer uploading footage
    'post_production', -- editor editing
    'review',          -- revision cycle active
    'revisions',       -- legacy compat
    'ready_to_post',   -- client approved; admin posts
    'delivered'        -- complete
  ));

-- ── 2. project_revisions.status: add photographer review step ─────────────────
alter table project_revisions drop constraint if exists project_revisions_status_check;
alter table project_revisions add constraint project_revisions_status_check
  check (status in (
    'pending_photographer_review', -- editor uploaded; photographer reviews first
    'pending_creative_review',     -- legacy compat (treated as photographer review)
    'pending_client_review',       -- photographer done; client reviewing
    'pending_editor',              -- client sent feedback; editor revising
    'approved'                     -- client approved
  ));

-- ── 3. Pitch approval tracking on projects ─────────────────────────────────────
alter table projects
  add column if not exists pitch_approved_by uuid references profiles(id) on delete set null,
  add column if not exists pitch_approved_at  timestamptz,
  add column if not exists pitch_notes        text;  -- admin/client notes on the pitch

-- ── 4. Photographer notes on project_shoots after a shoot ─────────────────────
alter table project_shoots
  add column if not exists photographer_notes text,
  add column if not exists notes_submitted    boolean not null default false;

-- ── 5. RLS: allow creatives to INSERT projects (they can create pitches) ───────
-- Drop conflicting policy if it exists, then recreate broader one
drop policy if exists "admins insert projects" on projects;
create policy "team can create projects"
  on projects for insert
  to authenticated
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'creative'))
  );

-- Creatives can update projects they are assigned to
drop policy if exists "admins update projects" on projects;
create policy "team update projects"
  on projects for update
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    or creative_id = auth.uid()
    or editor_id   = auth.uid()
  );

-- Admins only delete
drop policy if exists "admins delete projects" on projects;
create policy "admins delete projects"
  on projects for delete
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Clients can update pitch stage (approve/request changes)
create policy "clients approve pitches"
  on projects for update
  to authenticated
  using (
    exists (
      select 1 from clients c
      where c.id = projects.client_id
        and c.profile_id = auth.uid()
    )
    and stage = 'pitch'
  );

-- ── 6. Notifications: new types for the redesigned workflow ───────────────────
-- No schema change needed — notifications.type is free-form text.
-- New types used in application code:
--   pitch_submitted       → admin/client notified when pitch created
--   pitch_approved        → creative notified when pitch approved
--   footage_uploaded      → editor notified when photographer submits footage
--   revision_uploaded     → photographer + admin notified when editor uploads
--   photographer_reviewed → client notified when photographer submits review
--   client_feedback_sent  → editor notified when client sends feedback
--   revision_approved     → editor + admin notified when client approves (existing)
