-- Optional inspiration / reference links per project (moodboards, examples).
-- Edited by the team on the project page; mirrors shoots.inspiration_links.
alter table projects
  add column if not exists inspiration_links text[] not null default '{}';
