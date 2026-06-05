-- Allow assigned team members (creative / editor) to update content_drafts.
-- Previously only admins and the owning client could update, which silently
-- blocked the editor auto-assign and the new editor/creative "Publish" button.
-- Scope: the draft's assigned_editor_id, OR any creative/editor assigned to the
-- draft's client via client_creatives.
drop policy if exists "Team can update content_drafts" on content_drafts;
create policy "Team can update content_drafts"
  on content_drafts
  for update
  to authenticated
  using (
    content_drafts.assigned_editor_id = auth.uid()
    or exists (
      select 1
      from client_creatives cc
      join profiles p on p.id = auth.uid()
      where cc.client_id = content_drafts.client_id
        and cc.profile_id = auth.uid()
        and p.role in ('creative', 'editor')
    )
  )
  with check (
    content_drafts.assigned_editor_id = auth.uid()
    or exists (
      select 1
      from client_creatives cc
      join profiles p on p.id = auth.uid()
      where cc.client_id = content_drafts.client_id
        and cc.profile_id = auth.uid()
        and p.role in ('creative', 'editor')
    )
  );
