-- FIX: clients could not view project revisions. project_revisions had only
-- team-scoped SELECT policies (creative/editor), so a client's review page
-- query returned zero rows and failed to open, and the projects list showed
-- no review buttons. Clients already have UPDATE + comment policies; only the
-- SELECT was missing. Additive — does not modify or drop any existing policy.
drop policy if exists "Clients see revisions for own projects" on project_revisions;
create policy "Clients see revisions for own projects"
on project_revisions for select
to authenticated
using (
  exists (
    select 1 from projects p
    join clients c on c.id = p.client_id
    where p.id = project_revisions.project_id
      and c.profile_id = auth.uid()
  )
);
