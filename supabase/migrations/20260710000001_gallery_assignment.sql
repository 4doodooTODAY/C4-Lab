-- Gallery Links: assignable to a creative/editor who can then manage uploads.
-- ⚠️ REPLACES the broad authenticated policies on one_off_shoots /
-- one_off_shoot_images / shoot_leads: previously ANY authenticated user could
-- read them. Now: admins see everything; creatives/editors see only galleries
-- assigned to them. Public (anon) access is unchanged — it flows through the
-- SECURITY DEFINER functions, which bypass RLS.

alter table one_off_shoots
  add column if not exists assigned_profile_id uuid references profiles(id) on delete set null;

create or replace function _is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ── one_off_shoots ─────────────────────────────────────────────
drop policy if exists "authenticated_select_one_off_shoots" on one_off_shoots;
drop policy if exists "authenticated_insert_one_off_shoots" on one_off_shoots;
drop policy if exists "authenticated_update_one_off_shoots" on one_off_shoots;

create policy "admin_all_one_off_shoots" on one_off_shoots
  for all to authenticated using (_is_admin()) with check (_is_admin());
create policy "assigned_select_one_off_shoots" on one_off_shoots
  for select to authenticated using (assigned_profile_id = auth.uid());

-- ── one_off_shoot_images ───────────────────────────────────────
drop policy if exists "auth_all_oosi" on one_off_shoot_images;

create policy "admin_all_oosi" on one_off_shoot_images
  for all to authenticated using (_is_admin()) with check (_is_admin());
create policy "assigned_all_oosi" on one_off_shoot_images
  for all to authenticated
  using (exists (select 1 from one_off_shoots s
                 where s.id = one_off_shoot_images.shoot_id
                   and s.assigned_profile_id = auth.uid()))
  with check (exists (select 1 from one_off_shoots s
                      where s.id = one_off_shoot_images.shoot_id
                        and s.assigned_profile_id = auth.uid()));

-- ── shoot_leads (admins + assigned team can read; inserts stay via fn) ──
drop policy if exists "authenticated_select_shoot_leads" on shoot_leads;
drop policy if exists "authenticated_insert_shoot_leads" on shoot_leads;
drop policy if exists "authenticated_update_shoot_leads" on shoot_leads;

create policy "admin_all_shoot_leads" on shoot_leads
  for all to authenticated using (_is_admin()) with check (_is_admin());
create policy "assigned_select_shoot_leads" on shoot_leads
  for select to authenticated
  using (exists (select 1 from one_off_shoots s
                 where s.id = shoot_leads.shoot_id
                   and s.assigned_profile_id = auth.uid()));

-- Favorites / comments: assigned team can read proofing feedback too
drop policy if exists "auth_select_oosf" on one_off_shoot_favorites;
create policy "team_select_oosf" on one_off_shoot_favorites
  for select to authenticated
  using (_is_admin() or exists (
    select 1 from one_off_shoot_images i
    join one_off_shoots s on s.id = i.shoot_id
    where i.id = one_off_shoot_favorites.image_id
      and s.assigned_profile_id = auth.uid()));

drop policy if exists "auth_select_oosc" on one_off_shoot_image_comments;
create policy "team_select_oosc" on one_off_shoot_image_comments
  for select to authenticated
  using (_is_admin() or exists (
    select 1 from one_off_shoot_images i
    join one_off_shoots s on s.id = i.shoot_id
    where i.id = one_off_shoot_image_comments.image_id
      and s.assigned_profile_id = auth.uid()));
