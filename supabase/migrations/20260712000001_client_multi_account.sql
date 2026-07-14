-- One client, up to TWO login accounts.
-- client_members is the membership table (primary account backfilled in).
-- Every policy below is ADDITIVE — existing profile_id-based policies are
-- untouched; permissive policies OR together, so primary accounts keep
-- working exactly as before and members gain the same access.

drop function if exists _tmp_pol();

create table client_members (
  client_id  uuid not null references clients(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, profile_id)
);

-- Cap: max 2 accounts per client (for now)
create or replace function enforce_client_member_cap()
returns trigger language plpgsql as $$
begin
  if (select count(*) from client_members where client_id = new.client_id) >= 2 then
    raise exception 'A client can have at most 2 login accounts for now.';
  end if;
  return new;
end; $$;
create trigger trg_client_member_cap
  before insert on client_members
  for each row execute function enforce_client_member_cap();

-- Backfill: every existing primary account becomes a member
insert into client_members (client_id, profile_id)
select id, profile_id from clients where profile_id is not null
on conflict do nothing;

-- Membership helper (used by all mirror policies below)
create or replace function _my_member_client_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select client_id from client_members where profile_id = auth.uid();
$$;

-- RLS on the membership table itself
alter table client_members enable row level security;
create policy "admins manage client_members" on client_members
  for all to authenticated using (_is_admin()) with check (_is_admin());
create policy "members see own memberships" on client_members
  for select to authenticated using (profile_id = auth.uid());

-- ── Member mirrors of every client-access policy (additive) ────────────
create policy "members select own client" on clients
  for select to authenticated
  using (id in (select _my_member_client_ids()));

create policy "members view own projects" on projects
  for select to authenticated
  using (client_id in (select _my_member_client_ids()));
create policy "members update own project stage" on projects
  for update to authenticated
  using (client_id in (select _my_member_client_ids()))
  with check (client_id in (select _my_member_client_ids()));

create policy "members see revisions" on project_revisions
  for select to authenticated
  using (exists (select 1 from projects p where p.id = project_revisions.project_id
                 and p.client_id in (select _my_member_client_ids())));
create policy "members update revisions" on project_revisions
  for update to authenticated
  using (exists (select 1 from projects p where p.id = project_revisions.project_id
                 and p.client_id in (select _my_member_client_ids())))
  with check (exists (select 1 from projects p where p.id = project_revisions.project_id
                 and p.client_id in (select _my_member_client_ids())));

create policy "members see project_shoots" on project_shoots
  for select to authenticated
  using (exists (select 1 from projects p where p.id = project_shoots.project_id
                 and p.client_id in (select _my_member_client_ids())));

create policy "members manage revision_comments" on revision_comments
  for all to authenticated
  using (exists (select 1 from project_revisions pr join projects p on p.id = pr.project_id
                 where pr.id = revision_comments.revision_id
                   and p.client_id in (select _my_member_client_ids())))
  with check (exists (select 1 from project_revisions pr join projects p on p.id = pr.project_id
                 where pr.id = revision_comments.revision_id
                   and p.client_id in (select _my_member_client_ids())));

create policy "members see photo_comments" on photo_revision_comments
  for select to authenticated
  using (exists (select 1 from project_revisions pr join projects p on p.id = pr.project_id
                 where pr.id = photo_revision_comments.revision_id
                   and p.client_id in (select _my_member_client_ids())));
create policy "members add photo_comments" on photo_revision_comments
  for insert to authenticated
  with check (exists (select 1 from project_revisions pr join projects p on p.id = pr.project_id
                 where pr.id = photo_revision_comments.revision_id
                   and p.client_id in (select _my_member_client_ids())));

create policy "members view own shoots" on shoots
  for select to authenticated
  using (client_id in (select _my_member_client_ids()));

create policy "members select shoot_uploads" on shoot_uploads
  for select to authenticated
  using (client_id in (select _my_member_client_ids()));
create policy "members insert shoot_uploads" on shoot_uploads
  for insert to authenticated
  with check (client_id in (select _my_member_client_ids()));

create policy "members select drafts" on content_drafts
  for select to authenticated
  using (client_id in (select _my_member_client_ids()));
create policy "members insert drafts" on content_drafts
  for insert to authenticated
  with check (client_id in (select _my_member_client_ids()));
create policy "members update drafts" on content_drafts
  for update to authenticated
  using (client_id in (select _my_member_client_ids()))
  with check (client_id in (select _my_member_client_ids()));

create policy "members select draft_versions" on content_draft_versions
  for select to authenticated
  using (exists (select 1 from content_drafts d where d.id = content_draft_versions.draft_id
                 and d.client_id in (select _my_member_client_ids())));
create policy "members update draft_versions" on content_draft_versions
  for update to authenticated
  using (exists (select 1 from content_drafts d where d.id = content_draft_versions.draft_id
                 and d.client_id in (select _my_member_client_ids())))
  with check (exists (select 1 from content_drafts d where d.id = content_draft_versions.draft_id
                 and d.client_id in (select _my_member_client_ids())));

create policy "members manage draft_comments" on draft_version_comments
  for all to authenticated
  using (exists (select 1 from content_draft_versions v join content_drafts d on d.id = v.draft_id
                 where v.id = draft_version_comments.version_id
                   and d.client_id in (select _my_member_client_ids())))
  with check (exists (select 1 from content_draft_versions v join content_drafts d on d.id = v.draft_id
                 where v.id = draft_version_comments.version_id
                   and d.client_id in (select _my_member_client_ids())));
