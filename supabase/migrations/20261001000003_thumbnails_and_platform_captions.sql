-- 1. Thumbnails for video cuts, versioned, with pin comments
-- 2. Optional per-platform captions on projects
--
-- Access is decided by two helpers so every policy below says the same thing:
--   _team_on_project  admin, or a creative/editor on the project (direct,
--                     multi-editor table, or assigned at the client level)
--   _can_see_project  the team above, plus every login on the project's client

create or replace function _team_on_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles pr where pr.id = auth.uid() and (
      pr.role = 'admin'
      or (pr.role in ('creative', 'editor') and exists (
        select 1 from projects p
        where p.id = p_project_id
          and (p.creative_id = auth.uid()
            or p.editor_id = auth.uid()
            or exists (select 1 from project_editors pe where pe.project_id = p.id and pe.profile_id = auth.uid())
            or exists (select 1 from client_creatives cc where cc.client_id = p.client_id and cc.profile_id = auth.uid()))
      ))
    )
  );
$$;

create or replace function _can_see_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _team_on_project(p_project_id) or exists (
    select 1 from projects p
    where p.id = p_project_id
      and (p.client_id in (select _my_member_client_ids())
        or exists (select 1 from clients c where c.id = p.client_id and c.profile_id = auth.uid()))
  );
$$;

create or replace function _revision_project(p_revision_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from project_revisions where id = p_revision_id;
$$;

-- ── Thumbnails ────────────────────────────────────────────────────────────
create table if not exists revision_thumbnails (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references project_revisions(id) on delete cascade,
  version     integer not null,
  image_url   text not null,
  uploaded_by uuid references profiles(id) on delete set null default auth.uid(),
  status      text not null default 'in_review'
              check (status in ('in_review', 'approved', 'changes_requested')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (revision_id, version)
);
create index if not exists revision_thumbnails_revision_idx on revision_thumbnails (revision_id);

alter table revision_thumbnails enable row level security;
create policy "see thumbnails on visible projects" on revision_thumbnails
  for select to authenticated using (_can_see_project(_revision_project(revision_id)));
create policy "team adds thumbnails" on revision_thumbnails
  for insert to authenticated with check (_team_on_project(_revision_project(revision_id)));
create policy "team updates thumbnails" on revision_thumbnails
  for update to authenticated
  using (_team_on_project(_revision_project(revision_id)))
  with check (_team_on_project(_revision_project(revision_id)));
create policy "team deletes thumbnails" on revision_thumbnails
  for delete to authenticated using (_team_on_project(_revision_project(revision_id)));

create table if not exists thumbnail_comments (
  id           uuid primary key default gen_random_uuid(),
  thumbnail_id uuid not null references revision_thumbnails(id) on delete cascade,
  x_pct        numeric(5,2) not null check (x_pct between 0 and 100),
  y_pct        numeric(5,2) not null check (y_pct between 0 and 100),
  body         text not null check (length(btrim(body)) > 0),
  profile_id   uuid not null references profiles(id) on delete cascade default auth.uid(),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_at   timestamptz not null default now()
);
create index if not exists thumbnail_comments_thumb_idx on thumbnail_comments (thumbnail_id);

create or replace function _thumbnail_project(p_thumbnail_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.project_id from revision_thumbnails t
  join project_revisions r on r.id = t.revision_id
  where t.id = p_thumbnail_id;
$$;

alter table thumbnail_comments enable row level security;
create policy "see thumbnail comments" on thumbnail_comments
  for select to authenticated using (_can_see_project(_thumbnail_project(thumbnail_id)));
create policy "add own thumbnail comments" on thumbnail_comments
  for insert to authenticated
  with check (profile_id = auth.uid() and _can_see_project(_thumbnail_project(thumbnail_id)));
create policy "team or author resolves thumbnail comments" on thumbnail_comments
  for update to authenticated
  using (profile_id = auth.uid() or _team_on_project(_thumbnail_project(thumbnail_id)))
  with check (profile_id = auth.uid() or _team_on_project(_thumbnail_project(thumbnail_id)));
create policy "author or team deletes thumbnail comments" on thumbnail_comments
  for delete to authenticated
  using (profile_id = auth.uid() or _team_on_project(_thumbnail_project(thumbnail_id)));

-- Approve or request changes. Clients can do this but cannot otherwise edit
-- thumbnail rows, so it goes through a function that touches only status.
create or replace function review_thumbnail(p_thumbnail_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('approved', 'changes_requested', 'in_review') then
    raise exception 'Unknown status.';
  end if;
  if not _can_see_project(_thumbnail_project(p_thumbnail_id)) then
    raise exception 'You are not on this project.';
  end if;
  update revision_thumbnails
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_thumbnail_id;
end; $$;
revoke all on function review_thumbnail(uuid, text) from public, anon;
grant execute on function review_thumbnail(uuid, text) to authenticated;

-- ── Platform captions ─────────────────────────────────────────────────────
-- {"instagram": "...", "tiktok": "...", "linkedin": "...", "youtube": "...", "facebook": "..."}
alter table projects add column if not exists caption_platforms jsonb not null default '{}'::jsonb;

-- Saves one caption field without touching the rest, so two people editing
-- different platforms at once never overwrite each other. p_platform null
-- means the main caption concept.
create or replace function set_project_caption(p_project_id uuid, p_platform text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not _team_on_project(p_project_id) then
    raise exception 'Only the team can edit captions.';
  end if;
  if p_platform is null then
    update projects set caption_concept = v_text where id = p_project_id;
  elsif p_platform in ('instagram', 'tiktok', 'linkedin', 'youtube', 'facebook') then
    update projects
       set caption_platforms = case
             when v_text is null then caption_platforms - p_platform
             else caption_platforms || jsonb_build_object(p_platform, v_text)
           end
     where id = p_project_id;
  else
    raise exception 'Unknown platform.';
  end if;
end; $$;
revoke all on function set_project_caption(uuid, text, text) from public, anon;
grant execute on function set_project_caption(uuid, text, text) to authenticated;

revoke all on function _team_on_project(uuid), _can_see_project(uuid), _revision_project(uuid), _thumbnail_project(uuid) from public, anon;
grant execute on function _team_on_project(uuid), _can_see_project(uuid), _revision_project(uuid), _thumbnail_project(uuid) to authenticated;
