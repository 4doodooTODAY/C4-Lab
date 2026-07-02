-- ── content_draft_versions ─────────────────────────────────────────────────────
-- Stores Draft 1 / Draft 2 / Draft 3 uploads for each content_draft.
-- Supports both video (timestamped comments) and photo sets (pin-drop comments).

create table if not exists content_draft_versions (
  id             uuid default gen_random_uuid() primary key,
  draft_id       uuid not null references content_drafts(id) on delete cascade,
  version_number int not null default 1,
  video_url      text,
  photo_urls     text[],
  status         text not null default 'pending_client_review'
    check (status in ('pending_client_review', 'pending_editor', 'approved')),
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz default now()
);

-- ── draft_version_comments ─────────────────────────────────────────────────────
-- Timestamped (video) or pin-drop (photo) comments on a draft version.

create table if not exists draft_version_comments (
  id                uuid default gen_random_uuid() primary key,
  version_id        uuid not null references content_draft_versions(id) on delete cascade,
  author_id         uuid references profiles(id) on delete set null,
  -- video comments
  timestamp_seconds float,
  -- photo comments
  pin_x             float,
  pin_y             float,
  photo_index       int default 0,
  -- shared
  content           text not null,
  status            text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at        timestamptz default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table content_draft_versions enable row level security;
alter table draft_version_comments enable row level security;

-- Admins: full access
drop policy if exists "admins manage draft_versions" on content_draft_versions;
create policy "admins manage draft_versions" on content_draft_versions
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists(select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Creatives/editors: full access (they upload the drafts)
drop policy if exists "team manage draft_versions" on content_draft_versions;
create policy "team manage draft_versions" on content_draft_versions
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role in ('creative', 'editor', 'admin')))
  with check (exists(select 1 from profiles where id = auth.uid() and role in ('creative', 'editor', 'admin')));

-- Clients: can view and approve their own draft versions
drop policy if exists "clients view own draft_versions" on content_draft_versions;
create policy "clients view own draft_versions" on content_draft_versions
  for select to authenticated
  using (
    exists(
      select 1 from content_drafts cd
      join clients c on c.id = cd.client_id
      where cd.id = content_draft_versions.draft_id
        and c.profile_id = auth.uid()
    )
  );

drop policy if exists "clients update draft_version status" on content_draft_versions;
create policy "clients update draft_version status" on content_draft_versions
  for update to authenticated
  using (
    exists(
      select 1 from content_drafts cd
      join clients c on c.id = cd.client_id
      where cd.id = content_draft_versions.draft_id
        and c.profile_id = auth.uid()
    )
  )
  with check (true);

-- Comments: admins + team
drop policy if exists "admins manage draft_comments" on draft_version_comments;
create policy "admins manage draft_comments" on draft_version_comments
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists(select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "team manage draft_comments" on draft_version_comments;
create policy "team manage draft_comments" on draft_version_comments
  for all to authenticated
  using  (exists(select 1 from profiles where id = auth.uid() and role in ('creative', 'editor', 'admin')))
  with check (exists(select 1 from profiles where id = auth.uid() and role in ('creative', 'editor', 'admin')));

-- Comments: clients can read and write their own
drop policy if exists "clients manage draft_comments" on draft_version_comments;
create policy "clients manage draft_comments" on draft_version_comments
  for all to authenticated
  using (
    exists(
      select 1 from content_draft_versions cdv
      join content_drafts cd on cd.id = cdv.draft_id
      join clients c on c.id = cd.client_id
      where cdv.id = draft_version_comments.version_id
        and c.profile_id = auth.uid()
    )
  )
  with check (
    exists(
      select 1 from content_draft_versions cdv
      join content_drafts cd on cd.id = cdv.draft_id
      join clients c on c.id = cd.client_id
      where cdv.id = draft_version_comments.version_id
        and c.profile_id = auth.uid()
    )
  );

-- Enable realtime for live comment updates
alter publication supabase_realtime add table content_draft_versions;
alter publication supabase_realtime add table draft_version_comments;
