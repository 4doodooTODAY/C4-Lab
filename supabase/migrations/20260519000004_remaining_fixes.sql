-- Allow clients to insert content_drafts (for "Request Content" from calendar)
drop policy if exists "clients can create drafts" on content_drafts;
create policy "clients can create drafts"
  on content_drafts for insert
  to authenticated
  with check (
    exists(select 1 from clients where profile_id = auth.uid() and id = content_drafts.client_id)
  );

-- Allow creatives to update shoots for mark done (may already exist, use drop if exists)
drop policy if exists "creatives can update assigned client shoots" on shoots;
create policy "creatives can update assigned client shoots"
  on shoots for update to authenticated
  using (
    exists(
      select 1 from client_creatives cc
      where cc.client_id = shoots.client_id and cc.profile_id = auth.uid()
    )
  )
  with check (
    exists(
      select 1 from client_creatives cc
      where cc.client_id = shoots.client_id and cc.profile_id = auth.uid()
    )
  );
