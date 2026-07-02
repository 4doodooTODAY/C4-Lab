-- ============================================================
-- Client Projects Fix — adds missing columns that MyProjects.jsx
-- queries but that were never migrated into the database.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Add media_type to projects (photo vs video)
alter table projects
  add column if not exists media_type    text default 'video'
    check (media_type in ('video','photo')),
  add column if not exists max_revisions int  default 3;

-- Add media_type to project_revisions (photo revision vs video cut)
alter table project_revisions
  add column if not exists media_type text default 'video'
    check (media_type in ('video','photo'));
