-- Allow creatives to update shoots for their assigned clients (needed for Mark Done)
create policy "creatives can update assigned client shoots"
  on shoots for update to authenticated
  using (
    exists(
      select 1 from client_creatives cc
      where cc.client_id = shoots.client_id
        and cc.profile_id = auth.uid()
    )
  )
  with check (
    exists(
      select 1 from client_creatives cc
      where cc.client_id = shoots.client_id
        and cc.profile_id = auth.uid()
    )
  );
