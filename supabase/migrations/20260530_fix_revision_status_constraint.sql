-- Fix project_revisions status check constraint
-- The old constraint from projects_v2_migration.sql was missing
-- 'pending_photographer_review' and 'pending_admin_review'.
-- This expands it to match all statuses used in the codebase.

alter table project_revisions drop constraint if exists project_revisions_status_check;

alter table project_revisions add constraint project_revisions_status_check
  check (status in (
    'pending_creative_review',     -- editor uploaded; creative/photographer reviews first
    'pending_photographer_review', -- alias used in workflow_redesign (same as above)
    'pending_admin_review',        -- creative approved; admin reviews before client
    'pending_client_review',       -- approved internally; client reviewing
    'pending_editor',              -- client sent feedback; editor revising
    'approved'                     -- client approved; project delivered
  ));
