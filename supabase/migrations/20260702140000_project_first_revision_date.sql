-- First revision due date, settable at project creation alongside the post
-- date (due_date). Additive only.
alter table projects add column if not exists first_revision_date date;
