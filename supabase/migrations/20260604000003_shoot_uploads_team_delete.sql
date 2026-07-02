-- Let assigned team members remove uploads.
-- Admins and creatives already have ALL via "Admins and creatives can manage
-- shoot uploads", but editors/team_leads had no DELETE — so the new "X / Remove"
-- button on project & shoot file lists silently failed for them.
drop policy if exists "Team can delete shoot_uploads" on shoot_uploads;
create policy "Team can delete shoot_uploads"
  on shoot_uploads
  for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'creative', 'editor', 'team_lead')
    )
  );
