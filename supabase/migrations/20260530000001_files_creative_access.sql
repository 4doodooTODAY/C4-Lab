-- ============================================================
-- File System — Creative Access
-- Creatives can read shoot_uploads for clients they are assigned to.
-- Run in Supabase SQL Editor.
-- ============================================================

alter table shoot_uploads enable row level security;

-- Drop old policies (safe if not present)
drop policy if exists "Admins can do everything on shoot_uploads"  on shoot_uploads;
drop policy if exists "Project members can select shoot_uploads"   on shoot_uploads;
drop policy if exists "Creatives can insert shoot_uploads"         on shoot_uploads;
drop policy if exists "Creatives read assigned client uploads"     on shoot_uploads;

-- Admin: full access
create policy "Admins can do everything on shoot_uploads"
  on shoot_uploads for all
  using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Creative / editor: read uploads for clients they are assigned to
create policy "Creatives read assigned client uploads"
  on shoot_uploads for select
  using (
    -- via client_creatives (team member assigned to the client)
    exists (
      select 1 from client_creatives cc
      where cc.profile_id = auth.uid()
        and cc.client_id  = shoot_uploads.client_id
    )
    -- or they are the assigned photographer on the shoot
    or exists (
      select 1 from shoots s
      where s.id = shoot_uploads.shoot_id
        and s.photographer_id = auth.uid()
    )
    -- or they are the assigned editor/creative on the linked project
    or exists (
      select 1 from projects p
      where p.id = shoot_uploads.project_id
        and (p.editor_id = auth.uid() or p.creative_id = auth.uid())
    )
  );

-- Creative / editor: can insert uploads (uploading footage)
create policy "Creatives can insert shoot_uploads"
  on shoot_uploads for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'creative', 'editor')
    )
  );
