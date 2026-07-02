-- Allow clients to read their own projects
-- Looks up auth.uid() → clients.profile_id → clients.id → projects.client_id
create policy "clients can view own projects"
  on projects
  for select
  to authenticated
  using (
    client_id in (
      select id from clients where profile_id = auth.uid()
    )
  );
