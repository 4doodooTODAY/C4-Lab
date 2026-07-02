-- Fix shoot_uploads table: make project_id nullable, add missing columns
alter table shoot_uploads
  alter column project_id drop not null;

alter table shoot_uploads
  add column if not exists client_id uuid references clients(id) on delete set null,
  add column if not exists notes     text;

-- Drop old broken SELECT policy (references project_members which may not exist)
drop policy if exists "Project members can select shoot_uploads" on shoot_uploads;

-- New SELECT: admins see all, creatives see uploads for their client's shoots,
-- clients see uploads for their own shoots/projects
create policy "Select shoot_uploads"
  on shoot_uploads for select
  to authenticated
  using (
    -- admins
    (select role from profiles where id = auth.uid()) = 'admin'
    -- creatives assigned to this client
    or exists (
      select 1 from client_creatives cc
      where cc.profile_id = auth.uid()
        and (
          cc.client_id = shoot_uploads.client_id
          or cc.client_id = (select client_id from projects where id = shoot_uploads.project_id)
          or cc.client_id = (select client_id from shoots    where id = shoot_uploads.shoot_id)
        )
    )
    -- editor or creative on the project
    or exists (
      select 1 from projects p
      where p.id = shoot_uploads.project_id
        and (p.creative_id = auth.uid() or p.editor_id = auth.uid())
    )
    -- client viewing their own uploads
    or exists (
      select 1 from clients c
      where c.profile_id = auth.uid()
        and (
          c.id = shoot_uploads.client_id
          or c.id = (select client_id from projects where id = shoot_uploads.project_id)
          or c.id = (select client_id from shoots    where id = shoot_uploads.shoot_id)
        )
    )
  );

-- Allow clients to insert their own footage uploads
drop policy if exists "Clients can insert shoot_uploads" on shoot_uploads;
create policy "Clients can insert shoot_uploads"
  on shoot_uploads for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (select role from profiles where id = auth.uid()) = 'client'
  );
