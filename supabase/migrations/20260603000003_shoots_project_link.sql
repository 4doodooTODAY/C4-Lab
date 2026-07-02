-- Optionally link a shoot to a project.
-- Shoots remain client-scoped; project_id is nullable so the link is entirely optional.
alter table shoots
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists idx_shoots_project_id on shoots(project_id);
