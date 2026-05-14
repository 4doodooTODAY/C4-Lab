-- ── Projects V2 Migration ────────────────────────────────────────────────────
-- Run this after the base projects_migration.sql

-- Add new columns to projects
alter table projects
  add column if not exists location text,
  add column if not exists shoot_date date,
  add column if not exists creative_id uuid references profiles(id) on delete set null,
  add column if not exists editor_id uuid references profiles(id) on delete set null,
  add column if not exists revision_count int not null default 0;

-- ── Shoot Uploads ─────────────────────────────────────────────────────────────
create table if not exists shoot_uploads (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  file_url     text not null,
  file_name    text not null,
  file_size    bigint,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Shoot Notes ───────────────────────────────────────────────────────────────
create table if not exists shoot_notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ── Project Revisions ─────────────────────────────────────────────────────────
create table if not exists project_revisions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  revision_number int not null,
  video_url       text not null,
  status          text not null default 'pending_creative_review'
                  check (status in ('pending_creative_review','pending_client_review','pending_editor','approved')),
  uploaded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ── Revision Comments ─────────────────────────────────────────────────────────
create table if not exists revision_comments (
  id                uuid primary key default gen_random_uuid(),
  revision_id       uuid not null references project_revisions(id) on delete cascade,
  author_id         uuid references profiles(id) on delete set null,
  timestamp_seconds float not null,
  content           text not null,
  status            text not null default 'pending'
                    check (status in ('pending','accepted','declined')),
  created_at        timestamptz not null default now()
);

-- ── Enable Realtime ───────────────────────────────────────────────────────────
alter publication supabase_realtime add table project_revisions;
alter publication supabase_realtime add table revision_comments;

-- ── Storage Buckets ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('shoot-footage', 'shoot-footage', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('revision-videos', 'revision-videos', true)
on conflict (id) do nothing;

-- ── Storage Policies ──────────────────────────────────────────────────────────

-- shoot-footage: authenticated users can upload
create policy "Authenticated users can upload shoot footage"
on storage.objects for insert
to authenticated
with check (bucket_id = 'shoot-footage');

-- shoot-footage: admins and creatives can view
create policy "Admins and creatives can view shoot footage"
on storage.objects for select
to authenticated
using (
  bucket_id = 'shoot-footage'
  and (
    (select role from profiles where id = auth.uid()) in ('admin', 'creative')
  )
);

-- revision-videos: authenticated users can upload
create policy "Authenticated users can upload revision videos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'revision-videos');

-- revision-videos: anyone can view (public bucket)
create policy "Anyone can view revision videos"
on storage.objects for select
using (bucket_id = 'revision-videos');

-- ── RLS Policies ──────────────────────────────────────────────────────────────

-- shoot_uploads
alter table shoot_uploads enable row level security;

create policy "Admins can do everything on shoot_uploads"
on shoot_uploads for all
to authenticated
using ((select role from profiles where id = auth.uid()) = 'admin')
with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy "Project members can select shoot_uploads"
on shoot_uploads for select
to authenticated
using (
  exists (
    select 1 from project_members pm
    where pm.project_id = shoot_uploads.project_id
    and pm.profile_id = auth.uid()
  )
  or (select role from profiles where id = auth.uid()) = 'admin'
  or exists (
    select 1 from projects p
    where p.id = shoot_uploads.project_id
    and (p.creative_id = auth.uid() or p.editor_id = auth.uid())
  )
);

create policy "Creatives can insert shoot_uploads"
on shoot_uploads for insert
to authenticated
with check (
  (select role from profiles where id = auth.uid()) in ('admin', 'creative')
  and uploaded_by = auth.uid()
);

-- shoot_notes
alter table shoot_notes enable row level security;

create policy "Admins can do everything on shoot_notes"
on shoot_notes for all
to authenticated
using ((select role from profiles where id = auth.uid()) = 'admin')
with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy "Project members can select shoot_notes"
on shoot_notes for select
to authenticated
using (
  exists (
    select 1 from project_members pm
    where pm.project_id = shoot_notes.project_id
    and pm.profile_id = auth.uid()
  )
  or (select role from profiles where id = auth.uid()) = 'admin'
  or exists (
    select 1 from projects p
    where p.id = shoot_notes.project_id
    and (p.creative_id = auth.uid() or p.editor_id = auth.uid())
  )
);

create policy "Creatives can insert shoot_notes"
on shoot_notes for insert
to authenticated
with check (
  (select role from profiles where id = auth.uid()) in ('admin', 'creative')
  and author_id = auth.uid()
);

-- project_revisions
alter table project_revisions enable row level security;

create policy "Admins can do everything on project_revisions"
on project_revisions for all
to authenticated
using ((select role from profiles where id = auth.uid()) = 'admin')
with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy "Project members can select revisions"
on project_revisions for select
to authenticated
using (
  exists (
    select 1 from project_members pm
    where pm.project_id = project_revisions.project_id
    and pm.profile_id = auth.uid()
  )
  or (select role from profiles where id = auth.uid()) = 'admin'
  or exists (
    select 1 from projects p
    where p.id = project_revisions.project_id
    and (p.creative_id = auth.uid() or p.editor_id = auth.uid() or p.client_id = auth.uid())
  )
);

create policy "Editors can insert revisions"
on project_revisions for insert
to authenticated
with check (
  (select role from profiles where id = auth.uid()) in ('admin', 'creative')
  and uploaded_by = auth.uid()
);

create policy "Project participants can update revisions"
on project_revisions for update
to authenticated
using (
  (select role from profiles where id = auth.uid()) in ('admin', 'creative')
  or exists (
    select 1 from projects p
    where p.id = project_revisions.project_id
    and (p.creative_id = auth.uid() or p.editor_id = auth.uid())
  )
)
with check (true);

-- revision_comments
alter table revision_comments enable row level security;

create policy "Admins can do everything on revision_comments"
on revision_comments for all
to authenticated
using ((select role from profiles where id = auth.uid()) = 'admin')
with check ((select role from profiles where id = auth.uid()) = 'admin');

create policy "Project participants can select comments"
on revision_comments for select
to authenticated
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id
    and (
      (select role from profiles where id = auth.uid()) = 'admin'
      or p.creative_id = auth.uid()
      or p.editor_id = auth.uid()
      or p.client_id = auth.uid()
      or exists (
        select 1 from project_members pm
        where pm.project_id = p.id and pm.profile_id = auth.uid()
      )
    )
  )
);

create policy "Participants can insert comments"
on revision_comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id
    and (
      (select role from profiles where id = auth.uid()) = 'admin'
      or p.creative_id = auth.uid()
      or p.editor_id = auth.uid()
      or p.client_id = auth.uid()
    )
  )
);

create policy "Clients can update comment status"
on revision_comments for update
to authenticated
using (
  exists (
    select 1 from project_revisions pr
    join projects p on p.id = pr.project_id
    where pr.id = revision_comments.revision_id
    and (
      p.client_id = auth.uid()
      or (select role from profiles where id = auth.uid()) = 'admin'
    )
  )
)
with check (true);
